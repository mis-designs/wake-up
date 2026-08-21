(function initializeMagicBookLearningSync(root) {
  "use strict";

  const LEARNING_SYNC_CONFIG = Object.freeze({
    databaseName: "MagicBookLearningLocal",
    databaseVersion: 2,
    outboxStoreName: "learning_outbox",
    insightsStoreName: "learning_insights_cache",
    endpoint: "/api/learning-sync",
    maxBatchSize: 25,
    flushIntervalMs: 15_000,
    flushJitterMs: 2_500,
    maxConcurrentSyncs: 1,
    requestTimeoutMs: 12_000,
    maxRetryDelayMs: 15 * 60_000,
    maxRetryAfterMs: 24 * 60 * 60_000,
    syncedRetentionMs: 24 * 60 * 60_000,
    sendingStaleMs: 2 * 60_000,
    circuitFailureThreshold: 4,
    circuitCooldownMs: 60_000
  });

  const RETRYABLE_HTTP_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
  const BACKOFF_STEPS_MS = Object.freeze([5_000, 15_000, 30_000, 60_000, 120_000]);
  const OUTBOX_STATUSES = new Set(["pending", "sending", "synced", "retry", "failed"]);

  function nowIso(now = Date.now()) {
    return new Date(now).toISOString();
  }

  function normalizedUserId(value) {
    let userId = String(value || "").replace(/\D/g, "");
    if (userId.startsWith("39") && userId.length === 12) userId = userId.slice(2);
    return userId;
  }

  function randomIdPart() {
    if (root.crypto?.randomUUID) return root.crypto.randomUUID().replace(/-/g, "");
    if (root.crypto?.getRandomValues) {
      const bytes = new Uint8Array(16);
      root.crypto.getRandomValues(bytes);
      return Array.from(bytes, value => value.toString(16).padStart(2, "0")).join("");
    }
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 18)}`;
  }

  function generateLearningEventId(prefix) {
    return `${String(prefix || "evt").replace(/[^a-z0-9]/gi, "").toLowerCase()}_${randomIdPart()}`;
  }

  function calculateBackoffMs(retryCount, random = Math.random) {
    const index = Math.max(0, Number(retryCount) - 1);
    const base = index < BACKOFF_STEPS_MS.length
      ? BACKOFF_STEPS_MS[index]
      : Math.min(
          LEARNING_SYNC_CONFIG.maxRetryDelayMs,
          BACKOFF_STEPS_MS.at(-1) * Math.pow(2, index - BACKOFF_STEPS_MS.length + 1)
        );
    const jitterMultiplier = 0.8 + Math.max(0, Math.min(1, Number(random()) || 0)) * 0.4;
    return Math.min(LEARNING_SYNC_CONFIG.maxRetryDelayMs, Math.round(base * jitterMultiplier));
  }

  function parseRetryAfterMs(value, now = Date.now()) {
    const header = String(value || "").trim();
    if (!header) return 0;
    if (/^\d+(?:\.\d+)?$/.test(header)) {
      return Math.max(0, Math.ceil(Number(header) * 1000));
    }
    const date = Date.parse(header);
    return Number.isFinite(date) ? Math.max(0, date - now) : 0;
  }

  function requestResult(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("indexeddb_request_failed"));
    });
  }

  function transactionDone(transaction) {
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error("indexeddb_transaction_failed"));
      transaction.onabort = () => reject(transaction.error || new Error("indexeddb_transaction_aborted"));
    });
  }

  class LearningOutbox {
    constructor({ indexedDb = root.indexedDB, now = () => Date.now(), onStorageError = null } = {}) {
      this.indexedDb = indexedDb;
      this.now = now;
      this.onStorageError = onStorageError;
      this.databasePromise = null;
      this.memoryRecords = new Map();
      this.memoryInsights = new Map();
      this.memorySequence = 0;
      this.useMemoryFallback = !indexedDb;
    }

    async open() {
      if (this.useMemoryFallback) throw new Error("indexeddb_unavailable");
      if (this.databasePromise) return this.databasePromise;
      this.databasePromise = new Promise((resolve, reject) => {
        const request = this.indexedDb.open(
          LEARNING_SYNC_CONFIG.databaseName,
          LEARNING_SYNC_CONFIG.databaseVersion
        );
        request.onupgradeneeded = () => {
          const database = request.result;
          if (!database.objectStoreNames.contains(LEARNING_SYNC_CONFIG.outboxStoreName)) {
            const store = database.createObjectStore(LEARNING_SYNC_CONFIG.outboxStoreName, {
              keyPath: "local_id",
              autoIncrement: true
            });
            store.createIndex("event_id", "event_id", { unique: true });
            store.createIndex("status", "status", { unique: false });
            store.createIndex("next_retry_at", "next_retry_at", { unique: false });
          }
          if (!database.objectStoreNames.contains(LEARNING_SYNC_CONFIG.insightsStoreName)) {
            database.createObjectStore(LEARNING_SYNC_CONFIG.insightsStoreName, { keyPath: "user_id" });
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error("indexeddb_open_failed"));
        request.onblocked = () => reject(new Error("indexeddb_upgrade_blocked"));
      }).catch(error => {
        this.databasePromise = null;
        this.activateMemoryFallback(error);
        throw error;
      });
      return this.databasePromise;
    }

    activateMemoryFallback(error) {
      this.useMemoryFallback = true;
      this.onStorageError?.(error);
    }

    async add(record) {
      if (this.useMemoryFallback) return this.addMemory(record);
      try {
        const database = await this.open();
        const transaction = database.transaction(LEARNING_SYNC_CONFIG.outboxStoreName, "readwrite");
        const request = transaction.objectStore(LEARNING_SYNC_CONFIG.outboxStoreName).add(record);
        const localId = await requestResult(request);
        await transactionDone(transaction);
        return { ...record, local_id: localId };
      } catch (error) {
        if (error?.name === "ConstraintError") return this.findByEventId(record.event_id);
        this.activateMemoryFallback(error);
        return this.addMemory(record);
      }
    }

    addMemory(record) {
      const existing = [...this.memoryRecords.values()].find(item => item.event_id === record.event_id);
      if (existing) return { ...existing };
      this.memorySequence += 1;
      const stored = { ...record, local_id: `memory_${this.memorySequence}` };
      this.memoryRecords.set(stored.local_id, stored);
      return { ...stored };
    }

    async findByEventId(eventId) {
      if (this.useMemoryFallback) {
        return [...this.memoryRecords.values()].find(item => item.event_id === eventId) || null;
      }
      const database = await this.open();
      const transaction = database.transaction(LEARNING_SYNC_CONFIG.outboxStoreName, "readonly");
      const value = await requestResult(
        transaction.objectStore(LEARNING_SYNC_CONFIG.outboxStoreName).index("event_id").get(eventId)
      );
      await transactionDone(transaction);
      return value || null;
    }

    async getAll() {
      if (this.useMemoryFallback) return [...this.memoryRecords.values()].map(item => ({ ...item }));
      try {
        const database = await this.open();
        const transaction = database.transaction(LEARNING_SYNC_CONFIG.outboxStoreName, "readonly");
        const records = await requestResult(
          transaction.objectStore(LEARNING_SYNC_CONFIG.outboxStoreName).getAll()
        );
        await transactionDone(transaction);
        return records;
      } catch (error) {
        this.activateMemoryFallback(error);
        return [...this.memoryRecords.values()].map(item => ({ ...item }));
      }
    }

    async getInsightsCache(userId) {
      const key = normalizedUserId(userId);
      if (!key) return null;
      if (this.useMemoryFallback) return this.memoryInsights.get(key) || null;
      try {
        const database = await this.open();
        const transaction = database.transaction(LEARNING_SYNC_CONFIG.insightsStoreName, "readonly");
        const value = await requestResult(
          transaction.objectStore(LEARNING_SYNC_CONFIG.insightsStoreName).get(key)
        );
        await transactionDone(transaction);
        return value || null;
      } catch (error) {
        this.activateMemoryFallback(error);
        return this.memoryInsights.get(key) || null;
      }
    }

    async setInsightsCache(userId, model) {
      const key = normalizedUserId(userId);
      if (!key || !model || typeof model !== "object") return false;
      const record = { user_id: key, cached_at: this.now(), model };
      if (this.useMemoryFallback) {
        this.memoryInsights.set(key, record);
        return true;
      }
      try {
        const database = await this.open();
        const transaction = database.transaction(LEARNING_SYNC_CONFIG.insightsStoreName, "readwrite");
        transaction.objectStore(LEARNING_SYNC_CONFIG.insightsStoreName).put(record);
        await transactionDone(transaction);
        return true;
      } catch (error) {
        this.activateMemoryFallback(error);
        this.memoryInsights.set(key, record);
        return true;
      }
    }

    async claimDue(limit, userId) {
      const timestamp = this.now();
      if (this.useMemoryFallback) {
        this.recoverMemorySending(timestamp);
        const records = [...this.memoryRecords.values()]
          .filter(item => item.user_id === userId)
          .filter(item => ["pending", "retry"].includes(item.status))
          .filter(item => !item.next_retry_at || item.next_retry_at <= timestamp)
          .sort((left, right) => left.created_at - right.created_at)
          .slice(0, limit);
        records.forEach(item => {
          item.status = "sending";
          item.last_attempt_at = timestamp;
          item.updated_at = timestamp;
          this.memoryRecords.set(item.local_id, item);
        });
        return records.map(item => ({ ...item }));
      }

      try {
        const database = await this.open();
        return await new Promise((resolve, reject) => {
          const transaction = database.transaction(LEARNING_SYNC_CONFIG.outboxStoreName, "readwrite");
          const store = transaction.objectStore(LEARNING_SYNC_CONFIG.outboxStoreName);
          const request = store.getAll();
          let claimed = [];
          request.onsuccess = () => {
            const staleBefore = timestamp - LEARNING_SYNC_CONFIG.sendingStaleMs;
            request.result.forEach(record => {
              if (record.status === "sending" && Number(record.last_attempt_at || 0) <= staleBefore) {
                record.status = "retry";
                record.next_retry_at = timestamp;
                record.updated_at = timestamp;
                store.put(record);
              }
            });
            claimed = request.result
              .filter(record => record.user_id === userId)
              .filter(record => ["pending", "retry"].includes(record.status))
              .filter(record => !record.next_retry_at || record.next_retry_at <= timestamp)
              .sort((left, right) => left.created_at - right.created_at)
              .slice(0, limit)
              .map(record => ({
                ...record,
                status: "sending",
                last_attempt_at: timestamp,
                updated_at: timestamp
              }));
            claimed.forEach(record => store.put(record));
          };
          request.onerror = () => reject(request.error || new Error("indexeddb_claim_failed"));
          transaction.oncomplete = () => resolve(claimed);
          transaction.onerror = () => reject(transaction.error || new Error("indexeddb_claim_failed"));
          transaction.onabort = () => reject(transaction.error || new Error("indexeddb_claim_aborted"));
        });
      } catch (error) {
        this.activateMemoryFallback(error);
        return this.claimDue(limit, userId);
      }
    }

    recoverMemorySending(timestamp = this.now()) {
      const staleBefore = timestamp - LEARNING_SYNC_CONFIG.sendingStaleMs;
      this.memoryRecords.forEach((record, key) => {
        if (record.status === "sending" && Number(record.last_attempt_at || 0) <= staleBefore) {
          this.memoryRecords.set(key, {
            ...record,
            status: "retry",
            next_retry_at: timestamp,
            updated_at: timestamp
          });
        }
      });
    }

    async updateByEventIds(eventIds, update) {
      const ids = new Set(eventIds);
      if (!ids.size) return;
      if (this.useMemoryFallback) {
        this.memoryRecords.forEach((record, key) => {
          if (ids.has(record.event_id)) this.memoryRecords.set(key, update({ ...record }));
        });
        return;
      }

      try {
        const database = await this.open();
        const transaction = database.transaction(LEARNING_SYNC_CONFIG.outboxStoreName, "readwrite");
        const store = transaction.objectStore(LEARNING_SYNC_CONFIG.outboxStoreName);
        const records = await requestResult(store.getAll());
        records.forEach(record => {
          if (ids.has(record.event_id)) store.put(update(record));
        });
        await transactionDone(transaction);
      } catch (error) {
        this.activateMemoryFallback(error);
        await this.updateByEventIds(eventIds, update);
      }
    }

    async markSynced(eventIds) {
      const timestamp = this.now();
      return this.updateByEventIds(eventIds, record => ({
        ...record,
        status: "synced",
        updated_at: timestamp,
        last_error: "",
        next_retry_at: 0
      }));
    }

    async markFailed(rejections, fallbackError) {
      const errors = new Map(rejections.map(item => [item.event_id, item.error || fallbackError]));
      const timestamp = this.now();
      return this.updateByEventIds([...errors.keys()], record => ({
        ...record,
        status: "failed",
        updated_at: timestamp,
        last_error: String(errors.get(record.event_id) || fallbackError || "permanent_error").slice(0, 240),
        next_retry_at: 0
      }));
    }

    async markRetry(eventIds, { error, retryAfterMs = 0, random = Math.random } = {}) {
      const timestamp = this.now();
      return this.updateByEventIds(eventIds, record => {
        const retryCount = Number(record.retry_count || 0) + 1;
        const delay = retryAfterMs > 0
          ? Math.min(retryAfterMs, LEARNING_SYNC_CONFIG.maxRetryAfterMs)
          : calculateBackoffMs(retryCount, random);
        return {
          ...record,
          status: "retry",
          retry_count: retryCount,
          updated_at: timestamp,
          last_error: String(error || "temporary_error").slice(0, 240),
          next_retry_at: timestamp + delay
        };
      });
    }

    async cleanup() {
      const removeBefore = this.now() - LEARNING_SYNC_CONFIG.syncedRetentionMs;
      if (this.useMemoryFallback) {
        this.memoryRecords.forEach((record, key) => {
          if (record.status === "synced" && Number(record.updated_at || 0) < removeBefore) {
            this.memoryRecords.delete(key);
          }
        });
        return;
      }

      try {
        const database = await this.open();
        const transaction = database.transaction(LEARNING_SYNC_CONFIG.outboxStoreName, "readwrite");
        const store = transaction.objectStore(LEARNING_SYNC_CONFIG.outboxStoreName);
        const records = await requestResult(store.getAll());
        records.forEach(record => {
          if (record.status === "synced" && Number(record.updated_at || 0) < removeBefore) {
            store.delete(record.local_id);
          }
        });
        await transactionDone(transaction);
      } catch (error) {
        this.activateMemoryFallback(error);
      }
    }

    async countDue(userId) {
      const timestamp = this.now();
      const records = await this.getAll();
      return records.filter(record => (
        record.user_id === userId &&
        ["pending", "retry"].includes(record.status) &&
        (!record.next_retry_at || record.next_retry_at <= timestamp)
      )).length;
    }
  }

  function defaultAuthContext() {
    try {
      const candidates = ["user_session", "session"]
        .map(key => {
          try { return JSON.parse(root.localStorage?.getItem(key) || "null"); } catch { return null; }
        })
        .filter(Boolean);
      const session = candidates.find(value => value?.phone && value?.deviceId) || {};
      const userId = normalizedUserId(session.phone || root.localStorage?.getItem("phone"));
      const deviceId = String(session.deviceId || root.localStorage?.getItem("deviceId") || "");
      const accessToken = String(
        root.localStorage?.getItem("accessToken") || session.accessToken || ""
      );
      if (!userId || !deviceId || !accessToken) return null;
      return { userId, deviceId, accessToken };
    } catch {
      return null;
    }
  }

  function debugEnabled() {
    try {
      return ["localhost", "127.0.0.1"].includes(root.location?.hostname)
        || root.localStorage?.getItem("magicbook_learning_debug") === "1";
    } catch {
      return false;
    }
  }

  function debugLog(event, details = {}) {
    if (debugEnabled()) console.debug(`[LearningSync] ${event}`, details);
  }

  function emit(name, detail) {
    try {
      root.dispatchEvent?.(new CustomEvent(name, { detail }));
    } catch {}
  }

  class LearningSyncManager {
    constructor({
      outbox = null,
      fetchImpl = root.fetch?.bind(root),
      getAuthContext = defaultAuthContext,
      now = () => Date.now(),
      random = Math.random
    } = {}) {
      this.now = now;
      this.random = random;
      this.fetchImpl = fetchImpl;
      this.getAuthContext = getAuthContext;
      this.outbox = outbox || new LearningOutbox({
        now,
        onStorageError: error => {
          console.warn("[LearningSync] IndexedDB unavailable; using a temporary in-memory outbox", error?.message || error);
          emit("magicbook:learning-sync-storage-error", { error: error?.message || "indexeddb_unavailable" });
        }
      });
      this.initialized = false;
      this.isSyncing = false;
      this.timer = 0;
      this.consecutiveFailures = 0;
      this.circuitOpenUntil = 0;
      this.boundOnline = () => {
        debugLog("online");
        void this.flush({ reason: "online" });
      };
      this.boundVisible = () => {
        if (root.document?.visibilityState === "visible") void this.flush({ reason: "visible" });
      };
      this.boundPageShow = () => { void this.flush({ reason: "pageshow" }); };
      this.boundPageHide = () => { void this.flush({ reason: "pagehide", keepalive: true }); };
    }

    async init() {
      if (this.initialized) return this;
      this.initialized = true;
      try { await this.outbox.getAll(); } catch {}
      await this.outbox.cleanup();
      root.addEventListener?.("online", this.boundOnline);
      root.addEventListener?.("pageshow", this.boundPageShow);
      root.addEventListener?.("pagehide", this.boundPageHide);
      root.document?.addEventListener?.("visibilitychange", this.boundVisible);
      this.scheduleNextFlush();
      this.requestIdleFlush();
      void this.flush({ reason: "startup" });
      return this;
    }

    scheduleNextFlush() {
      if (this.timer) root.clearTimeout(this.timer);
      const jitter = Math.round((this.random() * 2 - 1) * LEARNING_SYNC_CONFIG.flushJitterMs);
      const delay = Math.max(1_000, LEARNING_SYNC_CONFIG.flushIntervalMs + jitter);
      this.timer = root.setTimeout(async () => {
        await this.flush({ reason: "timer" });
        this.scheduleNextFlush();
      }, delay);
    }

    requestIdleFlush() {
      if (typeof root.requestIdleCallback === "function") {
        root.requestIdleCallback(() => { void this.flush({ reason: "idle" }); }, { timeout: 5_000 });
      } else {
        root.setTimeout(() => { void this.flush({ reason: "idle-fallback" }); }, 3_000);
      }
    }

    async enqueue(eventType, payload, { eventId, userId } = {}) {
      await this.init();
      const auth = this.getAuthContext();
      const resolvedUserId = normalizedUserId(userId || auth?.userId);
      if (!resolvedUserId) throw new Error("learning_sync_auth_unavailable");
      const prefix = eventType === "answer_event" ? "ans" : "act";
      const timestamp = this.now();
      const record = {
        event_id: eventId || generateLearningEventId(prefix),
        event_type: eventType,
        user_id: resolvedUserId,
        payload: { ...payload },
        status: "pending",
        created_at: timestamp,
        updated_at: timestamp,
        retry_count: 0,
        last_attempt_at: 0,
        next_retry_at: 0,
        last_error: ""
      };
      const stored = await this.outbox.add(record);
      debugLog("event queued", { eventId: stored.event_id, eventType });
      emit("magicbook:learning-event-queued", { event: stored });

      const due = await this.outbox.countDue(resolvedUserId);
      if (due >= LEARNING_SYNC_CONFIG.maxBatchSize) void this.flush({ reason: "batch-full" });
      else this.requestIdleFlush();
      return stored;
    }

    enqueueAnswer(payload, options = {}) {
      return this.enqueue("answer_event", payload, options);
    }

    enqueueStudyActivity(payload, options = {}) {
      return this.enqueue("study_activity_event", payload, options);
    }

    async flush(options = {}) {
      await this.init();
      if (this.isSyncing) return false;
      if (root.navigator && root.navigator.onLine === false) {
        debugLog("offline");
        return false;
      }
      if (this.circuitOpenUntil > this.now()) {
        debugLog("sync temporarily paused", { until: this.circuitOpenUntil });
        return false;
      }

      const run = async () => {
        if (this.isSyncing) return false;
        this.isSyncing = true;
        try {
          return await this.flushOneBatch(options);
        } finally {
          this.isSyncing = false;
        }
      };

      if (root.navigator?.locks?.request) {
        return root.navigator.locks.request(
          "magicbook-learning-sync",
          { ifAvailable: true },
          lock => lock ? run() : false
        );
      }
      return run();
    }

    async flushOneBatch({ reason = "manual", keepalive = false } = {}) {
      const auth = this.getAuthContext();
      if (!auth?.userId || !auth?.deviceId || !auth?.accessToken || !this.fetchImpl) return false;
      const userId = normalizedUserId(auth.userId);
      const batch = await this.outbox.claimDue(LEARNING_SYNC_CONFIG.maxBatchSize, userId);
      if (!batch.length) return false;
      debugLog("batch started", { count: batch.length, reason });

      const controller = new AbortController();
      const timeout = root.setTimeout(() => controller.abort(), LEARNING_SYNC_CONFIG.requestTimeoutMs);
      let response;
      let data = null;
      try {
        response = await this.fetchImpl(LEARNING_SYNC_CONFIG.endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${auth.accessToken}`
          },
          body: JSON.stringify({
            device_id: auth.deviceId,
            events: batch.map(record => ({
              event_id: record.event_id,
              event_type: record.event_type,
              user_id: record.user_id,
              payload: record.payload
            }))
          }),
          cache: "no-store",
          keepalive: Boolean(keepalive),
          signal: controller.signal
        });
        data = await response.json().catch(() => ({}));
      } catch (error) {
        const code = error?.name === "AbortError" ? "timeout" : "network_error";
        await this.scheduleRetry(batch, { error: code });
        return false;
      } finally {
        root.clearTimeout(timeout);
      }

      if (!response.ok) {
        if (RETRYABLE_HTTP_STATUSES.has(response.status)) {
          const retryAfterMs = parseRetryAfterMs(response.headers?.get?.("Retry-After"), this.now());
          await this.scheduleRetry(batch, {
            error: data?.error || `http_${response.status}`,
            retryAfterMs
          });
        } else {
          const rejections = batch.map(record => ({
            event_id: record.event_id,
            error: data?.error || `http_${response.status}`
          }));
          await this.outbox.markFailed(rejections, "permanent_error");
          debugLog("event permanently failed", { count: rejections.length, status: response.status });
        }
        return false;
      }

      const batchIds = new Set(batch.map(record => record.event_id));
      const accepted = [...new Set([...(data.accepted || []), ...(data.duplicates || [])])]
        .filter(eventId => batchIds.has(eventId));
      const rejected = (Array.isArray(data.rejected) ? data.rejected : [])
        .filter(item => batchIds.has(item?.event_id));
      const completedIds = new Set([...accepted, ...rejected.map(item => item.event_id)]);
      const uncertain = batch.filter(record => !completedIds.has(record.event_id));

      await this.outbox.markSynced(accepted);
      await this.outbox.markFailed(rejected, "rejected");
      if (uncertain.length) {
        await this.scheduleRetry(uncertain, { error: "missing_server_result", countFailure: false });
      } else {
        this.consecutiveFailures = 0;
        this.circuitOpenUntil = 0;
      }
      debugLog(rejected.length || uncertain.length ? "batch partial success" : "batch success", {
        accepted: accepted.length,
        rejected: rejected.length,
        retry: uncertain.length
      });
      await this.outbox.cleanup();

      if (await this.outbox.countDue(userId)) {
        root.setTimeout(() => { void this.flush({ reason: "queue-drain" }); }, 0);
      }
      return true;
    }

    async scheduleRetry(batch, { error, retryAfterMs = 0, countFailure = true } = {}) {
      await this.outbox.markRetry(batch.map(record => record.event_id), {
        error,
        retryAfterMs,
        random: this.random
      });
      if (countFailure) this.consecutiveFailures += 1;
      if (this.consecutiveFailures >= LEARNING_SYNC_CONFIG.circuitFailureThreshold) {
        this.circuitOpenUntil = this.now() + LEARNING_SYNC_CONFIG.circuitCooldownMs;
        this.consecutiveFailures = 0;
      }
      debugLog("retry scheduled", {
        count: batch.length,
        error,
        retryAfterMs,
        circuitOpenUntil: this.circuitOpenUntil
      });
    }

    getLocalEvents() {
      return this.outbox.getAll();
    }

    getInsightsCache(userId) {
      return this.outbox.getInsightsCache(userId);
    }

    setInsightsCache(userId, model) {
      return this.outbox.setInsightsCache(userId, model);
    }
  }

  const manager = new LearningSyncManager();
  const publicApi = {
    config: LEARNING_SYNC_CONFIG,
    init: () => manager.init(),
    enqueueAnswer: (payload, options) => manager.enqueueAnswer(payload, options),
    enqueueStudyActivity: (payload, options) => manager.enqueueStudyActivity(payload, options),
    flush: options => manager.flush(options),
    getLocalEvents: () => manager.getLocalEvents(),
    getInsightsCache: userId => manager.getInsightsCache(userId),
    setInsightsCache: (userId, model) => manager.setInsightsCache(userId, model),
    generateEventId: generateLearningEventId,
    __testing: {
      LearningOutbox,
      LearningSyncManager,
      calculateBackoffMs,
      parseRetryAfterMs,
      normalizedUserId,
      OUTBOX_STATUSES
    }
  };
  root.MagicBookLearningSync = publicApi;

  const autoStart = () => { void manager.init(); };
  if (root.document?.readyState === "loading") {
    root.document.addEventListener("DOMContentLoaded", autoStart, { once: true });
  } else {
    autoStart();
  }
})(typeof window !== "undefined" ? window : globalThis);

(function exposeMagicAudioFocus(root) {
  "use strict";

  let resumable = null;
  let suspension = null;
  let transient = null;
  let pendingResume = null;
  let sequence = 0;

  function callSafely(callback, ...args) {
    if (typeof callback !== "function") return undefined;
    try {
      return callback(...args);
    } catch (_) {
      return undefined;
    }
  }

  function isUsableAdapter(adapter) {
    return Boolean(
      adapter
      && typeof adapter.pause === "function"
      && typeof adapter.resume === "function"
      && typeof adapter.isPlaying === "function"
    );
  }

  function canResume(adapter) {
    if (!isUsableAdapter(adapter)) return false;
    return typeof adapter.canResume !== "function" || adapter.canResume() === true;
  }

  function setSuspended(adapter, value) {
    callSafely(adapter?.setSuspended, value);
  }

  function invalidatePendingResume(reason, { pause = false } = {}) {
    const pending = pendingResume;
    if (!pending) return null;
    pendingResume = null;
    pending.cancelReason = reason;
    if (pause) callSafely(pending.adapter?.pause, reason);
    return pending;
  }

  function stopCurrentTransient(reason) {
    const current = transient;
    transient = null;
    if (!current) return false;
    callSafely(current.stop, reason);
    return true;
  }

  function captureResumableForTransient() {
    const pending = invalidatePendingResume("transient", { pause: true });
    const candidate = pending?.adapter || resumable;
    if (suspension || !isUsableAdapter(candidate) || candidate !== resumable) return;

    const wasPlaying = pending ? canResume(candidate) : callSafely(candidate.isPlaying) === true;
    if (!wasPlaying) return;

    callSafely(candidate.pause, "transient");
    suspension = { adapter: candidate, resumeEligible: true };
    setSuspended(candidate, true);
  }

  async function releaseSuspension(shouldResume) {
    const held = suspension;
    suspension = null;
    if (!held) return false;

    setSuspended(held.adapter, false);
    if (!shouldResume || !held.resumeEligible || held.adapter !== resumable || !canResume(held.adapter)) {
      return false;
    }

    const attempt = {
      id: ++sequence,
      adapter: held.adapter,
      cancelReason: ""
    };
    pendingResume = attempt;

    try {
      await held.adapter.resume("transient-complete", () => (
        pendingResume === attempt
        && !attempt.cancelReason
        && !transient
        && resumable === held.adapter
      ));
    } catch (_) {
      if (pendingResume === attempt) pendingResume = null;
      return false;
    }

    const stillCurrent = pendingResume === attempt
      && !attempt.cancelReason
      && !transient
      && resumable === held.adapter
      && canResume(held.adapter);
    if (pendingResume === attempt) pendingResume = null;

    if (!stillCurrent && attempt.cancelReason !== "manual-claim") {
      callSafely(held.adapter.pause, "stale-resume");
      if (transient && resumable === held.adapter && !suspension && canResume(held.adapter)) {
        suspension = { adapter: held.adapter, resumeEligible: true };
        setSuspended(held.adapter, true);
      }
    }
    return stillCurrent;
  }

  function setResumable(adapter) {
    if (!isUsableAdapter(adapter)) return false;
    if (resumable === adapter) return true;

    const previous = resumable;

    if (pendingResume?.adapter && pendingResume.adapter !== adapter) {
      invalidatePendingResume("resumable-changed", { pause: true });
    }
    if (suspension?.adapter && suspension.adapter !== adapter) {
      setSuspended(suspension.adapter, false);
      suspension = null;
    }
    if (previous && previous !== adapter && callSafely(previous.isPlaying) === true) {
      callSafely(previous.pause, "resumable-changed");
    }
    resumable = adapter;
    return true;
  }

  function clearResumable(adapter) {
    if (adapter && resumable !== adapter) return false;
    const current = resumable;
    if (pendingResume?.adapter === current) invalidatePendingResume("resumable-cleared", { pause: true });
    if (suspension?.adapter === current) {
      setSuspended(current, false);
      suspension = null;
    }
    resumable = null;
    return true;
  }

  function beginTransient({ key = "", stop } = {}) {
    stopCurrentTransient("superseded");
    captureResumableForTransient();

    const token = Object.freeze({
      id: ++sequence,
      key: String(key || "")
    });
    transient = { token, stop };
    return token;
  }

  async function completeTransient(token, { resume = true } = {}) {
    if (!transient || transient.token !== token) return false;
    transient = null;
    return releaseSuspension(resume === true);
  }

  async function cancelTransient(token, { resume = false, reason = "manual" } = {}) {
    if (!transient || transient.token !== token) return false;
    stopCurrentTransient(reason);
    await releaseSuspension(resume === true);
    return true;
  }

  function claimResumable(adapter) {
    const wasSuspended = Boolean(suspension && (!adapter || suspension.adapter === adapter));
    stopCurrentTransient("resumable-request");

    if (pendingResume && (!adapter || pendingResume.adapter === adapter)) {
      invalidatePendingResume("manual-claim");
    }
    if (suspension) {
      setSuspended(suspension.adapter, false);
      suspension = null;
    }
    if (adapter) setResumable(adapter);
    return wasSuspended;
  }

  function markManualPause(adapter) {
    if (suspension?.adapter === adapter) {
      suspension.resumeEligible = false;
      setSuspended(adapter, false);
    }
    if (pendingResume?.adapter === adapter) {
      invalidatePendingResume("manual-pause", { pause: true });
    }
  }

  function cancelAll({ clearResumable: shouldClearResumable = true } = {}) {
    stopCurrentTransient("context-change");
    invalidatePendingResume("context-change", { pause: true });
    if (suspension) {
      setSuspended(suspension.adapter, false);
      suspension = null;
    }
    if (shouldClearResumable) resumable = null;
  }

  function isCurrent(token) {
    return Boolean(transient && transient.token === token);
  }

  root.MagicAudioFocus = Object.freeze({
    setResumable,
    clearResumable,
    beginTransient,
    completeTransient,
    cancelTransient,
    claimResumable,
    markManualPause,
    cancelAll,
    isCurrent
  });
})(typeof window !== "undefined" ? window : globalThis);

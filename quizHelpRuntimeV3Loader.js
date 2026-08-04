(function exposeQuizHelpRuntimeV3Loader(root) {
  "use strict";

  const DEFAULT_MANIFEST_URL = "https://www.tmmbooks.eu/dist/patente/quiz-help-runtime-manifest.json";
  let loadPromise = null;

  function readBoolean(value) {
    return /^(1|true|yes|on)$/i.test(String(value || ""));
  }

  function isPreviewHost() {
    const host = String(root.location?.hostname || "");
    return host === "localhost" || host === "127.0.0.1" || host.endsWith(".vercel.app");
  }

  function flag(name) {
    const explicit = root[name];
    if (typeof explicit === "boolean") return explicit;
    try {
      const stored = root.localStorage?.getItem(name);
      if (stored !== null) return readBoolean(stored);
    } catch {}
    return root.QUIZ_HELP_RUNTIME_V3_DEFAULT_ENABLED === true || isPreviewHost();
  }

  function enabled() {
    return flag("QUIZ_HELP_RUNTIME_V3") && flag("CONTEXT_RESOLVER_V3");
  }

  function manifestUrl() {
    let storedOverride = "";
    try {
      storedOverride = root.localStorage?.getItem("QUIZ_HELP_RUNTIME_V3_MANIFEST_URL") || "";
    } catch {}
    if (root.QUIZ_HELP_RUNTIME_V3_MANIFEST_URL || storedOverride) {
      return root.QUIZ_HELP_RUNTIME_V3_MANIFEST_URL || storedOverride;
    }
    const useLocalManifest = root.QUIZ_HELP_RUNTIME_V3_USE_LOCAL_MANIFEST === true;
    return useLocalManifest && root.location?.origin
      ? `${root.location.origin}/dist/patente/quiz-help-runtime-manifest.json`
      : DEFAULT_MANIFEST_URL;
  }

  async function digestHex(text) {
    if (!root.crypto?.subtle) throw new Error("quiz_help_sha256_unavailable");
    const bytes = new TextEncoder().encode(text);
    const digest = await root.crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
  }

  function absoluteRuntimeUrl(manifest, source) {
    const override = root.QUIZ_HELP_RUNTIME_V3_URL;
    if (override) return override;
    return new URL(manifest.url, source).href;
  }

  async function load() {
    if (!enabled()) throw new Error("quiz_help_runtime_v3_disabled");
    if (!root.PatenteContextResolverV3) throw new Error("context_resolver_v3_missing");
    if (loadPromise) return loadPromise;
    loadPromise = (async () => {
      const source = manifestUrl();
      const manifestResponse = await fetch(source, { cache: "no-cache" });
      if (!manifestResponse.ok) throw new Error(`quiz_help_manifest_${manifestResponse.status}`);
      const manifest = await manifestResponse.json();
      if (manifest.schema_version !== "3.0.0" || manifest.quiz_count !== 7139 || !manifest.sha256) {
        throw new Error("quiz_help_manifest_invalid");
      }
      const runtimeUrl = absoluteRuntimeUrl(manifest, source);
      const runtimeResponse = await fetch(runtimeUrl, { cache: "force-cache" });
      if (!runtimeResponse.ok) throw new Error(`quiz_help_runtime_${runtimeResponse.status}`);
      const runtimeText = await runtimeResponse.text();
      const digest = await digestHex(runtimeText);
      if (digest !== manifest.sha256) throw new Error("quiz_help_runtime_hash_mismatch");
      const runtime = JSON.parse(runtimeText);
      if (runtime.schema_version !== "3.0.0" || Object.keys(runtime.quizzes || {}).length !== 7139) {
        throw new Error("quiz_help_runtime_invalid");
      }
      return {
        manifest,
        runtime,
        resolver: root.PatenteContextResolverV3.create(runtime),
        runtimeUrl
      };
    })().catch(error => {
      loadPromise = null;
      throw error;
    });
    return loadPromise;
  }

  root.QuizHelpRuntimeV3 = {
    DEFAULT_MANIFEST_URL,
    enabled,
    flag,
    load,
    manifestUrl
  };
})(typeof globalThis !== "undefined" ? globalThis : window);

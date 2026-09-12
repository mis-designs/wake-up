import crypto from "node:crypto";
import { createRequire } from "node:module";
import { fetchUpstream, withOperationalTimeout } from "./upstream-fetch.mjs";

const require = createRequire(import.meta.url);
const fallback = require("../data/patente/quiz-help-runtime-v2.json");
const MANIFEST = "https://www.tmmbooks.eu/dist/patente/quiz-help-runtime-manifest.json";
const BENGALI = /[\u0980-\u09ff]/u;
let runtimePromise = null;
let expiresAt = 0;

function normalize(value) {
  return String(value || "").normalize("NFKC").trim().replace(/[।.]+$/u, "").trim();
}

export function dictionaryAudioText({ entryId, language, text }, runtime = null) {
  if (!["it", "bn"].includes(language) || !/^[a-zA-Z0-9_-]{1,128}$/u.test(String(entryId || ""))) return "";
  const entry = runtime?.entries?.[entryId];
  const local = fallback.words?.[entryId];
  const candidates = language === "bn"
    ? [entry?.bn, local?.[1]]
    : [entry?.canonical_italian || entry?.forms?.[0] || entry?.lemma, local?.[0]];
  return candidates.map(normalize).find(value => value && value.length <= 500
    && (language !== "bn" || BENGALI.test(value)) && value === normalize(text)) || "";
}

async function loadRuntime() {
  if (runtimePromise && Date.now() < expiresAt) return runtimePromise;
  expiresAt = Date.now() + 5 * 60_000;
  runtimePromise = withOperationalTimeout((async () => {
    const response = await fetchUpstream(MANIFEST, { redirect: "error" }, { service: "dictionary_catalog" });
    if (!response.ok) throw new Error("dictionary_manifest_unavailable");
    const manifest = await response.json();
    const url = new URL(manifest.url, MANIFEST);
    if (url.origin !== new URL(MANIFEST).origin || !url.pathname.startsWith("/dist/patente/")
      || manifest.schema_version !== "3.0.0" || !/^[a-f0-9]{64}$/iu.test(manifest.sha256 || "")) {
      throw new Error("dictionary_manifest_invalid");
    }
    const data = await fetchUpstream(url, { redirect: "error" }, { service: "dictionary_catalog" });
    if (!data.ok) throw new Error("dictionary_catalog_unavailable");
    const body = await data.text();
    if (body.length > 20 * 1024 * 1024 || crypto.createHash("sha256").update(body).digest("hex") !== manifest.sha256) {
      throw new Error("dictionary_catalog_invalid");
    }
    const runtime = JSON.parse(body);
    if (runtime.schema_version !== "3.0.0" || !runtime.entries) throw new Error("dictionary_catalog_invalid");
    return runtime;
  })(), { service: "dictionary_catalog", timeoutMs: 15_000 }).catch(error => {
    runtimePromise = null;
    expiresAt = 0;
    throw error;
  });
  return runtimePromise;
}

export async function resolveDictionaryAudio(request) {
  // Only catalog text is speakable. The caller cannot select a provider, URL,
  // arbitrary text, or another language. Local entries work during catalog outages.
  if (!["it", "bn"].includes(request.language) || !/^[a-zA-Z0-9_-]{1,128}$/u.test(String(request.entryId || ""))) return "";
  return dictionaryAudioText(request) || dictionaryAudioText(request, await loadRuntime());
}

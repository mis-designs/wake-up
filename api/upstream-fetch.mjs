const DEFAULT_TIMEOUT_MS = 12_000;

export function publicApiError(error) {
  const statusCode = Number.isInteger(error?.statusCode) ? error.statusCode : 500;
  if (statusCode === 503) return { statusCode, error: "service_unavailable" };
  if (statusCode >= 400 && statusCode < 500) {
    return { statusCode, error: String(error?.message || "invalid_request") };
  }
  return { statusCode: 500, error: "server_error" };
}

function upstreamError(service, reason, details = {}) {
  const error = new Error(`${service}_${reason}`);
  error.statusCode = 503;
  error.details = { service, reason, ...details };
  return error;
}

export async function fetchUpstream(url, options = {}, config = {}) {
  return fetchUpstreamResponse(url, options, config, false);
}

// For small JSON APIs, keep the SAME deadline through body consumption. A
// response can deliver headers successfully and then stall reading its body.
export async function fetchUpstreamJson(url, options = {}, config = {}) {
  return fetchUpstreamResponse(url, options, config, true);
}

async function fetchUpstreamResponse(url, options, config, readJson) {
  const service = String(config.service || "upstream");
  const timeoutMs = Math.max(1, Number(config.timeoutMs) || DEFAULT_TIMEOUT_MS);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (response.status >= 500) {
      throw upstreamError(service, "unavailable", { upstreamStatus: response.status });
    }
    // Error responses need only their status/Retry-After, not an unbounded body.
    if (readJson) {
      const data = response.ok ? await response.json() : null;
      if (!response.ok) await response.body?.cancel();
      return { response, data };
    }
    return response;
  } catch (error) {
    if (error?.statusCode === 503) throw error;
    if (error?.name === "AbortError") {
      throw upstreamError(service, "timeout", { timeoutMs });
    }
    throw upstreamError(service, "unavailable");
  } finally {
    clearTimeout(timer);
  }
}

export async function withOperationalTimeout(promise, config = {}) {
  const service = String(config.service || "operation");
  const timeoutMs = Math.max(1, Number(config.timeoutMs) || DEFAULT_TIMEOUT_MS);
  let timer = null;

  try {
    return await Promise.race([
      Promise.resolve(promise),
      new Promise((_resolve, reject) => {
        timer = setTimeout(
          () => reject(upstreamError(service, "timeout", { timeoutMs })),
          timeoutMs
        );
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

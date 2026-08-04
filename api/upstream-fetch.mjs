const DEFAULT_TIMEOUT_MS = 12_000;

function upstreamError(service, reason, details = {}) {
  const error = new Error(`${service}_${reason}`);
  error.statusCode = 503;
  error.details = { service, reason, ...details };
  return error;
}

export async function fetchUpstream(url, options = {}, config = {}) {
  const service = String(config.service || "upstream");
  const timeoutMs = Math.max(1, Number(config.timeoutMs) || DEFAULT_TIMEOUT_MS);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (response.status >= 500) {
      throw upstreamError(service, "unavailable", { upstreamStatus: response.status });
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

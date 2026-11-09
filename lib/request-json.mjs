// Small control requests only; audio uploads have their own larger limits.
export function readRequestObject(req, maxBytes = 16 * 1024) {
  const fail = (message, statusCode) => { throw Object.assign(new Error(message), { statusCode }); };
  if (Number(req.headers?.["content-length"]) > maxBytes) fail("request_too_large", 413);
  let body = req.body ?? {};
  if (Buffer.isBuffer(body)) body = body.toString("utf8");
  if (typeof body === "string") {
    if (Buffer.byteLength(body, "utf8") > maxBytes) fail("request_too_large", 413);
    try { body = JSON.parse(body || "{}"); } catch { fail("invalid_json", 400); }
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) fail("invalid_request", 400);
  if (Buffer.byteLength(JSON.stringify(body), "utf8") > maxBytes) fail("request_too_large", 413);
  return body;
}

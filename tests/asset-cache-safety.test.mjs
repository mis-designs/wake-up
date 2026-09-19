import test from "node:test";
import assert from "node:assert/strict";
import { S3Client } from "@aws-sdk/client-s3";
import handler from "../api/asset.js";

test("only confirmed missing public assets get a short negative cache; errors stay uncached", async t => {
  for (const key of ["BOOK_R2_BUCKET", "BOOK_R2_ACCOUNT_ID", "BOOK_R2_ACCESS_KEY_ID", "BOOK_R2_SECRET_ACCESS_KEY"]) {
    const previous = process.env[key];
    process.env[key] = "local-test-only";
    t.after(() => { if (previous === undefined) delete process.env[key]; else process.env[key] = previous; });
  }
  t.mock.method(globalThis, "fetch", () => assert.fail("unexpected external request"));
  let code = 404, calls = 0;
  t.mock.method(S3Client.prototype, "send", async () => {
    calls++;
    if (code === 200) return {};
    throw Object.assign(new Error("fixture"), { $metadata: { httpStatusCode: code } });
  });
  async function request(method = "HEAD", query = { kind: "explanation", figure: "fig1", value: "0", ext: "png" }) {
    const res = { headers: {}, statusCode: 200,
      setHeader(key, value) { this.headers[key] = value; },
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; return this; }, end() { return this; } };
    await handler({ method, query }, res);
    return res;
  }
  for (const method of ["HEAD", "GET"]) {
    const response = await request(method);
    assert.equal(response.statusCode, 404);
    assert.equal(response.headers["Cache-Control"], "public, max-age=60, s-maxage=60");
  }
  assert.equal(calls, 6, "all three valid legacy names checked per uncached request");
  code = 503;
  const failure = await request();
  assert.equal(failure.statusCode, 500);
  assert.doesNotMatch(failure.headers["Cache-Control"] || "", /public|s-maxage/);
  assert.equal(calls, 7, "storage failure does not fan out to other names");
  const invalid = await request("HEAD", { kind: "explanation", figure: "../private", value: "0", ext: "png" });
  assert.equal(invalid.statusCode, 404);
  assert.equal(calls, 7);
  assert.equal(invalid.headers["Cache-Control"], undefined);
  code = 200;
  const success = await request();
  assert.equal(success.statusCode, 204);
  assert.equal(success.headers["Cache-Control"], "public, max-age=300, s-maxage=3600");
});

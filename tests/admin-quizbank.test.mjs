import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import vm from "node:vm";
import { readFileSync } from "node:fs";

process.env.GAS_ACCESS_URL = "https://fixture.invalid/access";
process.env.GAS_SECRET = "fixture-secret";
process.env.GAS_ADMIN_KEY = "fixture-admin-key";
process.env.SESSION_SECRET = "fixture-session-secret";
const { default: handler } = await import("../api/admin.js?quizbank-admin-test");
const phone = "39123456789", deviceId = "fixture-device";
function token(role = "admin") {
  const encoded = Buffer.from(JSON.stringify({ purpose: "access", phone, deviceId, role, exp: Date.now() + 60_000 })).toString("base64url");
  return encoded + "." + crypto.createHmac("sha256", process.env.SESSION_SECRET).update(encoded).digest("base64url");
}
async function request(fields, upstream = null) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    const body = JSON.parse(options.body); calls.push(body);
    return new Response(JSON.stringify(upstream ?? { success: true, Quiz_bank: body.Quiz_bank }), { status: 200 });
  };
  const res = { code: 200, headers: {}, setHeader(key, value) { this.headers[key] = value; },
    status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  try {
    await handler({ method: "POST", body: { action: "update", phone, sessionPhone: phone, deviceId, accessToken: token(), ...fields } }, res);
    return { ...res, calls };
  } finally { globalThis.fetch = original; }
}

test("admin create/update send exact numeric 0/1 and confirm server acknowledgment", async () => {
  for (const action of ["create", "update"]) for (const flag of [0, 1]) {
    const result = await request({ action, Quiz_bank: flag, days: 90 });
    assert.equal(result.body.success, true); assert.equal(result.calls.length, 1);
    assert.equal(result.calls[0].action, action === "create" ? "admin_add" : "admin_update");
    assert.equal(result.calls[0].Quiz_bank, flag);
    assert.equal(result.headers["Cache-Control"], "no-store");
  }
});
test("malformed flags and non-admin callers never reach GAS", async () => {
  for (const flag of [true, false, null, "1", "0", "", 2, [], {}]) {
    const result = await request({ Quiz_bank: flag });
    assert.equal(result.code, 400); assert.equal(result.body.error, "bad_quizbank"); assert.equal(result.calls.length, 0);
  }
  for (const fields of [{ accessToken: token("user") }, { accessToken: "" }, { deviceId: "other" }]) {
    const result = await request({ Quiz_bank: 1, ...fields });
    assert.equal(result.code, 403); assert.equal(result.calls.length, 0);
  }
});
test("legacy updates omit the flag; renewals do not change entitlement", async () => {
  for (const fields of [{ action: "update" }, { action: "renew", Quiz_bank: 1, days: 90 }]) {
    const result = await request(fields);
    assert.equal(result.body.success, true); assert.equal(result.calls.length, 1);
    assert.equal(Object.hasOwn(result.calls[0], "Quiz_bank"), false);
  }
});
test("old GAS, wrong acknowledgments and missing columns never claim access saved", async () => {
  for (const upstream of [{ success: true }, { success: true, Quiz_bank: 0 }, { success: true, Quiz_bank: "1" }]) {
    const result = await request({ Quiz_bank: 1 }, upstream);
    assert.equal(result.body.error, "quizbank_not_confirmed"); assert.equal(result.calls.length, 1);
  }
  const failure = await request({ Quiz_bank: 1 }, { success: false, error: "quizbank_column_missing" });
  assert.equal(failure.body.error, "quizbank_column_missing"); assert.equal(failure.calls.length, 1);
});
test("recent, full and searched records preserve their server flag", async () => {
  const user = { phone, Quiz_bank: 1 };
  for (const action of ["recent", "list", "search"]) {
    const result = await request({ action }, { success: true, list: [user], user });
    assert.equal((action === "search" ? result.body.user : result.body.list[0]).Quiz_bank, 1);
  }
});
test("six independent labelled checkboxes and one edit checkbox, no Home link", () => {
  const page = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.equal((page.match(/class="admin-bulk-quizbank"/g) || []).length, 6);
  assert.equal((page.match(/id="adminModalQuizBank"/g) || []).length, 1);
  assert.match(page, /id="adminUserForm"[^>]*novalidate/);
  assert.doesNotMatch(page, /href=["']\/quizbank/i);
});

test("client mutations use a bounded deadline and never replay uncertain writes", async () => {
  const source = readFileSync(new URL("../script.js", import.meta.url), "utf8");
  const requestSource = source.slice(source.indexOf("async function adminRequest("), source.indexOf("function setupAdminUI("));
  for (const failure of ["network", "invalid-json"]) {
    let calls = 0, cleared = false, deadline;
    const context = vm.createContext({
      AbortController, ADMIN_API: "/api/admin", isCurrentSessionAdmin: () => true,
      ensureAccessToken: async () => true, isAccessTokenUsable: () => true,
      getCurrentAccessToken: () => "fixture", getCurrentSessionPhone: () => phone,
      getCurrentSessionDeviceId: () => deviceId,
      setTimeout: (callback, ms) => { deadline = ms; return 1; },
      clearTimeout: () => { cleared = true; },
      fetch: async (_url, options) => {
        calls++; assert.ok(options.signal);
        if (failure === "network") throw Error("fixture disconnect");
        return { ok: true, status: 200, json: async () => { throw Error("fixture invalid body"); } };
      }
    });
    vm.runInContext(requestSource, context);
    await assert.rejects(context.adminRequest("create", { phone, Quiz_bank: 1 }), /save_unconfirmed/);
    assert.equal(calls, 1); assert.equal(deadline, 30_000); assert.equal(cleared, true);
  }
});

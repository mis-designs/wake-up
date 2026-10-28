import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

// Portable, offline GAS contract tests. No Apps Script deployment or real Sheet.
// Run: node --test tests/accesso-quizbank.test.mjs
const source = readFileSync(new URL("../google-apps-script/accesso.gs", import.meta.url), "utf8");
const NOW = Date.parse("2026-10-28T12:00:00.000Z");
const FUTURE = "2027-10-28T12:00:00.000Z";
const PAST = "2025-10-28T12:00:00.000Z";
const PHONE = "39123456789";
const HEADERS = ["phone", "device1", "device2", "expiry", "registration_date"];
const TOKEN = "fixture-gas-token";
const ADMIN_KEY = "fixture-admin-key";
class FixedDate extends Date {
  constructor(...args) { super(...(args.length ? args : [NOW])); }
  static now() { return NOW; }
}
const plain = value => JSON.parse(JSON.stringify(value));
const dataRows = (flag = 1, options = {}) => [
  [...HEADERS, "Quiz_bank"],
  [PHONE, options.d1 ?? "old-device", options.d2 ?? "second-device", options.expiry ?? FUTURE, PAST, flag]
];

function fixture({ rows = dataRows(), properties = {}, lockAvailable = true, waitError = false,
  readError = false, writeError = false, missingSheet = false, cacheCount = 0 } = {}) {
  const data = rows.map(row => row.slice());
  const stats = { sheetLookups: 0, dataRanges: 0, reads: 0, cellReads: 0, ranges: [], writes: [], locks: [], logs: [], properties: [], promo: [] };
  const config = { GAS_SECRET: TOKEN, ADMIN_KEY, ADMIN_PHONES: "", ADMIN_PHONE_NUMBERS: "", ...properties };
  const cache = new Map([["rate_limit", String(cacheCount)]]);
  const sheet = {
    getDataRange() {
      stats.dataRanges++;
      return { getValues() { stats.reads++; if (readError) throw new Error("fixture read failure"); return data.map(row => row.slice()); } };
    },
    getRange(row, column, height = 1, width = 1) {
      stats.ranges.push({ row, column, height, width });
      return {
        getValue() { stats.cellReads++; return data[row - 1]?.[column - 1] ?? ""; },
        setValue(value) {
          if (writeError) throw new Error("fixture write failure");
          stats.writes.push({ type: "set", row, column, value }); data[row - 1][column - 1] = value;
        },
        clearContent() {
          if (writeError) throw new Error("fixture write failure");
          stats.writes.push({ type: "clear", row, column, height, width });
          for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data[row + y - 1][column + x - 1] = "";
        }
      };
    },
    appendRow(values) { stats.writes.push({ type: "append", values: values.slice() }); data.push(values.slice()); },
    deleteRow(row) { stats.writes.push({ type: "delete", row }); data.splice(row - 1, 1); }
  };
  const content = {
    MimeType: { JSON: "application/json", JAVASCRIPT: "application/javascript" },
    createTextOutput(text) { return { text, mimeType: null, setMimeType(type) { this.mimeType = type; return this; } }; }
  };
  const context = vm.createContext({ Date: FixedDate,
    PropertiesService: { getScriptProperties: () => ({ getProperty(name) { stats.properties.push(name); return config[name] ?? null; } }) },
    SpreadsheetApp: { getActive: () => ({ getSheetByName(name) { stats.sheetLookups++; assert.equal(name, "Sheet1"); return missingSheet ? null : sheet; } }) },
    LockService: { getScriptLock: () => ({
      tryLock(ms) { stats.locks.push(["try", ms]); return lockAvailable; },
      waitLock(ms) { stats.locks.push(["wait", ms]); if (waitError) throw new Error("fixture lock timeout"); },
      releaseLock() { stats.locks.push(["release"]); }
    }) },
    CacheService: { getScriptCache: () => ({ get: key => cache.get(key), put: (key, value) => cache.set(key, String(value)) }) },
    Logger: { log: message => stats.logs.push(message) }, ContentService: content,
    promoRedeem_(request) { stats.promo.push(request); return { success: true, promoFixture: true }; },
    promoJsonOutput_: result => content.createTextOutput(JSON.stringify(result)).setMimeType(content.MimeType.JSON)
  });
  vm.runInContext(source, context, { filename: "google-apps-script/accesso.gs" });
  function request(method, values = {}, params = {}) {
    const input = { action: "validate", phone: PHONE, deviceId: "old-device", token: TOKEN, ...values };
    const output = method === "GET"
      ? context.doGet({ parameter: input })
      : context.doPost({ parameter: params, postData: { contents: JSON.stringify(input) } });
    const json = input.callback && method === "GET" ? output.text.slice(input.callback.length + 1, -2) : output.text;
    return { body: JSON.parse(json), output };
  }
  return { context, sheet, data, stats, request,
    access(fn, device = "old-device") { return plain(context[fn](sheet, PHONE, device, new FixedDate())); }
  };
}

function assertOneRead(h) {
  assert.equal(h.stats.dataRanges, 1, "Reuse the existing data range");
  assert.equal(h.stats.reads, 1, "Read the sheet only once");
  assert.equal(h.stats.cellReads, 0, "Do not fetch the header or flag separately");
}
function assertNoWrites(h, original) {
  assert.deepEqual(h.stats.writes, []);
  if (original) assert.deepEqual(h.data, original);
}
function assertFlag(body, expected) {
  assert.equal(body.success, true);
  assert.equal(body.Quiz_bank, expected);
  assert.equal(Number.isInteger(body.Quiz_bank), true);
}
function assertOnlyDeviceWrites(h) {
  assert.ok(h.stats.writes.every(write => write.type === "set" && write.row === 2 && [2, 3].includes(write.column)), "Only original device cells may change");
  assert.ok(h.stats.ranges.every(range => range.row > 1 && range.column <= 5), "Never write the permission or create its header");
}

test("configuration still comes only from Script Properties and admin-phone fallback is preserved", () => {
  const h = fixture({ properties: { ADMIN_PHONE_NUMBERS: `+${PHONE}` } });
  const result = h.request("GET").body;
  assert.equal(result.role, "admin"); assertFlag(result, 1);
  assert.deepEqual(h.stats.properties, ["GAS_SECRET", "ADMIN_KEY", "ADMIN_PHONES", "ADMIN_PHONE_NUMBERS"]);
  assert.equal(source.includes(TOKEN), false); assert.equal(source.includes(ADMIN_KEY), false);
});

test("Quiz_bank is found at any position after the original five columns using exact trimmed spelling", async t => {
  for (const index of [5, 6, 12, 80]) await t.test(`column ${index + 1}`, () => {
    const headers = [...HEADERS], row = [PHONE, "old-device", "second-device", FUTURE, PAST];
    for (let i = 5; i < index; i++) { headers.push(`other_${i}`); row.push(1); }
    headers.push(" \tQuiz_bank\n"); row.push(" \t1\n");
    const rows = [headers, row], h = fixture({ rows });
    assertFlag(h.request("GET").body, 1); assertOneRead(h); assertNoWrites(h, rows);
  });
});

test("missing, duplicate, misplaced and lookalike headers fail closed without creating a column", async t => {
  const cases = [
    ["missing", [...HEADERS]],
    ["blank", [...HEADERS, ""]],
    ["wrong case", [...HEADERS, "quiz_bank"]],
    ["uppercase", [...HEADERS, "QUIZ_BANK"]],
    ["different separator", [...HEADERS, "Quiz bank"]],
    ["suffix", [...HEADERS, "Quiz_bank_enabled"]],
    ["zero-width suffix", [...HEADERS, "Quiz_bank\u200b"]],
    ["duplicate", [...HEADERS, "Quiz_bank", "Quiz_bank"]],
    ["trimmed duplicate", [...HEADERS, "Quiz_bank", " \tQuiz_bank "]],
    ["misplaced", [...HEADERS.slice(0, 4), "Quiz_bank"]],
    ["misplaced duplicate", ["Quiz_bank", ...HEADERS.slice(1), "Quiz_bank"]],
    ["non-string", [...HEADERS, true, 1, null, { toString: () => "Quiz_bank" }]]
  ];
  for (const [name, headers] of cases) await t.test(name, () => {
    const row = [PHONE, "old-device", "second-device", FUTURE, 1];
    while (row.length < headers.length) row.push(1);
    const rows = [headers, row], h = fixture({ rows });
    assertFlag(h.request("POST").body, 0); assertOneRead(h); assertNoWrites(h, rows);
  });
  const lookalikeAndExact = fixture({ rows: [[...HEADERS, "quiz_bank", "Quiz_bank"], [PHONE, "old-device", "", FUTURE, PAST, 1, 0]] });
  assertFlag(lookalikeAndExact.request("GET").body, 0);
});

test("only numeric 1 or a trimmed string 1 grants the integer flag", async t => {
  const cases = [
    ["number", 1, 1], ["string", "1", 1], ["trimmed string", " \n1\t ", 1],
    ["boolean true", true, 0], ["boolean false", false, 0], ["zero", 0, 0], ["other number", 2, 0],
    ["negative", -1, 0], ["fraction", 1.01, 0], ["NaN", NaN, 0], ["Infinity", Infinity, 0],
    ["empty", "", 0], ["whitespace", " \t", 0], ["null", null, 0], ["undefined", undefined, 0],
    ["true text", "true", 0], ["zero-padded", "01", 0], ["decimal text", "1.0", 0],
    ["exponent", "1e0", 0], ["hex", "0x1", 0], ["plus", "+1", 0], ["suffix", "1x", 0],
    ["full-width", "１", 0], ["invisible suffix", "1\u200b", 0], ["formula text", "=1", 0],
    ["array", [1], 0], ["boxed string", new String("1"), 0], ["boxed number", new Number(1), 0],
    ["coercible object", { valueOf: () => 1, toString: () => "1" }, 0]
  ];
  for (const [name, value, expected] of cases) await t.test(name, () => {
    const rows = dataRows(); rows[1][5] = value;
    const h = fixture({ rows }); assertFlag(h.request("GET").body, expected);
    assertOneRead(h); assertNoWrites(h);
  });
  const rows = dataRows(); rows[1].pop();
  assertFlag(fixture({ rows }).request("GET").body, 0);
});

const successCases = [
  { name: "existing first device", d1: "old-device", d2: "second-device", device: "old-device", writes: [] },
  { name: "existing second device", d1: "old-device", d2: "second-device", device: "second-device", writes: [] },
  { name: "empty first slot", d1: "", d2: "", device: "new-device", devices: 1, writes: [[2, "new-device"]] },
  { name: "empty second slot", d1: "old-device", d2: "", device: "new-device", devices: 2, writes: [[3, "new-device"]] },
  { name: "rotation", d1: "old-device", d2: "second-device", device: "new-device", rotated: true, writes: [[2, "second-device"], [3, "new-device"]] }
];

test("all direct read, write and confirmation success branches return the stored flag without changing their contract", async t => {
  for (const fn of ["readUserAccess", "writeUserAccess", "handleConfirmDeviceRotation"]) {
    for (const scenario of successCases) {
      if (fn === "readUserAccess" && scenario.writes.length) continue;
      for (const flag of [0, 1]) await t.test(`${fn}: ${scenario.name}, flag=${flag}`, () => {
        const h = fixture({ rows: dataRows(flag, scenario) });
        const result = h.access(fn, scenario.device);
        assertFlag(result, flag); assert.equal(result.error, null); assert.equal(result.role, "user");
        assert.equal(result.expiry, FUTURE); assert.equal(result.devices, scenario.devices);
        assert.equal(result.rotated, scenario.rotated);
        assert.equal(result.replacedDevice, scenario.rotated ? "old-device" : undefined);
        assert.deepEqual(h.stats.writes.map(write => [write.column, write.value]), scenario.writes);
        assert.deepEqual(h.data[0], [...HEADERS, "Quiz_bank"]); assert.equal(h.data[1][5], flag);
        assertOnlyDeviceWrites(h); assertOneRead(h);
        assert.deepEqual(h.stats.locks, fn === "handleConfirmDeviceRotation" ? [["wait", 10000], ["release"]] : []);
      });
    }
  }
});

test("GET and POST login, login_check, validate and confirmation cannot override the stored flag", async t => {
  for (const method of ["GET", "POST"]) {
    for (const action of ["login", "login_check", "validate", "confirm_device_rotation"]) {
      for (const stored of [0, 1]) await t.test(`${method} ${action}, stored=${stored}`, () => {
        const h = fixture({ rows: dataRows(stored) });
        const result = h.request(method, { action, Quiz_bank: stored ? 0 : 1, quiz_bank: 1,
          quizBank: true, canUploadAudio: true, role: "admin", admin: true, permissions: { Quiz_bank: 1 } }).body;
        assertFlag(result, stored); assert.equal(result.role, "user"); assert.equal(result.expiry, FUTURE);
        assertOneRead(h); assertNoWrites(h);
        assert.deepEqual(h.stats.locks, action === "validate" ? [] : action === "confirm_device_rotation"
          ? [["wait", 10000], ["release"]] : [["try", 5000], ["release"]]);
      });
    }
  }
});

test("router device registration keeps the same lock and writes, including explicit validate registration", async t => {
  for (const method of ["GET", "POST"]) {
    for (const action of ["login", "login_check", "validate", "confirm_device_rotation"]) await t.test(`${method} ${action}`, () => {
      const h = fixture({ rows: dataRows(1, { d2: "" }) });
      const result = h.request(method, { action, deviceId: "new-device", registerDevice: "true", Quiz_bank: 0 }).body;
      assertFlag(result, 1); assert.equal(result.devices, 2); assertOneRead(h); assertOnlyDeviceWrites(h);
      assert.deepEqual(h.stats.writes, [{ type: "set", row: 2, column: 3, value: "new-device" }]);
      assert.deepEqual(h.stats.locks, action === "confirm_device_rotation" ? [["wait", 10000], ["release"]] : [["try", 5000], ["release"]]);
    });
  }
  const h = fixture({ rows: dataRows(0, { d1: "", d2: "" }) });
  const result = h.request("POST", { action: undefined, deviceId: "new-device", Quiz_bank: 1 }).body;
  assertFlag(result, 0); assert.equal(result.devices, 1); assertOneRead(h); assertOnlyDeviceWrites(h);
});

test("read-only validation, expiry denial and missing users preserve errors, devices and lock release", async t => {
  for (const method of ["GET", "POST"]) {
    for (const action of ["validate", "login", "login_check", "confirm_device_rotation"]) {
      for (const problem of ["expired", "not_found"]) await t.test(`${method} ${action} ${problem}`, () => {
        const rows = dataRows(1, { expiry: problem === "expired" ? PAST : FUTURE });
        const h = fixture({ rows });
        const result = h.request(method, { action, phone: problem === "not_found" ? "39999999999" : PHONE, deviceId: "new-device", Quiz_bank: 1 }).body;
        assert.deepEqual(result, { success: false, error: problem }); assertOneRead(h); assertNoWrites(h, rows);
        assert.deepEqual(h.stats.locks, action === "validate" ? [] : action === "confirm_device_rotation"
          ? [["wait", 10000], ["release"]] : [["try", 5000], ["release"]]);
      });
    }
    await t.test(`${method} device replaced`, () => {
      const rows = dataRows(1), h = fixture({ rows });
      assert.deepEqual(h.request(method, { deviceId: "unknown", Quiz_bank: 1 }).body, { success: false, error: "device_replaced" });
      assertOneRead(h); assertNoWrites(h, rows); assert.deepEqual(h.stats.locks, []);
    });
  }
});

test("blank and invalid expiry retain legacy access behavior and device whitespace is still normalized", () => {
  for (const expiry of ["", "not a date", new Date(NOW)]) {
    const h = fixture({ rows: dataRows(1, { d1: " old-device ", expiry }) });
    const result = h.request("GET").body; assertFlag(result, 1);
    assert.equal(result.expiry, expiry instanceof Date ? new Date(NOW).toISOString() : null);
    assertOneRead(h); assertNoWrites(h);
  }
});

test("flag is taken from the matched user row, not a neighboring enabled user or the admin role", () => {
  const rows = [[...HEADERS, "Quiz_bank"], ["39999999999", "old-device", "", FUTURE, PAST, 1],
    [PHONE, "old-device", "", FUTURE, PAST, 0]];
  const h = fixture({ rows, properties: { ADMIN_PHONES: PHONE } });
  const result = h.request("GET", { phone: "+39 123456789" }).body;
  assertFlag(result, 0); assert.equal(result.role, "admin"); assertOneRead(h); assertNoWrites(h, rows);
});

test("early validation and missing-sheet failures do not read or write any rows", async t => {
  for (const method of ["GET", "POST"]) {
    for (const [name, options, input, error] of [
      ["missing sheet", { missingSheet: true }, {}, "sheet_missing"],
      ["empty phone", {}, { phone: "" }, "bad_phone"],
      ["empty device", {}, { deviceId: "" }, "bad_device"],
      ["unknown action", {}, { action: "setQuizBank", Quiz_bank: 1 }, "bad_action"]
    ]) await t.test(`${method}: ${name}`, () => {
      const h = fixture(options); assert.deepEqual(h.request(method, input).body, { success: false, error });
      assert.equal(h.stats.reads, 0); assertNoWrites(h);
    });
  }
  for (const rows of [[], [[...HEADERS, "Quiz_bank"]]]) {
    const h = fixture({ rows }); assert.deepEqual(h.request("GET").body, { success: false, error: "not_found" });
    assertOneRead(h); assertNoWrites(h, rows);
  }
});

test("busy and exceptional lock paths preserve release behavior and cannot grant the flag", async t => {
  for (const method of ["GET", "POST"]) {
    await t.test(`${method} busy`, () => {
      const h = fixture({ lockAvailable: false });
      assert.deepEqual(h.request(method, { action: "login", deviceId: "new-device" }).body, { success: false, error: "busy" });
      assert.equal(h.stats.reads, 0); assertNoWrites(h); assert.deepEqual(h.stats.locks, [["try", 5000]]);
    });
    for (const action of ["login", "confirm_device_rotation"]) {
      for (const problem of ["readError", "writeError"]) await t.test(`${method} ${action} ${problem}`, () => {
        const h = fixture({ [problem]: true });
        const result = h.request(method, { action, deviceId: "new-device" }).body;
        assert.equal(result.success, false); assert.equal(result.error, "server_error"); assert.equal(result.Quiz_bank, undefined);
        assertOneRead(h); assertNoWrites(h); assert.deepEqual(h.stats.locks.at(-1), ["release"]);
      });
    }
    await t.test(`${method} confirmation lock timeout`, () => {
      const h = fixture({ waitError: true }); const result = h.request(method, { action: "confirm_device_rotation" }).body;
      assert.equal(result.error, "server_error"); assert.equal(h.stats.reads, 0); assertNoWrites(h);
      assert.deepEqual(h.stats.locks, [["wait", 10000]]);
    });
  }
});

test("existing non-blocking user-token behavior remains unchanged; privileged actions still require both secrets", async t => {
  for (const method of ["GET", "POST"]) {
    const h = fixture({ rows: dataRows(0) });
    assertFlag(h.request(method, { token: "invalid-fixture-token", Quiz_bank: 1 }).body, 0);
    assert.match(h.stats.logs[0], /missing_or_invalid_token/); assertOneRead(h); assertNoWrites(h);
    for (const credentials of [{ token: "wrong", adminKey: ADMIN_KEY }, { adminKey: "wrong" }]) await t.test(`${method} denied ${JSON.stringify(credentials)}`, () => {
      const denied = fixture(); const result = denied.request(method, { action: "admin_update", Quiz_bank: 1, ...credentials }).body;
      assert.deepEqual(result, { status: "error", message: "unauthorized" });
      assert.equal(denied.stats.sheetLookups, 0); assert.equal(denied.stats.reads, 0); assertNoWrites(denied);
    });
    const limited = fixture({ cacheCount: 21 });
    assert.deepEqual(limited.request(method, { action: "admin_update", adminKey: ADMIN_KEY, Quiz_bank: 1 }).body,
      { status: "error", message: "rate_limited" });
    assert.equal(limited.stats.reads, 0); assertNoWrites(limited);
  }
});

test("admin updates and renewals cannot write Quiz_bank or create a missing header", async t => {
  for (const method of ["GET", "POST"]) {
    for (const present of [true, false]) {
      for (const action of ["admin_update", "admin_renew"]) await t.test(`${method} ${action}, header=${present}`, () => {
        const rows = dataRows(0); if (!present) { rows[0].pop(); rows[1].pop(); }
        const h = fixture({ rows });
        const result = h.request(method, { action, adminKey: ADMIN_KEY, Quiz_bank: 1, quiz_bank: true, expiry: FUTURE }).body;
        assert.equal(result.success, true); assert.equal(result.Quiz_bank, undefined); assertOneRead(h);
        assert.deepEqual(h.stats.writes.map(write => [write.row, write.column]), [[2, 4]]);
        assert.deepEqual(h.data[0], rows[0]); assert.deepEqual(h.data[1].slice(5), rows[1].slice(5));
      });
    }
    const noChange = fixture();
    assert.equal(noChange.request(method, { action: "admin_update", adminKey: ADMIN_KEY, Quiz_bank: 0 }).body.success, true);
    assertOneRead(noChange); assertNoWrites(noChange); assert.equal(noChange.data[1][5], 1);
    const unknown = fixture();
    assert.deepEqual(unknown.request(method, { action: "admin_set_quiz_bank", adminKey: ADMIN_KEY, Quiz_bank: 1 }).body,
      { success: false, error: "unknown_admin_action" });
    assert.equal(unknown.stats.reads, 0); assertNoWrites(unknown);
  }
});

test("admin add, reset, search, list and remove retain their existing write boundaries", async t => {
  for (const method of ["GET", "POST"]) {
    for (const action of ["admin_add", "admin_reset_devices", "admin_search", "admin_list", "admin_remove"]) await t.test(`${method} ${action}`, () => {
      const h = fixture({ rows: dataRows(0) });
      const input = { action, adminKey: ADMIN_KEY, Quiz_bank: 1, ...(action === "admin_add" ? { phone: "39999999999" } : {}) };
      const result = h.request(method, input).body; assert.equal(result.success, true); assertOneRead(h);
      assert.deepEqual(h.data[0], [...HEADERS, "Quiz_bank"]);
      if (action === "admin_add") {
        assert.equal(h.stats.writes.length, 1); assert.equal(h.stats.writes[0].type, "append");
        assert.equal(h.data.at(-1).length, 5, "No client-controlled permission is appended");
        assert.equal(h.data[1][5], 0);
      } else if (action === "admin_reset_devices") {
        assert.deepEqual(h.stats.writes, [{ type: "clear", row: 2, column: 2, height: 1, width: 2 }]);
        assert.equal(h.data[1][5], 0);
      } else if (action === "admin_remove") assert.deepEqual(h.stats.writes, [{ type: "delete", row: 2 }]);
      else assertNoWrites(h);
    });
  }
});

test("JSONP and promo dispatch keep their original response ownership", () => {
  const h = fixture(); const result = h.request("GET", { callback: "fixtureCallback" });
  assertFlag(result.body, 1); assert.equal(result.output.mimeType, "application/javascript");
  assert.match(result.output.text, /^fixtureCallback\(/); assertOneRead(h); assertNoWrites(h);
  const promo = fixture();
  assert.deepEqual(promo.request("POST", { action: "promo_redeem", Quiz_bank: 1 }).body, { success: true, promoFixture: true });
  assert.equal(promo.stats.promo.length, 1); assert.equal(promo.stats.sheetLookups, 0); assertNoWrites(promo);
});

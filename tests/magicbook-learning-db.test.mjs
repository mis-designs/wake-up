import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const learningDbSource = readFileSync(
  new URL("../google-apps-script/magicbook_learning_db.gs", import.meta.url),
  "utf8"
);

class FakeRange {
  constructor(sheet, row, column, rowCount = 1, columnCount = 1) {
    this.sheet = sheet;
    this.row = row;
    this.column = column;
    this.rowCount = rowCount;
    this.columnCount = columnCount;
  }

  getValues() {
    this.sheet.valueReads.push({ row: this.row, rows: this.rowCount, columns: this.columnCount });
    const values = [];
    for (let rowOffset = 0; rowOffset < this.rowCount; rowOffset += 1) {
      const row = [];
      for (let columnOffset = 0; columnOffset < this.columnCount; columnOffset += 1) {
        row.push(this.sheet.readCell(this.row + rowOffset, this.column + columnOffset));
      }
      values.push(row);
    }
    return values;
  }

  getValue() {
    this.sheet.singleValueReads += 1;
    return this.sheet.readCell(this.row, this.column);
  }

  setValues(values) {
    this.sheet.setValuesCalls += 1;
    assert.equal(values.length, this.rowCount);
    values.forEach((row, rowOffset) => {
      assert.equal(row.length, this.columnCount);
      row.forEach((value, columnOffset) => {
        this.sheet.writeCell(this.row + rowOffset, this.column + columnOffset, value);
      });
    });
    return this;
  }

  setValue(value) {
    this.sheet.writeCell(this.row, this.column, value);
    return this;
  }

  createTextFinder(value) {
    return new FakeTextFinder(this, value);
  }

  getRow() {
    return this.row;
  }

  setFontWeight() { return this; }
  setBackground() { return this; }
  setFontColor() { return this; }
  setHorizontalAlignment() { return this; }
  setWrap() { return this; }
  setNumberFormat() { return this; }
}

class FakeTextFinder {
  constructor(range, value) {
    this.range = range;
    this.value = String(value);
    this.entireCell = false;
    this.caseSensitive = false;
    this.regularExpression = false;
  }

  matchEntireCell(value) {
    this.entireCell = value;
    return this;
  }

  matchCase(value) { this.caseSensitive = value; return this; }
  useRegularExpression(value) { this.regularExpression = value; return this; }

  findAll() {
    this.range.sheet.searchCalls += 1;
    const found = [];
    const expression = this.regularExpression
      ? new RegExp(this.entireCell ? `^(?:${this.value})$` : this.value, this.caseSensitive ? "" : "i")
      : null;
    for (let rowOffset = 0; rowOffset < this.range.rowCount; rowOffset += 1) {
      for (let columnOffset = 0; columnOffset < this.range.columnCount; columnOffset += 1) {
        const cell = String(this.range.sheet.readCell(
          this.range.row + rowOffset,
          this.range.column + columnOffset
        ));
        const text = this.caseSensitive ? cell : cell.toLowerCase();
        const target = this.caseSensitive ? this.value : this.value.toLowerCase();
        const matches = expression ? expression.test(cell)
          : this.entireCell ? text === target : text.includes(target);
        if (matches) {
          found.push(new FakeRange(
            this.range.sheet,
            this.range.row + rowOffset,
            this.range.column + columnOffset
          ));
        }
      }
    }
    return found;
  }

  findNext() {
    return this.findAll()[0] || null;
  }
}

class FakeSheet {
  constructor(name) {
    this.name = name;
    this.cells = [];
    this.maxRows = 1000;
    this.frozenRows = 0;
    this.setValuesCalls = 0;
    this.valueReads = [];
    this.singleValueReads = 0;
    this.searchCalls = 0;
    this.lastColumnCalls = 0;
    this.lastRowCalls = 0;
  }

  getName() { return this.name; }
  setName(name) { this.name = name; return this; }
  getMaxRows() { return this.maxRows; }
  setFrozenRows(count) { this.frozenRows = count; return this; }
  setRowHeight() { return this; }
  setColumnWidth() { return this; }

  readCell(row, column) {
    return this.cells[row - 1]?.[column - 1] ?? "";
  }

  writeCell(row, column, value) {
    while (this.cells.length < row) this.cells.push([]);
    while (this.cells[row - 1].length < column) this.cells[row - 1].push("");
    this.cells[row - 1][column - 1] = value;
  }

  getLastRow() {
    this.lastRowCalls += 1;
    let lastRow = 0;
    this.cells.forEach((row, index) => {
      if (row.some(value => value !== "" && value !== null && value !== undefined)) {
        lastRow = index + 1;
      }
    });
    return lastRow;
  }

  getLastColumn() {
    this.lastColumnCalls += 1;
    let lastColumn = 0;
    this.cells.forEach(row => {
      row.forEach((value, index) => {
        if (value !== "" && value !== null && value !== undefined) {
          lastColumn = Math.max(lastColumn, index + 1);
        }
      });
    });
    return lastColumn;
  }

  getRange(row, column, rowCount = 1, columnCount = 1) {
    return new FakeRange(this, row, column, rowCount, columnCount);
  }
}

class FakeSpreadsheet {
  constructor(id, name) {
    this.id = id;
    this.name = name;
    this.sheets = [new FakeSheet("Sheet1")];
  }

  getId() { return this.id; }
  getUrl() { return `https://docs.google.com/spreadsheets/d/${this.id}/edit`; }
  getSheets() { return this.sheets.slice(); }
  getSheetByName(name) { return this.sheets.find(sheet => sheet.getName() === name) || null; }

  insertSheet(name) {
    const sheet = new FakeSheet(name);
    this.sheets.push(sheet);
    return sheet;
  }
}

function createRuntime() {
  const scriptProperties = new Map([
    ["GAS_SECRET", "test-gas-secret"],
    ["MAGICBOOK_LEARNING_DB_ID", "bound-spreadsheet"]
  ]);
  const spreadsheets = new Map();
  const logEntries = [];
  const lockStats = { attempts: 0, releases: 0, available: true, held: false, timeouts: [] };
  const spreadsheetStats = { activeCalls: 0, createCalls: 0, openByIdCalls: 0, flushCalls: 0, failFlush: false };
  const activeSpreadsheet = new FakeSpreadsheet("bound-spreadsheet", "Magic Book");
  spreadsheets.set(activeSpreadsheet.getId(), activeSpreadsheet);
  let activeSpreadsheetAvailable = true;
  let uuidSequence = 0;

  const SpreadsheetApp = {
    flush() {
      assert.equal(lockStats.held, true, "pending writes must be committed while the lock is held");
      spreadsheetStats.flushCalls += 1;
      if (spreadsheetStats.failFlush) throw new Error("flush_failed");
    },
    getActiveSpreadsheet() {
      spreadsheetStats.activeCalls += 1;
      return activeSpreadsheetAvailable ? activeSpreadsheet : null;
    },
    create() {
      spreadsheetStats.createCalls += 1;
      throw new Error("SpreadsheetApp.create() must not be called");
    },
    openById(spreadsheetId) {
      spreadsheetStats.openByIdCalls += 1;
      const spreadsheet = spreadsheets.get(spreadsheetId);
      if (!spreadsheet) throw new Error("Spreadsheet not found");
      return spreadsheet;
    }
  };

  const LockService = {
    getScriptLock() {
      let acquired = false;
      return {
        tryLock(timeout) {
          lockStats.attempts += 1;
          lockStats.timeouts.push(timeout);
          acquired = lockStats.available && !lockStats.held;
          if (acquired) lockStats.held = true;
          return acquired;
        },
        releaseLock() {
          assert.equal(acquired, true, "a lock must be acquired before release");
          lockStats.releases += 1;
          lockStats.held = false;
          acquired = false;
        }
      };
    }
  };

  const PropertiesService = {
    getScriptProperties() {
      return {
        getProperty(key) { return scriptProperties.get(key) ?? null; }
      };
    }
  };

  const ContentService = {
    MimeType: { JSON: "application/json" },
    createTextOutput(text) {
      return {
        text,
        mimeType: "",
        setMimeType(mimeType) { this.mimeType = mimeType; return this; }
      };
    }
  };

  const context = vm.createContext({
    Array,
    Date,
    Error,
    ContentService,
    JSON,
    LockService,
    Logger: { log(...args) { logEntries.push(args); } },
    Math,
    Number,
    Object,
    PropertiesService,
    RegExp,
    SpreadsheetApp,
    String,
    Utilities: {
      getUuid() {
        uuidSequence += 1;
        return `00000000-0000-4000-8000-${String(uuidSequence).padStart(12, "0")}`;
      }
    },
    console,
    isFinite,
    isNaN
  });
  vm.runInContext(learningDbSource, context, {
    filename: "google-apps-script/magicbook_learning_db.gs"
  });

  // Simulate the database that already exists in production. Creation here is
  // test-fixture setup, not behavior provided by the Apps Script under test.
  Array.from(context.LEARNING_DB_SHEET_ORDER_).forEach(sheetName => {
    const sheet = activeSpreadsheet.insertSheet(sheetName);
    const schema = Array.from(context.LEARNING_DB_SCHEMA[sheetName]);
    sheet.getRange(1, 1, 1, schema.length).setValues([schema]);
  });

  return {
    context,
    spreadsheets,
    activeSpreadsheet,
    logEntries,
    lockStats,
    spreadsheetStats,
    scriptProperties,
    setActiveSpreadsheetAvailable(value) { activeSpreadsheetAvailable = value; }
  };
}

function headers(sheet) {
  return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
}

function columnIndex(sheet, name) {
  return headers(sheet).indexOf(name) + 1;
}

test("TEST 1: setup validates the existing Spreadsheet configured by ID", () => {
  const runtime = createRuntime();
  const summary = runtime.context.setupLearningDatabase();
  const spreadsheet = runtime.spreadsheets.get(summary.spreadsheetId);
  const expectedSheetNames = Array.from(runtime.context.LEARNING_DB_SHEET_ORDER_);

  assert.equal(spreadsheet, runtime.activeSpreadsheet);
  assert.equal(summary.sheetsChecked, 14);
  assert.equal(summary.sheetsCreated, 0);
  assert.equal(summary.columnsAdded, 0);
  assert.equal(summary.schemaVersion, 1);
  assert.deepEqual(
    spreadsheet.getSheets().map(sheet => sheet.getName()),
    ["Sheet1", ...expectedSheetNames]
  );
  expectedSheetNames.forEach(sheetName => {
    assert.deepEqual(
      headers(spreadsheet.getSheetByName(sheetName)),
      Array.from(runtime.context.LEARNING_DB_SCHEMA[sheetName])
    );
  });
  assert.equal(runtime.spreadsheetStats.createCalls, 0);
  assert.equal(runtime.spreadsheetStats.activeCalls, 0);
  assert.equal(runtime.spreadsheetStats.openByIdCalls, 1);
  assert.equal(runtime.logEntries.length, 1);
});

test("TEST 2: a second setup does not duplicate sheets or columns", () => {
  const runtime = createRuntime();
  const first = runtime.context.setupLearningDatabase();
  const spreadsheet = runtime.spreadsheets.get(first.spreadsheetId);
  const firstHeaders = spreadsheet.getSheets().map(sheet => headers(sheet));
  const second = runtime.context.setupLearningDatabase();

  assert.equal(second.spreadsheetId, first.spreadsheetId);
  assert.equal(second.sheetsCreated, 0);
  assert.equal(second.columnsAdded, 0);
  assert.equal(spreadsheet.getSheets().length, 15);
  assert.deepEqual(spreadsheet.getSheets().map(sheet => headers(sheet)), firstHeaders);
  assert.equal(runtime.spreadsheetStats.createCalls, 0);
  assert.equal(runtime.spreadsheetStats.activeCalls, 0);
  assert.equal(runtime.spreadsheetStats.openByIdCalls, 2);
});

test("setup fails clearly when MAGICBOOK_LEARNING_DB_ID is missing", () => {
  const runtime = createRuntime();
  runtime.scriptProperties.delete("MAGICBOOK_LEARNING_DB_ID");

  assert.throws(
    () => runtime.context.setupLearningDatabase(),
    /Configura la proprietà script MAGICBOOK_LEARNING_DB_ID/
  );
  assert.equal(runtime.spreadsheetStats.createCalls, 0);
  assert.equal(runtime.spreadsheetStats.openByIdCalls, 0);
  assert.equal(runtime.lockStats.releases, 0);
});

test("diagnostics verify the existing database without exposing IDs or secrets", () => {
  const runtime = createRuntime();
  const report = runtime.context.diagnoseLearningDatabase();
  const serializedLog = JSON.stringify(runtime.logEntries);

  assert.equal(report.success, true);
  assert.equal(report.apiVersion, 2);
  assert.equal(report.databaseIdConfigured, true);
  assert.equal(report.proxySecretConfigured, true);
  assert.equal(report.databaseAccessible, true);
  assert.equal(report.schemaValid, true);
  assert.equal(report.error, null);
  assert.equal(serializedLog.includes("bound-spreadsheet"), false);
  assert.equal(serializedLog.includes("test-gas-secret"), false);
});

test("diagnostics and doPost identify a missing proxy secret safely", () => {
  const runtime = createRuntime();
  runtime.scriptProperties.delete("GAS_SECRET");
  const report = runtime.context.diagnoseLearningDatabase();
  const output = runtime.context.doPost({
    postData: {
      contents: JSON.stringify({ action: "learning_insights", user_id: "3331112222" })
    }
  });

  assert.equal(report.success, false);
  assert.equal(report.databaseAccessible, true);
  assert.equal(report.schemaValid, true);
  assert.equal(report.error, "gas_secret_missing");
  assert.equal(JSON.parse(output.text).error, "gas_secret_missing");
});

test("diagnostics identify an inaccessible configured database", () => {
  const runtime = createRuntime();
  runtime.scriptProperties.set("MAGICBOOK_LEARNING_DB_ID", "missing-spreadsheet");
  const report = runtime.context.diagnoseLearningDatabase();

  assert.equal(report.success, false);
  assert.equal(report.databaseIdConfigured, true);
  assert.equal(report.databaseAccessible, false);
  assert.equal(report.schemaValid, false);
  assert.equal(report.error, "database_open_failed");
});

test("proxy secret comparison ignores accidental surrounding whitespace", () => {
  const runtime = createRuntime();
  runtime.scriptProperties.set("GAS_SECRET", "  test-gas-secret  ");

  assert.equal(runtime.context.learningVerifyProxyToken_("test-gas-secret"), true);
});

test("TEST 3: setup preserves an existing ANSWER_EVENTS row", () => {
  const runtime = createRuntime();
  const summary = runtime.context.setupLearningDatabase();
  const spreadsheet = runtime.spreadsheets.get(summary.spreadsheetId);
  const answerSheet = spreadsheet.getSheetByName("ANSWER_EVENTS");
  const existingRow = Array.from({ length: answerSheet.getLastColumn() }, () => "");
  existingRow[0] = "ans_existing";
  existingRow[1] = "user_existing";
  existingRow[2] = "quiz_existing";
  answerSheet.getRange(2, 1, 1, existingRow.length).setValues([existingRow]);

  runtime.context.setupLearningDatabase();

  assert.deepEqual(
    answerSheet.getRange(2, 1, 1, existingRow.length).getValues()[0],
    existingRow
  );
});

test("TEST 4: setup reports a missing column without modifying the existing sheet", () => {
  const runtime = createRuntime();
  const summary = runtime.context.setupLearningDatabase();
  const spreadsheet = runtime.spreadsheets.get(summary.spreadsheetId);
  const answerSheet = spreadsheet.getSheetByName("ANSWER_EVENTS");
  const originalWidth = answerSheet.getLastColumn();
  const existingRow = Array.from({ length: originalWidth }, (_, index) => `value-${index}`);
  answerSheet.getRange(2, 1, 1, originalWidth).setValues([existingRow]);
  runtime.context.LEARNING_DB_SCHEMA.ANSWER_EVENTS.push("future_signal");

  assert.throws(
    () => runtime.context.setupLearningDatabase(),
    /Missing required column future_signal in ANSWER_EVENTS/
  );
  assert.equal(answerSheet.getLastColumn(), originalWidth);
  assert.deepEqual(
    answerSheet.getRange(2, 1, 1, originalWidth).getValues()[0],
    existingRow
  );
});

test("TEST 5: appendAnswerEvent writes a typed, append-only event row", () => {
  const runtime = createRuntime();
  const summary = runtime.context.setupLearningDatabase();
  const spreadsheet = runtime.spreadsheets.get(summary.spreadsheetId);
  const answerSheet = spreadsheet.getSheetByName("ANSWER_EVENTS");

  const created = runtime.context.appendAnswerEvent({
    user_id: "user-42",
    quiz_id: "q1842",
    result: "wrong",
    user_answer: "=UNTRUSTED()",
    answered_at: "2026-08-21T18:42:00.000+02:00",
    response_time_ms: 11000,
    response_time_valid: true,
    page_was_hidden: false,
    mode: "chapter_quiz",
    session_id: "ses-existing",
    attempt_number: 2,
    client_version: "1.0.0"
  });

  assert.match(created.event_id, /^ans_[a-f0-9]{32}$/);
  assert.equal(answerSheet.getLastRow(), 2);
  assert.equal(answerSheet.getRange(2, columnIndex(answerSheet, "event_id")).getValue(), created.event_id);
  assert.equal(answerSheet.getRange(2, columnIndex(answerSheet, "result")).getValue(), "WRONG");
  assert.equal(answerSheet.getRange(2, columnIndex(answerSheet, "user_answer")).getValue(), "'=UNTRUSTED()");
  assert.equal(answerSheet.getRange(2, columnIndex(answerSheet, "response_time_valid")).getValue(), true);
  assert.ok(answerSheet.getRange(2, columnIndex(answerSheet, "answered_at")).getValue() instanceof Date);
  assert.ok(answerSheet.getRange(2, columnIndex(answerSheet, "created_at")).getValue() instanceof Date);
});

test("TEST 6: rapid writes use and release the script lock for every event", () => {
  const runtime = createRuntime();
  const summary = runtime.context.setupLearningDatabase();
  const spreadsheet = runtime.spreadsheets.get(summary.spreadsheetId);
  const answerSheet = spreadsheet.getSheetByName("ANSWER_EVENTS");
  runtime.lockStats.attempts = 0;
  runtime.lockStats.releases = 0;

  const first = runtime.context.appendAnswerEvent({
    user_id: "user-1",
    quiz_id: "q1",
    result: "CORRECT"
  });
  const second = runtime.context.appendAnswerEvent({
    user_id: "user-2",
    quiz_id: "q2",
    result: "WRONG"
  });

  assert.notEqual(first.event_id, second.event_id);
  assert.equal(answerSheet.getLastRow(), 3);
  assert.equal(runtime.lockStats.attempts, 2);
  assert.equal(runtime.lockStats.releases, 2);
});

test("session helpers start and end one session without rewriting other rows", () => {
  const runtime = createRuntime();
  const summary = runtime.context.setupLearningDatabase();
  const spreadsheet = runtime.spreadsheets.get(summary.spreadsheetId);
  const sessionSheet = spreadsheet.getSheetByName("STUDY_SESSIONS");
  const started = runtime.context.startStudySession({
    user_id: "user-7",
    mode: "simulation",
    started_at: "2026-08-21T10:00:00.000Z"
  });

  const ended = runtime.context.endStudySession({
    session_id: started.session_id,
    ended_at: "2026-08-21T10:15:00.000Z",
    total_answers: 12,
    correct_answers: 10,
    wrong_answers: 2
  });

  assert.equal(ended.duration_ms, 900000);
  assert.equal(sessionSheet.getRange(2, columnIndex(sessionSheet, "total_answers")).getValue(), 12);
  assert.equal(sessionSheet.getRange(2, columnIndex(sessionSheet, "correct_answers")).getValue(), 10);
  assert.equal(sessionSheet.getRange(2, columnIndex(sessionSheet, "wrong_answers")).getValue(), 2);
});

test("TEST E: batch sync writes once, preserves event IDs and treats retries as duplicates", () => {
  const runtime = createRuntime();
  const summary = runtime.context.setupLearningDatabase();
  const answerSheet = runtime.spreadsheets
    .get(summary.spreadsheetId)
    .getSheetByName("ANSWER_EVENTS");
  const existingId = "ans_1111111111111111";
  const acceptedId = "ans_2222222222222222";
  const rejectedId = "ans_3333333333333333";
  runtime.context.appendAnswerEvent({
    event_id: existingId,
    user_id: "user-1",
    quiz_id: "q1",
    result: "CORRECT"
  });
  answerSheet.setValuesCalls = 0;

  const output = runtime.context.doPost({
    postData: {
      contents: JSON.stringify({
        action: "learning_sync",
        token: "test-gas-secret",
        events: [
          {
            event_id: existingId,
            event_type: "answer_event",
            user_id: "user-1",
            payload: { event_id: existingId, user_id: "user-1", quiz_id: "q1", result: "CORRECT" }
          },
          {
            event_id: acceptedId,
            event_type: "answer_event",
            user_id: "user-1",
            payload: { event_id: acceptedId, user_id: "user-1", quiz_id: "q2", result: "WRONG" }
          },
          {
            event_id: rejectedId,
            event_type: "answer_event",
            user_id: "user-1",
            payload: { event_id: rejectedId, user_id: "user-1", quiz_id: "q3", result: "MAYBE" }
          }
        ]
      })
    }
  });
  const result = JSON.parse(output.text);

  assert.deepEqual(Array.from(result.accepted), [acceptedId]);
  assert.deepEqual(Array.from(result.duplicates), [existingId]);
  assert.equal(result.rejected[0].event_id, rejectedId);
  assert.equal(answerSheet.setValuesCalls, 1);
  assert.equal(answerSheet.getLastRow(), 3);

  const retryOutput = runtime.context.doPost({
    postData: {
      contents: JSON.stringify({
        action: "learning_sync",
        token: "test-gas-secret",
        events: [{
          event_id: acceptedId,
          event_type: "answer_event",
          user_id: "user-1",
          payload: { event_id: acceptedId, user_id: "user-1", quiz_id: "q2", result: "WRONG" }
        }]
      })
    }
  });
  const retryResult = JSON.parse(retryOutput.text);
  assert.deepEqual(Array.from(retryResult.duplicates), [acceptedId]);
  assert.equal(answerSheet.getLastRow(), 3);
});

test("learning insights returns only the requested user's recent answer events", () => {
  const runtime = createRuntime();
  runtime.context.setupLearningDatabase();
  runtime.context.appendAnswerEvent({
    event_id: "ans_4444444444444444",
    user_id: "3331112222",
    quiz_id: "cap1_q1",
    result: "CORRECT",
    answered_at: "2026-08-21T09:00:00.000Z"
  });
  runtime.context.appendAnswerEvent({
    event_id: "ans_5555555555555555",
    user_id: "3339998888",
    quiz_id: "cap1_q2",
    result: "WRONG",
    answered_at: "2026-08-21T09:05:00.000Z"
  });
  runtime.context.appendAnswerEvent({
    event_id: "ans_6666666666666666",
    user_id: "3331112222",
    quiz_id: "cap1_q3",
    result: "WRONG",
    answered_at: "2026-08-21T09:10:00.000Z"
  });

  const output = runtime.context.doPost({
    postData: {
      contents: JSON.stringify({
        action: "learning_insights",
        token: "test-gas-secret",
        user_id: "3331112222"
      })
    }
  });
  const result = JSON.parse(output.text);

  assert.equal(result.success, true);
  assert.equal(result.events.length, 2);
  assert.ok(result.events.every(event => event.user_id === "3331112222"));
  assert.deepEqual(Array.from(result.events, event => event.quiz_id), ["cap1_q1", "cap1_q3"]);
});

function syncAnswer(eventId) {
  return {
    event_id: eventId,
    event_type: "answer_event",
    user_id: "3331112222",
    payload: { quiz_id: "cap1_q1", result: "CORRECT" }
  };
}

test("a batch searches durable IDs without downloading history and reads dimensions once", () => {
  const runtime = createRuntime();
  const sheet = runtime.activeSpreadsheet.getSheetByName("ANSWER_EVENTS");
  // Include an old ID well outside any hypothetical recent-ID cache window.
  for (let i = 0; i < 10000; i++) {
    sheet.writeCell(i + 2, 1, `ans_${String(i).padStart(20, "0")}`);
  }
  const events = Array.from({ length: 25 }, (_, i) => syncAnswer(`ans_${String(10000 + i).padStart(20, "0")}`));
  events[0] = syncAnswer("ans_00000000000000000000");
  sheet.valueReads = [];
  sheet.lastColumnCalls = 0;
  sheet.lastRowCalls = 0;
  const result = runtime.context.syncLearningEventsBatch_(events);

  assert.equal(result.success, true);
  assert.equal(result.accepted.length, 24);
  assert.deepEqual(Array.from(result.duplicates), [events[0].event_id]);
  assert.equal(sheet.searchCalls, 1);
  assert.equal(sheet.singleValueReads, 0);
  assert.deepEqual(sheet.valueReads, [
    { row: 1, rows: 1, columns: 14 }, { row: 2, rows: 1, columns: 1 }
  ]);
  assert.equal(sheet.lastColumnCalls, 1);
  assert.equal(sheet.lastRowCalls, 1);
  assert.equal(runtime.spreadsheetStats.flushCalls, 1);
  assert.equal(runtime.lockStats.releases, 1);
});

test("ID search retains exact case, whole-cell identity and legacy whitespace trimming", () => {
  const runtime = createRuntime();
  const sheet = runtime.activeSpreadsheet.getSheetByName("ANSWER_EVENTS");
  const mixed = "ans_AAAAAAAAAAAAAAAA";
  const spaced = "ans_bbbbbbbbbbbbbbbb";
  const partial = "ans_cccccccccccccccc";
  sheet.writeCell(2, 1, mixed.toLowerCase());
  sheet.writeCell(3, 1, `  ${spaced}\n`);
  sheet.writeCell(4, 1, `${partial}_extra`);
  const result = runtime.context.syncLearningEventsBatch_([mixed, spaced, partial].map(syncAnswer));
  assert.deepEqual(Array.from(result.accepted), [mixed, partial]);
  assert.deepEqual(Array.from(result.duplicates), [spaced]);
});

test("a fresh runtime deduplicates a repeated batch against stored rows, not a cache", () => {
  const first = createRuntime();
  const event = syncAnswer("ans_1111111111111111");
  const result = first.context.syncLearningEventsBatch_([event, event]);
  assert.deepEqual(Array.from(result.accepted), [event.event_id]);
  assert.equal(result.duplicates.length, 0);
  const second = createRuntime();
  const sheet = second.activeSpreadsheet.getSheetByName("ANSWER_EVENTS");
  sheet.cells = structuredClone(first.activeSpreadsheet.getSheetByName("ANSWER_EVENTS").cells);
  const retry = second.context.syncLearningEventsBatch_([event]);
  assert.equal(retry.accepted.length, 0);
  assert.deepEqual(Array.from(retry.duplicates), [event.event_id]);
  assert.equal(sheet.getLastRow(), 2);
  assert.equal(second.spreadsheetStats.flushCalls, 0);
});

test("busy sync backs off quickly without opening or writing the database", () => {
  const runtime = createRuntime();
  runtime.lockStats.available = false;
  const result = runtime.context.syncLearningEventsBatch_([syncAnswer("ans_1111111111111111")]);
  assert.equal(result.success, false);
  assert.equal(result.error, "busy");
  assert.equal(result.retryAfterSeconds, 15);
  assert.deepEqual(runtime.lockStats.timeouts, [1000]);
  assert.equal(runtime.spreadsheetStats.openByIdCalls, 0);
  assert.equal(runtime.lockStats.releases, 0);
});

test("invalid-only sync batches require neither a lock nor a database call", () => {
  const runtime = createRuntime();
  const result = runtime.context.syncLearningEventsBatch_([{ event_id: "invalid" }]);
  assert.equal(result.success, true);
  assert.equal(result.rejected.length, 1);
  assert.equal(runtime.lockStats.attempts, 0);
  assert.equal(runtime.spreadsheetStats.openByIdCalls, 0);
});

test("mixed-sheet sync retries preserve a completed first write after the second sheet fails", () => {
  const runtime = createRuntime();
  const activitySheet = runtime.activeSpreadsheet.getSheetByName("STUDY_ACTIVITY_EVENTS");
  const activityHeader = activitySheet.readCell(1, 1);
  activitySheet.writeCell(1, 1, "missing_event_id");
  const answer = syncAnswer("ans_1111111111111111");
  const activity = {
    event_id: "act_2222222222222222", event_type: "study_activity_event", user_id: "3331112222",
    payload: { activity_type: "review", entity_type: "word", entity_id: "precedenza" }
  };
  assert.throws(() => runtime.context.syncLearningEventsBatch_([answer, activity]), /Missing required column/);
  assert.equal(runtime.spreadsheetStats.flushCalls, 1);
  assert.equal(runtime.lockStats.releases, 1);
  activitySheet.writeCell(1, 1, activityHeader);
  const result = runtime.context.syncLearningEventsBatch_([answer, activity]);
  assert.deepEqual(Array.from(result.accepted), [activity.event_id]);
  assert.deepEqual(Array.from(result.duplicates), [answer.event_id]);
  assert.equal(runtime.activeSpreadsheet.getSheetByName("ANSWER_EVENTS").getLastRow(), 2);
});

test("a flush failure still releases the script lock and a retry does not duplicate stored IDs", () => {
  const runtime = createRuntime();
  const event = syncAnswer("ans_1111111111111111");
  runtime.spreadsheetStats.failFlush = true;
  assert.throws(() => runtime.context.syncLearningEventsBatch_([event]), /flush_failed/);
  assert.equal(runtime.lockStats.held, false);
  assert.equal(runtime.lockStats.releases, 1);
  runtime.spreadsheetStats.failFlush = false;
  const retry = runtime.context.syncLearningEventsBatch_([event]);
  assert.deepEqual(Array.from(retry.duplicates), [event.event_id]);
});

test("batch schema mapping preserves reordered headers and additional columns", () => {
  const runtime = createRuntime();
  const sheet = runtime.activeSpreadsheet.getSheetByName("ANSWER_EVENTS");
  sheet.cells[0].reverse();
  sheet.cells[0].push("custom_column");
  const event = syncAnswer("ans_1111111111111111");
  runtime.context.syncLearningEventsBatch_([event]);
  assert.equal(sheet.readCell(2, columnIndex(sheet, "event_id")), event.event_id);
  assert.equal(sheet.readCell(2, columnIndex(sheet, "quiz_id")), "cap1_q1");
  assert.equal(sheet.readCell(2, columnIndex(sheet, "custom_column")), "");
  const retry = runtime.context.syncLearningEventsBatch_([event]);
  assert.deepEqual(Array.from(retry.duplicates), [event.event_id]);
});

test("an uncertain setValues failure is flushed before release and can be retried safely", () => {
  const runtime = createRuntime();
  const sheet = runtime.activeSpreadsheet.getSheetByName("ANSWER_EVENTS");
  const originalGetRange = sheet.getRange;
  sheet.getRange = function (...args) {
    const range = originalGetRange.apply(this, args);
    if (args[0] >= 2) {
      const originalWrite = range.setValues;
      range.setValues = function (values) {
        originalWrite.call(this, values);
        throw new Error("write_response_lost");
      };
    }
    return range;
  };
  const event = syncAnswer("ans_1111111111111111");
  assert.throws(() => runtime.context.syncLearningEventsBatch_([event]), /write_response_lost/);
  assert.equal(runtime.spreadsheetStats.flushCalls, 1);
  assert.equal(runtime.lockStats.held, false);
  sheet.getRange = originalGetRange;
  const retry = runtime.context.syncLearningEventsBatch_([event]);
  assert.deepEqual(Array.from(retry.duplicates), [event.event_id]);
  assert.equal(sheet.getLastRow(), 2);
});

test("a competing sync cannot append the same ID while the first batch holds the lock", () => {
  const runtime = createRuntime();
  const sheet = runtime.activeSpreadsheet.getSheetByName("ANSWER_EVENTS");
  const originalGetRange = sheet.getRange;
  const event = syncAnswer("ans_1111111111111111");
  let competingResult;
  sheet.getRange = function (...args) {
    const range = originalGetRange.apply(this, args);
    if (args[0] >= 2) {
      const originalWrite = range.setValues;
      range.setValues = function (values) {
        competingResult = runtime.context.syncLearningEventsBatch_([event]);
        return originalWrite.call(this, values);
      };
    }
    return range;
  };
  const first = runtime.context.syncLearningEventsBatch_([event]);
  assert.equal(competingResult.error, "busy");
  assert.deepEqual(Array.from(first.accepted), [event.event_id]);
  const retry = runtime.context.syncLearningEventsBatch_([event]);
  assert.deepEqual(Array.from(retry.duplicates), [event.event_id]);
  assert.equal(sheet.getLastRow(), 2);
});

test("a full retried batch reads its adjacent matches together without rewriting rows", () => {
  const runtime = createRuntime();
  const sheet = runtime.activeSpreadsheet.getSheetByName("ANSWER_EVENTS");
  const events = Array.from({ length: 25 }, (_, i) => syncAnswer(`ans_${String(i).padStart(20, "0")}`));
  runtime.context.syncLearningEventsBatch_(events);
  sheet.valueReads = [];
  sheet.setValuesCalls = 0;
  const retry = runtime.context.syncLearningEventsBatch_(events);
  assert.equal(retry.accepted.length, 0);
  assert.equal(retry.duplicates.length, 25);
  assert.deepEqual(sheet.valueReads, [
    { row: 1, rows: 1, columns: 14 }, { row: 2, rows: 25, columns: 1 }
  ]);
  assert.equal(sheet.singleValueReads, 0);
  assert.equal(sheet.setValuesCalls, 0);
});

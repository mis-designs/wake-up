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
  }

  matchEntireCell(value) {
    this.entireCell = value;
    return this;
  }

  findNext() {
    for (let rowOffset = 0; rowOffset < this.range.rowCount; rowOffset += 1) {
      for (let columnOffset = 0; columnOffset < this.range.columnCount; columnOffset += 1) {
        const cell = String(this.range.sheet.readCell(
          this.range.row + rowOffset,
          this.range.column + columnOffset
        ));
        const matches = this.entireCell ? cell === this.value : cell.includes(this.value);
        if (matches) {
          return new FakeRange(
            this.range.sheet,
            this.range.row + rowOffset,
            this.range.column + columnOffset
          );
        }
      }
    }
    return null;
  }
}

class FakeSheet {
  constructor(name) {
    this.name = name;
    this.cells = [];
    this.maxRows = 1000;
    this.frozenRows = 0;
    this.setValuesCalls = 0;
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
    let lastRow = 0;
    this.cells.forEach((row, index) => {
      if (row.some(value => value !== "" && value !== null && value !== undefined)) {
        lastRow = index + 1;
      }
    });
    return lastRow;
  }

  getLastColumn() {
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
  const scriptProperties = new Map([["GAS_SECRET", "test-gas-secret"]]);
  const spreadsheets = new Map();
  const logEntries = [];
  const lockStats = { attempts: 0, releases: 0, available: true };
  const spreadsheetStats = { activeCalls: 0, createCalls: 0, openByIdCalls: 0 };
  const activeSpreadsheet = new FakeSpreadsheet("bound-spreadsheet", "Magic Book");
  spreadsheets.set(activeSpreadsheet.getId(), activeSpreadsheet);
  let activeSpreadsheetAvailable = true;
  let uuidSequence = 0;

  const SpreadsheetApp = {
    getActiveSpreadsheet() {
      spreadsheetStats.activeCalls += 1;
      return activeSpreadsheetAvailable ? activeSpreadsheet : null;
    },
    create() {
      spreadsheetStats.createCalls += 1;
      throw new Error("SpreadsheetApp.create() must not be called");
    },
    openById() {
      spreadsheetStats.openByIdCalls += 1;
      throw new Error("SpreadsheetApp.openById() must not be called");
    }
  };

  const LockService = {
    getScriptLock() {
      let acquired = false;
      return {
        tryLock() {
          lockStats.attempts += 1;
          acquired = lockStats.available;
          return acquired;
        },
        releaseLock() {
          assert.equal(acquired, true, "a lock must be acquired before release");
          lockStats.releases += 1;
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

test("TEST 1: first setup configures the bound Spreadsheet without creating another file", () => {
  const runtime = createRuntime();
  const summary = runtime.context.setupLearningDatabase();
  const spreadsheet = runtime.spreadsheets.get(summary.spreadsheetId);
  const expectedSheetNames = Array.from(runtime.context.LEARNING_DB_SHEET_ORDER_);

  assert.equal(spreadsheet, runtime.activeSpreadsheet);
  assert.equal(summary.sheetsCreated, 14);
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
    assert.equal(spreadsheet.getSheetByName(sheetName).frozenRows, 1);
  });
  assert.equal(runtime.spreadsheetStats.createCalls, 0);
  assert.equal(runtime.spreadsheetStats.openByIdCalls, 0);
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
  assert.equal(runtime.spreadsheetStats.openByIdCalls, 0);
});

test("setup fails clearly when the Apps Script project is not bound to a Spreadsheet", () => {
  const runtime = createRuntime();
  runtime.setActiveSpreadsheetAvailable(false);

  assert.throws(
    () => runtime.context.setupLearningDatabase(),
    /deve essere collegato al Google Sheet utilizzato come Magic Book Learning Database/
  );
  assert.equal(runtime.spreadsheetStats.createCalls, 0);
  assert.equal(runtime.spreadsheetStats.openByIdCalls, 0);
  assert.equal(runtime.lockStats.releases, 1);
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

test("TEST 4: a future schema column is appended once without shifting data", () => {
  const runtime = createRuntime();
  const summary = runtime.context.setupLearningDatabase();
  const spreadsheet = runtime.spreadsheets.get(summary.spreadsheetId);
  const answerSheet = spreadsheet.getSheetByName("ANSWER_EVENTS");
  const originalWidth = answerSheet.getLastColumn();
  const existingRow = Array.from({ length: originalWidth }, (_, index) => `value-${index}`);
  answerSheet.getRange(2, 1, 1, originalWidth).setValues([existingRow]);
  runtime.context.LEARNING_DB_SCHEMA.ANSWER_EVENTS.push("future_signal");

  const upgraded = runtime.context.setupLearningDatabase();
  const repeated = runtime.context.setupLearningDatabase();

  assert.equal(upgraded.columnsAdded, 1);
  assert.equal(repeated.columnsAdded, 0);
  assert.equal(answerSheet.getLastColumn(), originalWidth + 1);
  assert.equal(headers(answerSheet).at(-1), "future_signal");
  assert.deepEqual(
    answerSheet.getRange(2, 1, 1, originalWidth).getValues()[0],
    existingRow
  );
  assert.equal(answerSheet.getRange(2, originalWidth + 1).getValue(), "");
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

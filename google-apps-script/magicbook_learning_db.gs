/**
 * Magic Book learning data layer for Google Apps Script + Google Sheets.
 *
 * The database and its sheets must already exist. This code never creates a
 * Spreadsheet, a sheet or a schema column. setupLearningDatabase() is retained
 * as a read-only validation command for the Apps Script editor.
 */

var LEARNING_DB_SCHEMA_VERSION_ = 1;
var LEARNING_DB_ID_PROPERTY_ = 'MAGICBOOK_LEARNING_DB_ID';
var LEARNING_DB_WRITE_LOCK_TIMEOUT_MS_ = 5000;
var LEARNING_DB_MAX_BATCH_SIZE_ = 25;
var LEARNING_DB_MAX_INSIGHT_EVENTS_ = 10000;
var LEARNING_DB_READ_CHUNK_SIZE_ = 1000;

var LEARNING_DB_SCHEMA = {
  DB_META: [
    'key',
    'value',
    'updated_at'
  ],
  ANSWER_EVENTS: [
    'event_id',
    'user_id',
    'quiz_id',
    'result',
    'user_answer',
    'answered_at',
    'response_time_ms',
    'response_time_valid',
    'page_was_hidden',
    'mode',
    'session_id',
    'attempt_number',
    'client_version',
    'created_at'
  ],
  STUDY_ACTIVITY_EVENTS: [
    'event_id',
    'user_id',
    'session_id',
    'activity_type',
    'entity_type',
    'entity_id',
    'started_at',
    'completed_at',
    'duration_ms',
    'metadata_json',
    'created_at'
  ],
  STUDY_SESSIONS: [
    'session_id',
    'user_id',
    'mode',
    'started_at',
    'ended_at',
    'duration_ms',
    'total_answers',
    'correct_answers',
    'wrong_answers',
    'created_at',
    'updated_at'
  ],
  USER_QUIZ_STATS: [
    'user_id',
    'quiz_id',
    'attempts',
    'correct_count',
    'wrong_count',
    'accuracy_pct',
    'recent_accuracy_pct',
    'current_streak',
    'streak_type',
    'last_result',
    'last_seen',
    'last_error_at',
    'avg_response_time_ms',
    'updated_at'
  ],
  USER_FIGURE_STATS: [
    'user_id',
    'figure_id',
    'linked_quizzes_seen',
    'different_quizzes_wrong',
    'total_attempts',
    'correct_count',
    'wrong_count',
    'accuracy_pct',
    'recent_accuracy_pct',
    'risk_score',
    'status',
    'last_seen',
    'last_error_at',
    'last_review_at',
    'correct_after_review',
    'wrong_after_review',
    'updated_at'
  ],
  USER_WORD_STATS: [
    'user_id',
    'word_key',
    'quiz_occurrences',
    'correct_count',
    'wrong_count',
    'accuracy_pct',
    'recent_accuracy_pct',
    'baseline_delta_pct',
    'risk_score',
    'status',
    'last_seen',
    'last_error_at',
    'last_review_at',
    'updated_at'
  ],
  USER_TOPIC_STATS: [
    'user_id',
    'chapter_id',
    'topic_id',
    'quizzes_seen',
    'different_quizzes_wrong',
    'total_attempts',
    'correct_count',
    'wrong_count',
    'accuracy_pct',
    'recent_accuracy_pct',
    'risk_score',
    'status',
    'last_seen',
    'last_error_at',
    'updated_at'
  ],
  USER_CHAPTER_STATS: [
    'user_id',
    'chapter_id',
    'total_quizzes',
    'quizzes_seen',
    'coverage_pct',
    'total_attempts',
    'correct_count',
    'wrong_count',
    'accuracy_pct',
    'recent_accuracy_pct',
    'active_errors',
    'resolved_errors',
    'figures_to_review',
    'words_to_review',
    'topics_to_review',
    'risk_score',
    'status',
    'last_seen',
    'updated_at'
  ],
  USER_CONCEPT_STATS: [
    'user_id',
    'concept_id',
    'quizzes_seen',
    'different_quizzes_wrong',
    'total_attempts',
    'correct_count',
    'wrong_count',
    'accuracy_pct',
    'recent_accuracy_pct',
    'risk_score',
    'status',
    'last_seen',
    'last_error_at',
    'last_review_at',
    'updated_at'
  ],
  USER_LEARNING_SUMMARY: [
    'user_id',
    'total_answers',
    'total_correct',
    'total_wrong',
    'overall_accuracy_pct',
    'recent_accuracy_pct',
    'total_study_time_ms',
    'active_errors',
    'resolved_errors',
    'figures_to_review',
    'words_to_review',
    'topics_to_review',
    'chapters_to_review',
    'readiness_score',
    'readiness_label',
    'last_activity_at',
    'updated_at'
  ],
  USER_ERROR_QUEUE: [
    'error_id',
    'user_id',
    'entity_type',
    'entity_id',
    'source_count',
    'different_quiz_count',
    'priority_score',
    'risk_score',
    'status',
    'reason_code',
    'reason_text',
    'first_detected_at',
    'last_detected_at',
    'last_review_at',
    'resolved_at',
    'updated_at'
  ],
  STUDY_PLANS: [
    'plan_id',
    'user_id',
    'plan_date',
    'status',
    'estimated_minutes',
    'total_items',
    'completed_items',
    'created_at',
    'started_at',
    'completed_at',
    'updated_at'
  ],
  STUDY_PLAN_ITEMS: [
    'plan_item_id',
    'plan_id',
    'user_id',
    'position',
    'entity_type',
    'entity_id',
    'action_type',
    'target_quiz_count',
    'estimated_minutes',
    'priority_score',
    'reason_text',
    'status',
    'started_at',
    'completed_at',
    'created_at',
    'updated_at'
  ]
};

var LEARNING_DB_SHEET_ORDER_ = [
  'DB_META',
  'ANSWER_EVENTS',
  'STUDY_ACTIVITY_EVENTS',
  'STUDY_SESSIONS',
  'USER_QUIZ_STATS',
  'USER_FIGURE_STATS',
  'USER_WORD_STATS',
  'USER_TOPIC_STATS',
  'USER_CHAPTER_STATS',
  'USER_CONCEPT_STATS',
  'USER_LEARNING_SUMMARY',
  'USER_ERROR_QUEUE',
  'STUDY_PLANS',
  'STUDY_PLAN_ITEMS'
];

/**
 * Validates the existing learning spreadsheet without changing it.
 *
 * The legacy function name is retained so existing operator instructions keep
 * working, but this function performs no create, insert or schema-update call.
 *
 * @return {{spreadsheetId:string, spreadsheetUrl:string, sheetsChecked:number,
 *   columnsChecked:number, sheetsCreated:number, columnsAdded:number,
 *   schemaVersion:number}}
 */
function setupLearningDatabase() {
  var spreadsheet = getLearningDatabase_();
  var columnsChecked = 0;

  LEARNING_DB_SHEET_ORDER_.forEach(function (sheetName) {
    var sheet = learningRequireSheet_(spreadsheet, sheetName);
    var columns = learningGetHeaderMap_(sheet);
    LEARNING_DB_SCHEMA[sheetName].forEach(function (columnName) {
      learningRequireColumn_(columns, columnName, sheetName);
      columnsChecked += 1;
    });
  });

  var summary = {
    spreadsheetId: spreadsheet.getId(),
    spreadsheetUrl: spreadsheet.getUrl(),
    sheetsChecked: LEARNING_DB_SHEET_ORDER_.length,
    columnsChecked: columnsChecked,
    sheetsCreated: 0,
    columnsAdded: 0,
    schemaVersion: LEARNING_DB_SCHEMA_VERSION_
  };

  Logger.log(
    'Magic Book Learning DB verified | Spreadsheet ID: %s | Spreadsheet URL: %s | ' +
    'Sheets checked: %s | Columns checked: %s | Schema version: %s',
    summary.spreadsheetId,
    summary.spreadsheetUrl,
    summary.sheetsChecked,
    summary.columnsChecked,
    summary.schemaVersion
  );

  return summary;
}

/**
 * Opens the existing learning database by its Script Property ID.
 *
 * Web-app executions do not have an active Spreadsheet context, even when the
 * script is container-bound. The explicit ID therefore remains the single
 * database lookup path for editor runs and doPost requests alike.
 *
 * @return {GoogleAppsScript.Spreadsheet.Spreadsheet}
 */
function getLearningDatabase_() {
  var spreadsheetId = String(
    PropertiesService.getScriptProperties().getProperty(LEARNING_DB_ID_PROPERTY_) || ''
  ).trim();
  if (!spreadsheetId) {
    throw new Error(
      'Configura la proprietà script ' + LEARNING_DB_ID_PROPERTY_ +
      ' con l\'ID del Google Sheet Magic Book Learning Database già esistente.'
    );
  }

  try {
    return SpreadsheetApp.openById(spreadsheetId);
  } catch (error) {
    throw new Error(
      'Impossibile aprire il Magic Book Learning Database configurato in ' +
      LEARNING_DB_ID_PROPERTY_ + '. Verifica ID e autorizzazioni.'
    );
  }
}

/**
 * Generates an opaque, globally unique identifier with a readable prefix.
 *
 * @param {string} prefix
 * @return {string}
 */
function generateLearningId_(prefix) {
  var safePrefix = String(prefix || 'id')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '') || 'id';
  return safePrefix + '_' + Utilities.getUuid().replace(/-/g, '').toLowerCase();
}

/**
 * Appends one immutable raw answer event.
 *
 * @param {Object} data
 * @return {{event_id:string, created_at:Date}}
 */
function appendAnswerEvent(data) {
  data = learningRequireObject_(data, 'answer event');
  var now = new Date();
  var eventId = learningExternalIdOrGenerated_(data.event_id, 'ans');
  var row = learningBuildAnswerEventRow_(data, eventId, now);

  learningAppendRow_('ANSWER_EVENTS', row);
  return { event_id: eventId, created_at: now };
}

function learningBuildAnswerEventRow_(data, eventId, now) {
  var result = learningRequiredText_(data.result, 'result', 16).toUpperCase();

  if (result !== 'CORRECT' && result !== 'WRONG') {
    throw new Error('result must be CORRECT or WRONG.');
  }

  var responseTimeMs = learningOptionalNonNegativeInteger_(
    data.response_time_ms,
    'response_time_ms'
  );
  var pageWasHidden = learningBoolean_(data.page_was_hidden, false);
  var responseTimeValid = learningBoolean_(data.response_time_valid, false)
    && responseTimeMs !== ''
    && !pageWasHidden;

  return [
    eventId,
    learningRequiredText_(data.user_id, 'user_id', 255),
    learningRequiredText_(data.quiz_id, 'quiz_id', 255),
    result,
    learningOptionalText_(data.user_answer, 'user_answer', 45000, false),
    learningDateOrDefault_(data.answered_at, now, 'answered_at'),
    responseTimeMs,
    responseTimeValid,
    pageWasHidden,
    learningOptionalText_(data.mode, 'mode', 100, true),
    learningOptionalText_(data.session_id, 'session_id', 255, true),
    learningOptionalPositiveInteger_(data.attempt_number, 'attempt_number'),
    learningOptionalText_(data.client_version, 'client_version', 100, true),
    now
  ];
}

/**
 * Appends one raw study-activity event. Activity data is observational only.
 *
 * @param {Object} data
 * @return {{event_id:string, created_at:Date}}
 */
function appendStudyActivityEvent(data) {
  data = learningRequireObject_(data, 'study activity event');
  var now = new Date();
  var eventId = learningExternalIdOrGenerated_(data.event_id, 'act');
  var row = learningBuildStudyActivityRow_(data, eventId, now);

  learningAppendRow_('STUDY_ACTIVITY_EVENTS', row);
  return { event_id: eventId, created_at: now };
}

function learningBuildStudyActivityRow_(data, eventId, now) {
  var startedAt = learningDateOrDefault_(data.started_at, now, 'started_at');
  var completedAt = learningOptionalDate_(data.completed_at, 'completed_at');
  var durationMs = learningOptionalNonNegativeInteger_(data.duration_ms, 'duration_ms');

  if (durationMs === '' && completedAt) {
    durationMs = Math.max(0, completedAt.getTime() - startedAt.getTime());
  }

  return [
    eventId,
    learningRequiredText_(data.user_id, 'user_id', 255),
    learningOptionalText_(data.session_id, 'session_id', 255, true),
    learningRequiredText_(data.activity_type, 'activity_type', 100),
    learningRequiredText_(data.entity_type, 'entity_type', 100),
    learningRequiredText_(data.entity_id, 'entity_id', 255),
    startedAt,
    completedAt || '',
    durationMs,
    learningMetadataJson_(data.metadata_json),
    now
  ];
}

/**
 * Starts a study session and returns its generated identifier.
 *
 * @param {Object} data
 * @return {{session_id:string, started_at:Date}}
 */
function startStudySession(data) {
  data = learningRequireObject_(data, 'study session');
  var now = new Date();
  var startedAt = learningDateOrDefault_(data.started_at, now, 'started_at');
  var sessionId = learningExternalIdOrGenerated_(data.session_id, 'ses');
  var row = [
    sessionId,
    learningRequiredText_(data.user_id, 'user_id', 255),
    learningOptionalText_(data.mode, 'mode', 100, true),
    startedAt,
    '',
    '',
    0,
    0,
    0,
    now,
    now
  ];

  learningAppendRow_('STUDY_SESSIONS', row);
  return { session_id: sessionId, started_at: startedAt };
}

/**
 * Completes an existing session without scanning unrelated sheet columns.
 * Supplied counters replace only their corresponding fields; omitted counters
 * retain their current values.
 *
 * @param {Object} data
 * @return {{session_id:string, ended_at:Date, duration_ms:number|string}}
 */
function endStudySession(data) {
  data = learningRequireObject_(data, 'study session completion');
  var sessionId = learningRequiredText_(data.session_id, 'session_id', 255);
  var endedAt = learningDateOrDefault_(data.ended_at, new Date(), 'ended_at');
  var suppliedDuration = learningOptionalNonNegativeInteger_(data.duration_ms, 'duration_ms');
  var totalAnswers = learningOptionalNonNegativeInteger_(data.total_answers, 'total_answers');
  var correctAnswers = learningOptionalNonNegativeInteger_(data.correct_answers, 'correct_answers');
  var wrongAnswers = learningOptionalNonNegativeInteger_(data.wrong_answers, 'wrong_answers');
  var spreadsheet = getLearningDatabase_();
  var sheet = learningRequireSheet_(spreadsheet, 'STUDY_SESSIONS');
  var lock = LockService.getScriptLock();

  if (!lock.tryLock(LEARNING_DB_WRITE_LOCK_TIMEOUT_MS_)) {
    throw new Error('Learning database is busy. Retry the session completion shortly.');
  }

  try {
    var columns = learningGetHeaderMap_(sheet);
    var sessionColumn = learningRequireColumn_(columns, 'session_id', 'STUDY_SESSIONS');
    var rowNumber = learningFindRowByValue_(sheet, sessionColumn, sessionId);
    if (!rowNumber) throw new Error('Study session not found: ' + sessionId);

    var lastColumn = sheet.getLastColumn();
    var rowValues = sheet.getRange(rowNumber, 1, 1, lastColumn).getValues()[0];
    var startedAt = learningStoredDate_(
      rowValues[learningRequireColumn_(columns, 'started_at', 'STUDY_SESSIONS') - 1]
    );
    var durationMs = suppliedDuration;
    if (durationMs === '' && startedAt) {
      durationMs = Math.max(0, endedAt.getTime() - startedAt.getTime());
    }

    learningSetRowValue_(rowValues, columns, 'ended_at', endedAt, 'STUDY_SESSIONS');
    learningSetRowValue_(rowValues, columns, 'duration_ms', durationMs, 'STUDY_SESSIONS');
    if (totalAnswers !== '') {
      learningSetRowValue_(rowValues, columns, 'total_answers', totalAnswers, 'STUDY_SESSIONS');
    }
    if (correctAnswers !== '') {
      learningSetRowValue_(rowValues, columns, 'correct_answers', correctAnswers, 'STUDY_SESSIONS');
    }
    if (wrongAnswers !== '') {
      learningSetRowValue_(rowValues, columns, 'wrong_answers', wrongAnswers, 'STUDY_SESSIONS');
    }
    learningSetRowValue_(rowValues, columns, 'updated_at', new Date(), 'STUDY_SESSIONS');
    sheet.getRange(rowNumber, 1, 1, lastColumn).setValues([rowValues]);

    return { session_id: sessionId, ended_at: endedAt, duration_ms: durationMs };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Web App entry point used only by the authenticated Vercel learning proxy.
 * The browser never receives the Apps Script URL or GAS_SECRET.
 *
 * @param {GoogleAppsScript.Events.DoPost} e
 * @return {GoogleAppsScript.Content.TextOutput}
 */
function doPost(e) {
  try {
    var payload = JSON.parse(e && e.postData && e.postData.contents ? e.postData.contents : '{}');
    if (!learningVerifyProxyToken_(payload.token)) {
      return learningJsonOutput_({ success: false, error: 'unauthorized' });
    }
    if (payload.action === 'learning_sync') {
      return learningJsonOutput_(syncLearningEventsBatch_(payload.events));
    }
    if (payload.action === 'learning_insights') {
      return learningJsonOutput_(learningReadAnswerEventsForUser_(payload.user_id));
    }
    return learningJsonOutput_({ success: false, error: 'invalid_action' });
  } catch (error) {
    console.error('[learning_database]', error && error.stack ? error.stack : error);
    return learningJsonOutput_({ success: false, error: 'server_error', retryAfterSeconds: 5 });
  }
}

/**
 * Reads only the most recent answer events for one authenticated proxy user.
 * Chunks are scanned from the bottom so active learners do not require a full
 * sheet allocation. No aggregate or other user's row is returned.
 *
 * @param {string} userId
 * @return {{success:boolean, events:Object[], truncated:boolean}}
 */
function learningReadAnswerEventsForUser_(userId) {
  userId = learningRequiredText_(userId, 'user_id', 255);
  if (!/^\d{6,15}$/.test(userId)) throw new Error('invalid_user_id');

  var spreadsheet = getLearningDatabase_();
  var sheet = learningRequireSheet_(spreadsheet, 'ANSWER_EVENTS');
  var columns = learningGetHeaderMap_(sheet);
  var required = ['event_id', 'user_id', 'quiz_id', 'result', 'answered_at'];
  required.forEach(function (columnName) {
    learningRequireColumn_(columns, columnName, 'ANSWER_EVENTS');
  });

  var lastRow = sheet.getLastRow();
  var lastColumn = sheet.getLastColumn();
  var cursor = lastRow;
  var events = [];
  var truncated = false;

  while (cursor >= 2 && events.length < LEARNING_DB_MAX_INSIGHT_EVENTS_) {
    var startRow = Math.max(2, cursor - LEARNING_DB_READ_CHUNK_SIZE_ + 1);
    var rowCount = cursor - startRow + 1;
    var values = sheet.getRange(startRow, 1, rowCount, lastColumn).getValues();

    for (var index = values.length - 1; index >= 0; index -= 1) {
      var row = values[index];
      if (String(row[columns.user_id - 1] || '').trim() !== userId) continue;
      events.push({
        event_id: String(row[columns.event_id - 1] || '').trim(),
        user_id: userId,
        quiz_id: String(row[columns.quiz_id - 1] || '').trim(),
        result: String(row[columns.result - 1] || '').trim(),
        answered_at: learningIsoDateForJson_(row[columns.answered_at - 1])
      });
      if (events.length >= LEARNING_DB_MAX_INSIGHT_EVENTS_) {
        truncated = startRow > 2 || index > 0;
        break;
      }
    }
    cursor = startRow - 1;
  }

  events.reverse();
  return { success: true, events: events, truncated: truncated };
}

function learningIsoDateForJson_(value) {
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return value.toISOString();
  }
  var parsed = new Date(value);
  return isNaN(parsed.getTime()) ? '' : parsed.toISOString();
}

/**
 * Validates, deduplicates and writes a mixed learning-event batch. New rows are
 * committed with one setValues() call per target sheet while holding a script
 * lock. Existing IDs are returned as successful duplicates.
 *
 * @param {Object[]} events
 * @return {{success:boolean, accepted:string[], duplicates:string[], rejected:Object[]}}
 */
function syncLearningEventsBatch_(events) {
  if (!Array.isArray(events) || events.length < 1 || events.length > LEARNING_DB_MAX_BATCH_SIZE_) {
    return { success: false, error: 'invalid_batch_size' };
  }

  var groups = {};
  var rejected = [];
  events.forEach(function (event) {
    var eventId = event && event.event_id;
    try {
      event = learningRequireObject_(event, 'learning event');
      var eventType = learningRequiredText_(event.event_type, 'event_type', 50);
      var prefix = eventType === 'answer_event'
        ? 'ans'
        : eventType === 'study_activity_event'
          ? 'act'
          : '';
      if (!prefix) throw new Error('unsupported_event_type');

      eventId = learningExternalIdOrGenerated_(event.event_id, prefix, true);
      var userId = learningRequiredText_(event.user_id, 'user_id', 255);
      var data = learningRequireObject_(event.payload, 'event payload');
      if (data.event_id && String(data.event_id) !== eventId) throw new Error('event_id_mismatch');
      if (data.user_id && String(data.user_id) !== userId) throw new Error('user_id_mismatch');
      data.event_id = eventId;
      data.user_id = userId;

      var sheetName = eventType === 'answer_event' ? 'ANSWER_EVENTS' : 'STUDY_ACTIVITY_EVENTS';
      var row = eventType === 'answer_event'
        ? learningBuildAnswerEventRow_(data, eventId, new Date())
        : learningBuildStudyActivityRow_(data, eventId, new Date());
      if (!groups[sheetName]) groups[sheetName] = [];
      groups[sheetName].push({ eventId: eventId, row: row });
    } catch (error) {
      rejected.push({
        event_id: String(eventId || 'unknown').slice(0, 120),
        error: learningPublicValidationError_(error)
      });
    }
  });

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(LEARNING_DB_WRITE_LOCK_TIMEOUT_MS_)) {
    return { success: false, error: 'busy', retryAfterSeconds: 5 };
  }

  var accepted = [];
  var duplicates = [];
  try {
    var spreadsheet = getLearningDatabase_();
    Object.keys(groups).forEach(function (sheetName) {
      var sheet = learningRequireSheet_(spreadsheet, sheetName);
      var columns = learningGetHeaderMap_(sheet);
      var eventIdColumn = learningRequireColumn_(columns, 'event_id', sheetName);
      var knownIds = learningReadExistingIds_(sheet, eventIdColumn);
      var rowsToWrite = [];
      var idsToWrite = [];

      groups[sheetName].forEach(function (item) {
        if (knownIds[item.eventId]) {
          if (duplicates.indexOf(item.eventId) === -1 && accepted.indexOf(item.eventId) === -1) {
            duplicates.push(item.eventId);
          }
          return;
        }
        knownIds[item.eventId] = true;
        rowsToWrite.push(learningMapSchemaRow_(sheet, sheetName, item.row, columns));
        idsToWrite.push(item.eventId);
      });

      if (rowsToWrite.length) {
        sheet.getRange(
          Math.max(2, sheet.getLastRow() + 1),
          1,
          rowsToWrite.length,
          sheet.getLastColumn()
        ).setValues(rowsToWrite);
        accepted = accepted.concat(idsToWrite);
      }
    });

    duplicates = duplicates.filter(function (eventId) {
      return accepted.indexOf(eventId) === -1;
    });

    return { success: true, accepted: accepted, duplicates: duplicates, rejected: rejected };
  } finally {
    lock.releaseLock();
  }
}

function learningAppendRow_(sheetName, rowValues) {
  var expectedColumns = LEARNING_DB_SCHEMA[sheetName];
  if (!expectedColumns || rowValues.length !== expectedColumns.length) {
    throw new Error('Invalid row shape for ' + sheetName + '.');
  }

  var spreadsheet = getLearningDatabase_();
  var sheet = learningRequireSheet_(spreadsheet, sheetName);
  var lock = LockService.getScriptLock();

  if (!lock.tryLock(LEARNING_DB_WRITE_LOCK_TIMEOUT_MS_)) {
    throw new Error('Learning database is busy. Retry the write shortly.');
  }

  try {
    var columns = learningGetHeaderMap_(sheet);
    var outputRow = learningMapSchemaRow_(sheet, sheetName, rowValues, columns);

    var nextRow = Math.max(2, sheet.getLastRow() + 1);
    sheet.getRange(nextRow, 1, 1, outputRow.length).setValues([outputRow]);
  } finally {
    lock.releaseLock();
  }
}

function learningMapSchemaRow_(sheet, sheetName, rowValues, columns) {
  var expectedColumns = LEARNING_DB_SCHEMA[sheetName];
  if (!expectedColumns || rowValues.length !== expectedColumns.length) {
    throw new Error('Invalid row shape for ' + sheetName + '.');
  }

  var outputRow = new Array(sheet.getLastColumn());
  var index;
  for (index = 0; index < outputRow.length; index += 1) outputRow[index] = '';
  expectedColumns.forEach(function (columnName, valueIndex) {
    var columnNumber = learningRequireColumn_(columns, columnName, sheetName);
    outputRow[columnNumber - 1] = rowValues[valueIndex];
  });
  return outputRow;
}

function learningReadExistingIds_(sheet, eventIdColumn) {
  var knownIds = {};
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return knownIds;
  sheet.getRange(2, eventIdColumn, lastRow - 1, 1).getValues().forEach(function (values) {
    var eventId = String(values[0] || '').trim();
    if (eventId) knownIds[eventId] = true;
  });
  return knownIds;
}

function learningExternalIdOrGenerated_(value, prefix, required) {
  if (value === undefined || value === null || value === '') {
    if (required) throw new Error('event_id_required');
    return generateLearningId_(prefix);
  }
  var eventId = String(value).trim();
  var pattern = new RegExp('^' + prefix + '_[a-z0-9_-]{16,100}$', 'i');
  if (!pattern.test(eventId)) throw new Error('invalid_event_id');
  return eventId;
}

function learningVerifyProxyToken_(suppliedToken) {
  var expectedToken = PropertiesService.getScriptProperties().getProperty('GAS_SECRET') || '';
  var supplied = String(suppliedToken || '');
  var expected = String(expectedToken || '');
  if (!supplied || !expected) return false;

  var difference = supplied.length ^ expected.length;
  var maxLength = Math.max(supplied.length, expected.length);
  var index;
  for (index = 0; index < maxLength; index += 1) {
    difference |= supplied.charCodeAt(index % supplied.length)
      ^ expected.charCodeAt(index % expected.length);
  }
  return difference === 0;
}

function learningPublicValidationError_(error) {
  var code = String(error && error.message ? error.message : error || 'invalid_event');
  if ([
    'unsupported_event_type',
    'event_id_required',
    'invalid_event_id',
    'event_id_mismatch',
    'user_id_mismatch'
  ].indexOf(code) !== -1) return code;
  if (code.indexOf('result must be') !== -1) return 'invalid_result';
  if (code.indexOf('date') !== -1 || code.indexOf('_at') !== -1) return 'invalid_timestamp';
  return 'invalid_event_payload';
}

function learningJsonOutput_(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function learningGetHeaderMap_(sheet) {
  var lastColumn = sheet.getLastColumn();
  var headers = lastColumn > 0
    ? sheet.getRange(1, 1, 1, lastColumn).getValues()[0]
    : [];
  var columns = {};

  headers.forEach(function (header, index) {
    var key = learningHeaderKey_(header);
    if (key && !columns[key]) columns[key] = index + 1;
  });

  return columns;
}

function learningRequireColumn_(columns, columnName, sheetName) {
  var columnNumber = columns[learningHeaderKey_(columnName)];
  if (!columnNumber) {
    throw new Error('Missing required column ' + columnName + ' in ' + sheetName + '.');
  }
  return columnNumber;
}

function learningRequireSheet_(spreadsheet, sheetName) {
  var sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) {
    throw new Error(
      'Missing required sheet ' + sheetName +
      '. The learning database must already contain every required sheet.'
    );
  }
  return sheet;
}

function learningFindRowByValue_(sheet, columnNumber, value) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  var match = sheet
    .getRange(2, columnNumber, lastRow - 1, 1)
    .createTextFinder(value)
    .matchEntireCell(true)
    .findNext();
  return match ? match.getRow() : 0;
}

function learningSetRowValue_(rowValues, columns, columnName, value, sheetName) {
  rowValues[learningRequireColumn_(columns, columnName, sheetName) - 1] = value;
}

function learningHeaderKey_(value) {
  return String(value || '').trim().toLowerCase();
}

function learningRequireObject_(value, label) {
  if (!value || Object.prototype.toString.call(value) !== '[object Object]') {
    throw new Error('A valid ' + label + ' object is required.');
  }
  return value;
}

function learningRequiredText_(value, label, maxLength) {
  var text = value === undefined || value === null ? '' : String(value).trim();
  if (!text) throw new Error(label + ' is required.');
  return learningSafeCellText_(text, label, maxLength);
}

function learningOptionalText_(value, label, maxLength, trim) {
  if (value === undefined || value === null || value === '') return '';
  var text = String(value);
  if (trim) text = text.trim();
  return learningSafeCellText_(text, label, maxLength);
}

function learningSafeCellText_(text, label, maxLength) {
  if (text.length > maxLength) {
    throw new Error(label + ' exceeds the maximum length of ' + maxLength + ' characters.');
  }

  // Keep untrusted text literal when written to Sheets. This prevents answers,
  // metadata and externally supplied IDs from becoming spreadsheet formulas.
  if (/^[\s\u0000-\u001f]*[=+\-@]/.test(text)) return "'" + text;
  return text;
}

function learningBoolean_(value, defaultValue) {
  if (value === undefined || value === null || value === '') return defaultValue;
  if (value === true || value === false) return value;
  var normalized = String(value).trim().toLowerCase();
  if (normalized === 'true' || normalized === '1') return true;
  if (normalized === 'false' || normalized === '0') return false;
  throw new Error('Expected a boolean value.');
}

function learningOptionalNonNegativeInteger_(value, label) {
  if (value === undefined || value === null || value === '') return '';
  var numberValue = Number(value);
  if (!isFinite(numberValue) || numberValue < 0 || Math.floor(numberValue) !== numberValue) {
    throw new Error(label + ' must be a non-negative integer.');
  }
  return numberValue;
}

function learningOptionalPositiveInteger_(value, label) {
  if (value === undefined || value === null || value === '') return '';
  var numberValue = Number(value);
  if (!isFinite(numberValue) || numberValue < 1 || Math.floor(numberValue) !== numberValue) {
    throw new Error(label + ' must be a positive integer.');
  }
  return numberValue;
}

function learningDateOrDefault_(value, defaultDate, label) {
  var parsed = learningOptionalDate_(value, label);
  return parsed || new Date(defaultDate.getTime());
}

function learningOptionalDate_(value, label) {
  if (value === undefined || value === null || value === '') return null;
  var parsed;

  if (Object.prototype.toString.call(value) === '[object Date]') {
    parsed = new Date(value.getTime());
  } else if (typeof value === 'number' && isFinite(value)) {
    parsed = new Date(value);
  } else if (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+\-]\d{2}:\d{2})$/.test(value.trim())
  ) {
    parsed = new Date(value.trim());
  } else {
    throw new Error(label + ' must be a Date, epoch milliseconds, or an ISO 8601 timestamp with timezone.');
  }

  if (isNaN(parsed.getTime())) throw new Error(label + ' is not a valid date.');
  return parsed;
}

function learningStoredDate_(value) {
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return value;
  }
  if (value === undefined || value === null || value === '') return null;
  var parsed = new Date(value);
  return isNaN(parsed.getTime()) ? null : parsed;
}

function learningMetadataJson_(value) {
  if (value === undefined || value === null || value === '') return '';
  var serialized = typeof value === 'string' ? value : JSON.stringify(value);
  try {
    JSON.parse(serialized);
  } catch (error) {
    throw new Error('metadata_json must be valid JSON or a serializable value.');
  }
  return learningSafeCellText_(serialized, 'metadata_json', 45000);
}

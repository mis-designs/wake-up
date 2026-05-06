const SCRIPT_PROPS = PropertiesService.getScriptProperties();
const SECRET = SCRIPT_PROPS.getProperty("GAS_SECRET");
const SHEET_NAME = "Sheet1";
const ADMIN_KEY = SCRIPT_PROPS.getProperty("ADMIN_KEY");
const adminActions = ["insertUser", "updateExpiry", "deleteUser"];
const userAccessActions = ["login", "validate", "login_check", "confirm_device_rotation", "otp_start", "otp_status", "otp_cancel", "otp_mark_sent", "otp_mark_failed"];
const OTP_COOLDOWN_MS = 120 * 1000;
const OTP_EXPIRY_MS = 10 * 60 * 1000;

// Sheet column layout (1-based for getRange, 0-based for array index):
//  col 1 / index 0  ->  phone
//  col 2 / index 1  ->  device1
//  col 3 / index 2  ->  device2
//  col 4 / index 3  ->  expiry
//  col 5 / index 4  ->  registration_date
//  col 6 / index 5  ->  pendingDeviceId
//  col 7 / index 6  ->  otpLastSentAt
//  col 8 / index 7  ->  otpExpiresAt
//  col 9 / index 8  ->  otpStatus

function isAuthorized(e, body) {
  const params = (e && e.parameter) ? e.parameter : {};
  const token = (body && body.token) || params.token;
  return token === SECRET;
}

function isAdminAction(action) {
  return String(action || "").startsWith("admin_") || adminActions.includes(String(action || ""));
}

function logSecurityIssue(issue, action) {
  Logger.log("[security] " + issue + " action=" + String(action || ""));
}

function unauthorized() {
  return ContentService
    .createTextOutput(JSON.stringify({ status: "error", message: "unauthorized" }))
    .setMimeType(ContentService.MimeType.JSON);
}

function validateRequest(body) {
  if (!body || !body.action) return false;

  if (body.phone) {
    const phone = String(body.phone).replace(/\D+/g, "");
    if (!/^[0-9]{6,15}$/.test(phone)) return false;
  }

  const duration = body.duration != null ? Number(body.duration) : null;
  if (duration != null && (!isFinite(duration) || duration < 1 || duration > 3650)) return false;

  const days = body.days != null ? Number(body.days) : null;
  if (days != null && (!isFinite(days) || days < 1 || days > 3650)) return false;

  return true;
}

function isRateLimited() {
  const cache = CacheService.getScriptCache();
  const key = "rate_limit";
  const count = Number(cache.get(key) || 0);

  if (count > 20) return true;

  cache.put(key, count + 1, 10);
  return false;
}

function rateLimited() {
  return ContentService
    .createTextOutput(JSON.stringify({ status: "error", message: "rate_limited" }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  try {
    const p        = (e && e.parameter) ? e.parameter : {};
    const action   = String(p.action   || "").trim();
    const callback = String(p.callback || "").trim();
    const now      = new Date();
    const admin    = isAdminAction(action);

    if (admin) {
      if (!isAuthorized(e, null)) return unauthorized();
      if (String(p.adminKey || "") !== ADMIN_KEY) return unauthorized();
      if (!validateRequest(p)) return unauthorized();
      if (isRateLimited()) return rateLimited();
    } else if (!isAuthorized(e, null)) {
      logSecurityIssue("missing_or_invalid_token", action);
    }

    if (userAccessActions.includes(action)) {
      const sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_NAME);
      if (!sheet) return jsonOrJsonp({ success: false, error: "sheet_missing" }, callback);

      const phone    = normalizePhone(p.phone);
      const deviceId = String(p.deviceId || "").trim();

      if (!phone)    return jsonOrJsonp({ success: false, error: "bad_phone"  }, callback);
      if (!deviceId) return jsonOrJsonp({ success: false, error: "bad_device" }, callback);

      if (action === "confirm_device_rotation") {
        return jsonOrJsonp(handleConfirmDeviceRotation(sheet, phone, deviceId, now), callback);
      }

      if (action === "otp_start") {
        return jsonOrJsonp(handleOtpStart(sheet, phone, deviceId, now), callback);
      }

      if (action === "otp_status") {
        return jsonOrJsonp(handleOtpStatus(sheet, phone, deviceId, now), callback);
      }

      if (action === "otp_cancel") {
        return jsonOrJsonp(handleOtpCancel(sheet, phone, deviceId), callback);
      }

      if (action === "otp_mark_sent") {
        return jsonOrJsonp(handleOtpMark(sheet, phone, deviceId, "sent"), callback);
      }

      if (action === "otp_mark_failed") {
        return jsonOrJsonp(handleOtpMark(sheet, phone, deviceId, "failed"), callback);
      }

      const registerDevice = action === "login" || action === "login_check" || isTrue(p.registerDevice);
      return jsonOrJsonp(handleUserAccess(sheet, phone, deviceId, registerDevice, now), callback);
    }

    if (!action.startsWith("admin_")) {
      return jsonOrJsonp({ success: false, error: "bad_action" }, callback);
    }

    const sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_NAME);
    if (!sheet) return jsonOrJsonp({ success: false, error: "sheet_missing" }, callback);

    if (action === "admin_add") {
      const phone = normalizePhone(p.phone);
      if (!phone) return jsonOrJsonp({ success: false, error: "bad_phone" }, callback);

      if (phoneExists(sheet, phone)) {
        return jsonOrJsonp({ success: false, error: "duplicate" }, callback);
      }

      const days   = parseInt(p.days) > 0 ? parseInt(p.days) : 90;
      const expiry = addDays(now, days);
      insertPhone(sheet, phone, expiry, now);

      return jsonOrJsonp({
        success: true, error: null, phone,
        expiry: expiry.toISOString(),
        registration_date: now.toISOString()
      }, callback);
    }

    if (action === "admin_remove") {
      const phone = normalizePhone(p.phone);
      if (!phone) return jsonOrJsonp({ success: false, error: "bad_phone" }, callback);
      const removed = removePhone(sheet, phone);
      if (!removed) return jsonOrJsonp({ success: false, error: "not_found" }, callback);
      return jsonOrJsonp({ success: true, error: null, phone }, callback);
    }

    if (action === "admin_list") {
      const list = listPhones(sheet, now);
      return jsonOrJsonp({ success: true, error: null, list }, callback);
    }

    if (action === "admin_renew") {
      const phone = normalizePhone(p.phone);
      if (!phone) return jsonOrJsonp({ success: false, error: "bad_phone" }, callback);
      const days      = parseInt(p.days) > 0 ? parseInt(p.days) : 90;
      const newExpiry = addDays(now, days);
      const updated   = updateExpiry(sheet, phone, newExpiry, now);
      if (!updated) return jsonOrJsonp({ success: false, error: "not_found" }, callback);
      return jsonOrJsonp({
        success: true, error: null, phone,
        expiry: newExpiry.toISOString(),
        registration_date: now.toISOString()
      }, callback);
    }

    if (action === "admin_search") {
      const phone = normalizePhone(p.phone);
      if (!phone) return jsonOrJsonp({ success: false, error: "bad_phone" }, callback);
      const result = searchPhone(sheet, phone, now);
      if (!result) return jsonOrJsonp({ success: false, error: "not_found" }, callback);
      return jsonOrJsonp({ success: true, error: null, user: result }, callback);
    }

    return jsonOrJsonp({ success: false, error: "unknown_admin_action" }, callback);
  } catch (err) {
    const cb = (e && e.parameter && e.parameter.callback) ? String(e.parameter.callback) : "";
    return jsonOrJsonp({ success: false, error: "server_error", message: String(err) }, cb);
  }
}

function doPost(e) {
  let data = {};
  try {
    data = JSON.parse((e && e.postData && e.postData.contents) ? e.postData.contents : "{}");
  } catch (err) {
    data = {};
  }

  const requestAction = String(data.action || "login").trim();
  if (isAdminAction(requestAction)) {
    if (!isAuthorized(e, data)) return unauthorized();
    if (data.adminKey !== ADMIN_KEY) return unauthorized();
    if (!validateRequest(data)) return unauthorized();
    if (isRateLimited()) return rateLimited();
  } else {
    if (!isAuthorized(e, data)) logSecurityIssue("missing_or_invalid_token", requestAction);
    if (!validateRequest(data)) logSecurityIssue("non_blocking_validation_issue", requestAction);
  }

  try {
    const sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_NAME);
    if (!sheet) return output(false, "sheet_missing");

    const action   = String(data.action || "login").trim();
    const now      = new Date();

    if (action.startsWith("admin_")) return output(false, "use_get_jsonp");
    if (!userAccessActions.includes(action)) return output(false, "bad_action");

    const phone    = normalizePhone(data.phone);
    const deviceId = String(data.deviceId || "").trim();

    if (!phone)    return output(false, "bad_phone");
    if (!deviceId) return output(false, "bad_device");

    let result;
    if (action === "confirm_device_rotation") {
      result = handleConfirmDeviceRotation(sheet, phone, deviceId, now);
    } else if (action === "otp_start") {
      result = handleOtpStart(sheet, phone, deviceId, now);
    } else if (action === "otp_status") {
      result = handleOtpStatus(sheet, phone, deviceId, now);
    } else if (action === "otp_cancel") {
      result = handleOtpCancel(sheet, phone, deviceId);
    } else if (action === "otp_mark_sent") {
      result = handleOtpMark(sheet, phone, deviceId, "sent");
    } else if (action === "otp_mark_failed") {
      result = handleOtpMark(sheet, phone, deviceId, "failed");
    } else {
      const registerDevice = action === "login" || action === "login_check" || isTrue(data.registerDevice);
      result = handleUserAccess(sheet, phone, deviceId, registerDevice, now);
    }

    return output(result.success, result.error, result);
  } catch (err) {
    return output(false, "server_error", { message: String(err) });
  }
}

function jsonOrJsonp(obj, callback) {
  const json = JSON.stringify(obj);
  if (callback) {
    return ContentService
      .createTextOutput(`${callback}(${json});`)
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

function output(ok, error, extra) {
  return ContentService.createTextOutput(JSON.stringify({
    success: !!ok, error: error || null,
    ...((extra && typeof extra === "object") ? extra : {})
  })).setMimeType(ContentService.MimeType.JSON);
}

function getExpiryIsoOrError(expiry, now) {
  if (!expiry) return { expiryIso: null, error: null };

  const expDate = new Date(expiry);
  if (isNaN(expDate.getTime())) return { expiryIso: null, error: null };

  if (expDate < now) {
    return { expiryIso: expDate.toISOString(), error: "expired" };
  }

  return { expiryIso: expDate.toISOString(), error: null };
}

function parseDateValue(value) {
  if (!value) return null;
  const date = new Date(value);
  return isNaN(date.getTime()) ? null : date;
}

function clearOtpMetadata(sheet, rowNumber) {
  sheet.getRange(rowNumber, 6, 1, 4).clearContent();
}

function getOtpCooldown(lastSentAt, now) {
  const sentAt = parseDateValue(lastSentAt);
  if (!sentAt) return 0;

  const remainingMs = OTP_COOLDOWN_MS - (now.getTime() - sentAt.getTime());
  return Math.max(0, Math.ceil(remainingMs / 1000));
}

function buildOtpNotRequiredResult(d1, d2, deviceId, expiryIso) {
  if (d1 === deviceId || d2 === deviceId) {
    return { success: true, error: null, otpRequired: false, expiry: expiryIso };
  }

  if (!d1 || !d2) {
    return { success: false, error: "otp_not_required", expiry: expiryIso };
  }

  return null;
}

function handleUserAccess(sheet, phone, deviceId, registerDevice, now) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const rows = sheet.getDataRange().getValues();

    for (let i = 1; i < rows.length; i++) {
      let [p, d1, d2, expiry] = rows[i];
      if (normalizePhone(p) !== phone) continue;

      d1 = String(d1 || "").trim();
      d2 = String(d2 || "").trim();

      const expiryState = getExpiryIsoOrError(expiry, now);
      if (expiryState.error) {
        return { success: false, error: expiryState.error };
      }
      const expiryIso = expiryState.expiryIso;

      if (d1 === deviceId || d2 === deviceId) {
        return { success: true, error: null, expiry: expiryIso };
      }

      if (registerDevice && !d1) {
        sheet.getRange(i + 1, 2).setValue(deviceId);
        return { success: true, error: null, expiry: expiryIso, devices: 1 };
      }

      if (registerDevice && !d2) {
        sheet.getRange(i + 1, 3).setValue(deviceId);
        return { success: true, error: null, expiry: expiryIso, devices: 2 };
      }

      if (registerDevice && d1 && d2) {
        return { success: false, error: "otp_required", expiry: expiryIso };
      }

      return { success: false, error: "device_replaced" };
    }

    return { success: false, error: "not_found" };
  } finally {
    lock.releaseLock();
  }
}

function handleConfirmDeviceRotation(sheet, phone, deviceId, now) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const rows = sheet.getDataRange().getValues();

    for (let i = 1; i < rows.length; i++) {
      let [p, d1, d2, expiry] = rows[i];
      if (normalizePhone(p) !== phone) continue;

      d1 = String(d1 || "").trim();
      d2 = String(d2 || "").trim();

      const rowNumber = i + 1;
      const expiryState = getExpiryIsoOrError(expiry, now);
      if (expiryState.error) {
        return { success: false, error: expiryState.error };
      }
      const expiryIso = expiryState.expiryIso;

      if (d1 === deviceId || d2 === deviceId) {
        clearOtpMetadata(sheet, rowNumber);
        return { success: true, error: null, expiry: expiryIso };
      }

      if (!d1) {
        sheet.getRange(rowNumber, 2).setValue(deviceId);
        clearOtpMetadata(sheet, rowNumber);
        return { success: true, error: null, expiry: expiryIso, devices: 1 };
      }

      if (!d2) {
        sheet.getRange(rowNumber, 3).setValue(deviceId);
        clearOtpMetadata(sheet, rowNumber);
        return { success: true, error: null, expiry: expiryIso, devices: 2 };
      }

      const oldDevice1 = d1;
      const oldDevice2 = d2;
      sheet.getRange(rowNumber, 2).setValue(oldDevice2);
      sheet.getRange(rowNumber, 3).setValue(deviceId);
      clearOtpMetadata(sheet, rowNumber);

      return {
        success: true,
        error: null,
        expiry: expiryIso,
        rotated: true,
        replacedDevice: oldDevice1
      };
    }

    return { success: false, error: "not_found" };
  } finally {
    lock.releaseLock();
  }
}

function handleOtpStart(sheet, phone, deviceId, now) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const rows = sheet.getDataRange().getValues();

    for (let i = 1; i < rows.length; i++) {
      let [p, d1, d2, expiry, regDate, pendingDeviceId, otpLastSentAt, otpExpiresAt, otpStatus] = rows[i];
      if (normalizePhone(p) !== phone) continue;

      d1 = String(d1 || "").trim();
      d2 = String(d2 || "").trim();
      pendingDeviceId = String(pendingDeviceId || "").trim();
      otpStatus = String(otpStatus || "").trim();

      const expiryState = getExpiryIsoOrError(expiry, now);
      if (expiryState.error) {
        return { success: false, error: expiryState.error };
      }

      const notRequired = buildOtpNotRequiredResult(d1, d2, deviceId, expiryState.expiryIso);
      if (notRequired) return notRequired;

      const otpExpiryDate = parseDateValue(otpExpiresAt);
      const pendingMatches = pendingDeviceId === deviceId && otpExpiryDate && otpExpiryDate > now;
      const retryAfterSeconds = pendingMatches ? getOtpCooldown(otpLastSentAt, now) : 0;

      if (retryAfterSeconds > 0) {
        if (otpStatus === "failed") {
          return {
            success: false,
            error: "otp_send_failed",
            otpSendFailed: true,
            retryAfterSeconds,
            otpExpiresAt: otpExpiryDate.toISOString()
          };
        }

        return {
          success: false,
          error: "otp_required",
          otpAlreadySent: true,
          retryAfterSeconds,
          otpExpiresAt: otpExpiryDate.toISOString()
        };
      }

      const rowNumber = i + 1;
      const nextOtpExpiresAt = new Date(now.getTime() + OTP_EXPIRY_MS);
      sheet.getRange(rowNumber, 6).setValue(deviceId);
      sheet.getRange(rowNumber, 7).setValue(now);
      sheet.getRange(rowNumber, 8).setValue(nextOtpExpiresAt);
      sheet.getRange(rowNumber, 9).setValue("pending");

      return {
        success: false,
        error: "otp_required",
        otpStartAllowed: true,
        retryAfterSeconds: Math.ceil(OTP_COOLDOWN_MS / 1000),
        otpExpiresAt: nextOtpExpiresAt.toISOString()
      };
    }

    return { success: false, error: "not_found" };
  } finally {
    lock.releaseLock();
  }
}

function handleOtpStatus(sheet, phone, deviceId, now) {
  const rows = sheet.getDataRange().getValues();

  for (let i = 1; i < rows.length; i++) {
    let [p, d1, d2, expiry, regDate, pendingDeviceId, otpLastSentAt, otpExpiresAt, otpStatus] = rows[i];
    if (normalizePhone(p) !== phone) continue;

    d1 = String(d1 || "").trim();
    d2 = String(d2 || "").trim();
    pendingDeviceId = String(pendingDeviceId || "").trim();
    otpStatus = String(otpStatus || "").trim();

    const expiryState = getExpiryIsoOrError(expiry, now);
    if (expiryState.error) {
      return { success: false, error: expiryState.error };
    }

    const notRequired = buildOtpNotRequiredResult(d1, d2, deviceId, expiryState.expiryIso);
    if (notRequired) return notRequired;

    const otpExpiryDate = parseDateValue(otpExpiresAt);
    const pendingMatches = pendingDeviceId === deviceId && otpExpiryDate && otpExpiryDate > now;
    const retryAfterSeconds = pendingMatches ? getOtpCooldown(otpLastSentAt, now) : 0;

    return {
      success: false,
      error: retryAfterSeconds > 0 && otpStatus === "failed" ? "otp_send_failed" : "otp_required",
      otpSendFailed: retryAfterSeconds > 0 && otpStatus === "failed",
      otpAlreadySent: retryAfterSeconds > 0,
      retryAfterSeconds,
      otpExpiresAt: otpExpiryDate ? otpExpiryDate.toISOString() : null
    };
  }

  return { success: false, error: "not_found" };
}

function handleOtpCancel(sheet, phone, deviceId) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const rows = sheet.getDataRange().getValues();

    for (let i = 1; i < rows.length; i++) {
      const [p, d1, d2, expiry, regDate, pendingDeviceId] = rows[i];
      if (normalizePhone(p) !== phone) continue;

      if (String(pendingDeviceId || "").trim() === deviceId) {
        clearOtpMetadata(sheet, i + 1);
      }

      return { success: true, error: null };
    }

    return { success: false, error: "not_found" };
  } finally {
    lock.releaseLock();
  }
}

function handleOtpMark(sheet, phone, deviceId, status) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const rows = sheet.getDataRange().getValues();

    for (let i = 1; i < rows.length; i++) {
      const [p, d1, d2, expiry, regDate, pendingDeviceId] = rows[i];
      if (normalizePhone(p) !== phone) continue;

      if (String(pendingDeviceId || "").trim() === deviceId) {
        sheet.getRange(i + 1, 9).setValue(status);
      }

      return { success: true, error: null };
    }

    return { success: false, error: "not_found" };
  } finally {
    lock.releaseLock();
  }
}

function isTrue(value) {
  return value === true || String(value || "").toLowerCase() === "true" || String(value || "") === "1";
}

function normalizePhone(input) {
  let s = String(input || "").trim();
  s = s.replace(/\s+/g, "").replace(/^\+/, "").replace(/\D+/g, "");
  if (!s) return "";
  if (s.startsWith("00")) s = s.slice(2);
  if (!s.startsWith("39")) s = "39" + s;
  return s;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function phoneExists(sheet, phone) {
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (normalizePhone(values[i][0]) === phone) return true;
  }
  return false;
}

function insertPhone(sheet, phone, expiryDate, regDate) {
  sheet.appendRow([phone, "", "", expiryDate, regDate]);
}

function updateExpiry(sheet, phone, newExpiry, regDate) {
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (normalizePhone(values[i][0]) === phone) {
      sheet.getRange(i + 1, 4).setValue(newExpiry);
      sheet.getRange(i + 1, 5).setValue(regDate);
      return true;
    }
  }
  return false;
}

function removePhone(sheet, phone) {
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (normalizePhone(values[i][0]) === phone) {
      sheet.deleteRow(i + 1);
      return true;
    }
  }
  return false;
}

function searchPhone(sheet, phone, now) {
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (normalizePhone(values[i][0]) !== phone) continue;
    const [p, d1, d2, expiry, regDate] = values[i];

    let expiryIso = null, remainingDays = null, status = "active";
    if (expiry) {
      const expDate = new Date(expiry);
      if (!isNaN(expDate.getTime())) {
        expiryIso      = expDate.toISOString();
        remainingDays  = Math.ceil((expDate - now) / 86400000);
        if (expDate < now) status = "expired";
      }
    } else {
      status = "no_expiry";
    }

    let regDateIso = null;
    if (regDate) {
      const rd = new Date(regDate);
      if (!isNaN(rd.getTime())) regDateIso = rd.toISOString();
    }

    return { phone, expiry: expiryIso, registration_date: regDateIso, remaining_days: remainingDays, status };
  }
  return null;
}

function listPhones(sheet, now) {
  const values = sheet.getDataRange().getValues();
  const out = [];
  for (let i = 1; i < values.length; i++) {
    const [p, d1, d2, expiry, regDate] = values[i];
    const phone = normalizePhone(p);
    if (!phone) continue;

    let status = "active", expIso = null;
    if (expiry) {
      const expDate = new Date(expiry);
      if (!isNaN(expDate.getTime())) {
        expIso = expDate.toISOString();
        if (expDate < now) status = "expired";
      }
    } else {
      status = "no_expiry";
    }

    let regDateIso = null;
    if (regDate) {
      const rd = new Date(regDate);
      if (!isNaN(rd.getTime())) regDateIso = rd.toISOString();
    }

    out.push({ phone, device1: d1 || "", device2: d2 || "", expiry: expIso, registration_date: regDateIso, status });
  }
  return out;
}

function onEdit(e) {
  try {
    const sheet = e.range.getSheet();
    if (sheet.getName() !== SHEET_NAME) return;
    const row = e.range.getRow(), col = e.range.getColumn();
    if (col !== 1 || row < 2) return;
    const rawPhone = e.range.getValue();
    const phone    = normalizePhone(rawPhone);
    if (!phone) return;
    if (String(rawPhone) !== phone) e.range.setValue(phone);
    const now = new Date();
    const expiryCell = sheet.getRange(row, 4);
    if (!expiryCell.getValue()) expiryCell.setValue(addDays(now, 90));
    sheet.getRange(row, 5).setValue(now);
  } catch (err) {}
}

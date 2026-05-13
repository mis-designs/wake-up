const SCRIPT_PROPS = PropertiesService.getScriptProperties();
const SECRET = SCRIPT_PROPS.getProperty("GAS_SECRET");
const SHEET_NAME = "Sheet1";
const ADMIN_KEY = SCRIPT_PROPS.getProperty("ADMIN_KEY");
const ADMIN_PHONE_CONFIG = SCRIPT_PROPS.getProperty("ADMIN_PHONES") || SCRIPT_PROPS.getProperty("ADMIN_PHONE_NUMBERS") || "";
const adminActions = ["insertUser", "updateExpiry", "deleteUser"];
const userAccessActions = ["login", "validate", "login_check", "confirm_device_rotation"];

// Sheet column layout (1-based for getRange, 0-based for array index):
//  col 1 / index 0  ->  phone
//  col 2 / index 1  ->  device1
//  col 3 / index 2  ->  device2
//  col 4 / index 3  ->  expiry
//  col 5 / index 4  ->  registration_date

function isAuthorized(e, body) {
  const params = (e && e.parameter) ? e.parameter : {};
  const token = (body && body.token) || params.token;
  return token === SECRET;
}

function isAdminAction(action) {
  return String(action || "").startsWith("admin_") || adminActions.includes(String(action || ""));
}

function getAdminPhones_() {
  return String(ADMIN_PHONE_CONFIG || "")
    .split(",")
    .map(function (phone) { return normalizePhone(phone); })
    .filter(Boolean);
}

function isAdminPhone_(phone) {
  return getAdminPhones_().indexOf(normalizePhone(phone)) !== -1;
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
      const explicitExpiry = parseExpiryDate(p.expiry);
      if (String(p.expiry || "").trim() && !explicitExpiry) {
        return jsonOrJsonp({ success: false, error: "bad_expiry" }, callback);
      }
      const expiry = explicitExpiry || addDays(now, days);
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
      return jsonOrJsonp(renewUser(sheet, phone, p, now), callback);
    }

    if (action === "admin_search") {
      const phone = normalizePhone(p.phone);
      if (!phone) return jsonOrJsonp({ success: false, error: "bad_phone" }, callback);
      const result = searchPhone(sheet, phone, now);
      if (!result) return jsonOrJsonp({ success: false, error: "not_found" }, callback);
      return jsonOrJsonp({ success: true, error: null, user: result }, callback);
    }

    if (action === "admin_update") {
      const phone = normalizePhone(p.phone);
      if (!phone) return jsonOrJsonp({ success: false, error: "bad_phone" }, callback);
      const result = updateUser(sheet, phone, p, now);
      return jsonOrJsonp(result, callback);
    }

    if (action === "admin_reset_devices") {
      const phone = normalizePhone(p.phone);
      if (!phone) return jsonOrJsonp({ success: false, error: "bad_phone" }, callback);
      const reset = resetDevices(sheet, phone);
      if (!reset) return jsonOrJsonp({ success: false, error: "not_found" }, callback);
      return jsonOrJsonp({ success: true, error: null, phone }, callback);
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

    if (action.startsWith("admin_")) {
      const adminResult = handleAdminPostAction(sheet, action, data, now);
      return output(adminResult.success, adminResult.error, adminResult);
    }
    if (!userAccessActions.includes(action)) return output(false, "bad_action");

    const phone    = normalizePhone(data.phone);
    const deviceId = String(data.deviceId || "").trim();

    if (!phone)    return output(false, "bad_phone");
    if (!deviceId) return output(false, "bad_device");

    let result;
    if (action === "confirm_device_rotation") {
      result = handleConfirmDeviceRotation(sheet, phone, deviceId, now);
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
        return { success: true, error: null, expiry: expiryIso, role: isAdminPhone_(phone) ? "admin" : "user" };
      }

      if (registerDevice && !d1) {
        sheet.getRange(i + 1, 2).setValue(deviceId);
        return { success: true, error: null, expiry: expiryIso, devices: 1, role: isAdminPhone_(phone) ? "admin" : "user" };
      }

      if (registerDevice && !d2) {
        sheet.getRange(i + 1, 3).setValue(deviceId);
        return { success: true, error: null, expiry: expiryIso, devices: 2, role: isAdminPhone_(phone) ? "admin" : "user" };
      }

      if (registerDevice && d1 && d2) {
        const replacedDevice = d1;
        sheet.getRange(i + 1, 2).setValue(d2);
        sheet.getRange(i + 1, 3).setValue(deviceId);
        return {
          success: true,
          error: null,
          expiry: expiryIso,
          role: isAdminPhone_(phone) ? "admin" : "user",
          rotated: true,
          replacedDevice
        };
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
        return { success: true, error: null, expiry: expiryIso, role: isAdminPhone_(phone) ? "admin" : "user" };
      }

      if (!d1) {
        sheet.getRange(rowNumber, 2).setValue(deviceId);
        return { success: true, error: null, expiry: expiryIso, devices: 1, role: isAdminPhone_(phone) ? "admin" : "user" };
      }

      if (!d2) {
        sheet.getRange(rowNumber, 3).setValue(deviceId);
        return { success: true, error: null, expiry: expiryIso, devices: 2, role: isAdminPhone_(phone) ? "admin" : "user" };
      }

      const oldDevice1 = d1;
      const oldDevice2 = d2;
      sheet.getRange(rowNumber, 2).setValue(oldDevice2);
      sheet.getRange(rowNumber, 3).setValue(deviceId);

      return {
        success: true,
        error: null,
        expiry: expiryIso,
        role: isAdminPhone_(phone) ? "admin" : "user",
        rotated: true,
        replacedDevice: oldDevice1
      };
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

function parseExpiryDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? new Date(raw + "T23:59:59")
    : new Date(raw);

  if (isNaN(date.getTime())) return null;
  return date;
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

function updateUser(sheet, phone, data, now) {
  const values = sheet.getDataRange().getValues();
  const newPhone = normalizePhone(data.newPhone || phone);
  const expiryDate = parseExpiryDate(data.expiry);
  const hasExpiryInput = String(data.expiry || "").trim() !== "";

  if (!newPhone) return { success: false, error: "bad_phone" };
  if (hasExpiryInput && !expiryDate) return { success: false, error: "bad_expiry" };

  if (newPhone !== phone && phoneExists(sheet, newPhone)) {
    return { success: false, error: "duplicate" };
  }

  for (let i = 1; i < values.length; i++) {
    if (normalizePhone(values[i][0]) !== phone) continue;

    const row = i + 1;
    if (newPhone !== phone) sheet.getRange(row, 1).setValue(newPhone);
    if (expiryDate) sheet.getRange(row, 4).setValue(expiryDate);

    return {
      success: true,
      error: null,
      phone: newPhone,
      expiry: expiryDate ? expiryDate.toISOString() : null
    };
  }

  return { success: false, error: "not_found" };
}

function renewUser(sheet, phone, data, now) {
  const values = sheet.getDataRange().getValues();
  const explicitExpiry = parseExpiryDate(data.expiry);
  const hasExpiryInput = String(data.expiry || "").trim() !== "";
  const days = parseInt(data.days) > 0 ? parseInt(data.days) : 90;
  const addMode = String(data.mode || "").toLowerCase() === "add";

  if (hasExpiryInput && !explicitExpiry) return { success: false, error: "bad_expiry" };

  for (let i = 1; i < values.length; i++) {
    if (normalizePhone(values[i][0]) !== phone) continue;

    let newExpiry = explicitExpiry;
    if (!newExpiry) {
      let base = now;
      const currentExpiry = new Date(values[i][3]);
      if (addMode && !isNaN(currentExpiry.getTime()) && currentExpiry > now) base = currentExpiry;
      newExpiry = addDays(base, days);
    }

    sheet.getRange(i + 1, 4).setValue(newExpiry);
    return {
      success: true,
      error: null,
      phone,
      expiry: newExpiry.toISOString(),
      registration_date: values[i][4] ? new Date(values[i][4]).toISOString() : null
    };
  }

  return { success: false, error: "not_found" };
}

function resetDevices(sheet, phone) {
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (normalizePhone(values[i][0]) === phone) {
      sheet.getRange(i + 1, 2, 1, 2).clearContent();
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

function handleAdminPostAction(sheet, action, data, now) {
  if (action === "admin_list") {
    return { success: true, error: null, list: listPhones(sheet, now) };
  }

  if (action === "admin_add") {
    const phone = normalizePhone(data.phone);
    if (!phone) return { success: false, error: "bad_phone" };
    if (phoneExists(sheet, phone)) return { success: false, error: "duplicate" };

    const explicitExpiry = parseExpiryDate(data.expiry);
    if (String(data.expiry || "").trim() && !explicitExpiry) return { success: false, error: "bad_expiry" };
    const expiry = explicitExpiry || addDays(now, parseInt(data.days) > 0 ? parseInt(data.days) : 90);
    insertPhone(sheet, phone, expiry, now);
    return {
      success: true,
      error: null,
      phone,
      expiry: expiry.toISOString(),
      registration_date: now.toISOString()
    };
  }

  if (action === "admin_update") {
    const phone = normalizePhone(data.phone);
    if (!phone) return { success: false, error: "bad_phone" };
    return updateUser(sheet, phone, data, now);
  }

  if (action === "admin_renew") {
    const phone = normalizePhone(data.phone);
    if (!phone) return { success: false, error: "bad_phone" };
    return renewUser(sheet, phone, data, now);
  }

  if (action === "admin_remove") {
    const phone = normalizePhone(data.phone);
    if (!phone) return { success: false, error: "bad_phone" };
    const removed = removePhone(sheet, phone);
    if (!removed) return { success: false, error: "not_found" };
    return { success: true, error: null, phone };
  }

  if (action === "admin_reset_devices") {
    const phone = normalizePhone(data.phone);
    if (!phone) return { success: false, error: "bad_phone" };
    const reset = resetDevices(sheet, phone);
    if (!reset) return { success: false, error: "not_found" };
    return { success: true, error: null, phone };
  }

  if (action === "admin_search") {
    const phone = normalizePhone(data.phone);
    if (!phone) return { success: false, error: "bad_phone" };
    const result = searchPhone(sheet, phone, now);
    if (!result) return { success: false, error: "not_found" };
    return { success: true, error: null, user: result };
  }

  return { success: false, error: "unknown_admin_action" };
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

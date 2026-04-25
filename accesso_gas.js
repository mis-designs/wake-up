const SECRET = "Xk92!abC_2026_securePanel@#";
const SHEET_NAME = "Sheet1";
const ADMIN_KEY = "190919";
const adminActions = ["insertUser", "updateExpiry", "deleteUser"];

// Sheet column layout (1-based for getRange, 0-based for array index):
//  col 1 / index 0  →  phone
//  col 2 / index 1  →  device1
//  col 3 / index 2  →  device2
//  col 4 / index 3  →  expiry
//  col 5 / index 4  →  registration_date  ← NEW

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

    // ── User actions (mobile app) ────────────────────────────────────────
    if (action === "login" || action === "validate") {
      const sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_NAME);
      if (!sheet) return jsonOrJsonp({ success: false, error: "sheet_missing" }, callback);

      const phone    = normalizePhone(p.phone);
      const deviceId = String(p.deviceId || "").trim();

      if (!phone)    return jsonOrJsonp({ success: false, error: "bad_phone"  }, callback);
      if (!deviceId) return jsonOrJsonp({ success: false, error: "bad_device" }, callback);

      const rows = sheet.getDataRange().getValues();

      for (let i = 1; i < rows.length; i++) {
        let [ph, d1, d2, expiry] = rows[i];
        if (normalizePhone(ph) !== phone) continue;

        let expiryIso = null;
        if (expiry) {
          const expDate = new Date(expiry);
          if (!isNaN(expDate.getTime())) {
            expiryIso = expDate.toISOString();
            if (expDate < now) {
              sheet.getRange(i + 1, 2, 1, 2).clearContent();
              return jsonOrJsonp({ success: false, error: "expired", expiry: expiryIso }, callback);
            }
          }
        }

        if (action === "validate") {
          if (d1 === deviceId || d2 === deviceId)
            return jsonOrJsonp({ success: true, error: null, expiry: expiryIso }, callback);
          return jsonOrJsonp({ success: false, error: "revoked", expiry: expiryIso }, callback);
        }

        // login — device slot assignment with rotation
        if (!d1)           { sheet.getRange(i+1,2).setValue(deviceId); return jsonOrJsonp({ success:true, error:null, expiry:expiryIso }, callback); }
        if (d1===deviceId)   return jsonOrJsonp({ success: true, error: null, expiry: expiryIso }, callback);
        if (!d2)           { sheet.getRange(i+1,3).setValue(deviceId); return jsonOrJsonp({ success:true, error:null, expiry:expiryIso }, callback); }
        if (d2===deviceId)   return jsonOrJsonp({ success: true, error: null, expiry: expiryIso }, callback);

        sheet.getRange(i+1,2).setValue(d2);
        sheet.getRange(i+1,3).setValue(deviceId);
        return jsonOrJsonp({ success: true, error: null, expiry: expiryIso, rotated: true }, callback);
      }
      return jsonOrJsonp({ success: false, error: "not_found" }, callback);
    }
    // ── End user actions ─────────────────────────────────────────────────

    if (!action.startsWith("admin_"))
      return jsonOrJsonp({ success: false, error: "bad_action" }, callback);

    const sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_NAME);
    if (!sheet) return jsonOrJsonp({ success: false, error: "sheet_missing" }, callback);

    // ── admin_add ─────────────────────────────────────────────────────────
    if (action === "admin_add") {
      const phone = normalizePhone(p.phone);
      if (!phone) return jsonOrJsonp({ success: false, error: "bad_phone" }, callback);

      if (phoneExists(sheet, phone))
        return jsonOrJsonp({ success: false, error: "duplicate" }, callback);

      const days   = parseInt(p.days) > 0 ? parseInt(p.days) : 90;
      const expiry = addDays(now, days);
      insertPhone(sheet, phone, expiry, now);

      return jsonOrJsonp({
        success: true, error: null, phone,
        expiry: expiry.toISOString(),
        registration_date: now.toISOString()
      }, callback);
    }

    // ── admin_remove ──────────────────────────────────────────────────────
    if (action === "admin_remove") {
      const phone = normalizePhone(p.phone);
      if (!phone) return jsonOrJsonp({ success: false, error: "bad_phone" }, callback);
      const removed = removePhone(sheet, phone);
      if (!removed) return jsonOrJsonp({ success: false, error: "not_found" }, callback);
      return jsonOrJsonp({ success: true, error: null, phone }, callback);
    }

    // ── admin_list ────────────────────────────────────────────────────────
    if (action === "admin_list") {
      const list = listPhones(sheet, now);
      return jsonOrJsonp({ success: true, error: null, list }, callback);
    }

    // ── admin_renew ───────────────────────────────────────────────────────
    // New expiry = TODAY + days (always calculated from today).
    // registration_date is also updated to today.
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

    // ── admin_search ──────────────────────────────────────────────────────
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

// doPost handles mobile app POST requests only — unchanged.
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

    const phone    = normalizePhone(data.phone);
    const deviceId = String(data.deviceId || "").trim();

    if (!phone)    return output(false, "bad_phone");
    if (!deviceId) return output(false, "bad_device");

    const rows = sheet.getDataRange().getValues();

    for (let i = 1; i < rows.length; i++) {
      let [p, d1, d2, expiry] = rows[i];
      if (normalizePhone(p) !== phone) continue;

      let expiryIso = null;
      if (expiry) {
        const expDate = new Date(expiry);
        if (!isNaN(expDate.getTime())) {
          expiryIso = expDate.toISOString();
          if (expDate < now) {
            sheet.getRange(i + 1, 2, 1, 2).clearContent();
            return output(false, "expired", { expiry: expiryIso });
          }
        }
      }

      if (action === "validate") {
        if (d1 === deviceId || d2 === deviceId) return output(true, null, { expiry: expiryIso });
        return output(false, "revoked", { expiry: expiryIso });
      }

      if (!d1)         { sheet.getRange(i+1,2).setValue(deviceId); return output(true, null, { expiry:expiryIso }); }
      if (d1===deviceId) return output(true, null, { expiry: expiryIso });
      if (!d2)         { sheet.getRange(i+1,3).setValue(deviceId); return output(true, null, { expiry:expiryIso }); }
      if (d2===deviceId) return output(true, null, { expiry: expiryIso });

      sheet.getRange(i+1,2).setValue(d2);
      sheet.getRange(i+1,3).setValue(deviceId);
      return output(true, null, { rotated: true, expiry: expiryIso });
    }

    return output(false, "not_found");
  } catch (err) {
    return output(false, "server_error", { message: String(err) });
  }
}

/* ── Helpers ─────────────────────────────────────────────────────────────── */

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

function normalizePhone(input) {
  let s = String(input || "").trim();
  s = s.replace(/\s+/g, "").replace(/^\+/, "").replace(/\D+/g, "");
  if (!s) return "";
  if (!s.startsWith("39")) s = "39" + s;
  return s;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/* ── Phone CRUD ──────────────────────────────────────────────────────────── */

function phoneExists(sheet, phone) {
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (normalizePhone(values[i][0]) === phone) return true;
  }
  return false;
}

// Appends a new row: [phone, "", "", expiry, registration_date]
function insertPhone(sheet, phone, expiryDate, regDate) {
  sheet.appendRow([phone, "", "", expiryDate, regDate]);
}

// Updates expiry (col 4) and registration_date (col 5) for an existing phone.
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

/* ── Query helpers ───────────────────────────────────────────────────────── */

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
    } else { status = "no_expiry"; }

    let regDateIso = null;
    if (regDate) {
      const rd = new Date(regDate);
      if (!isNaN(rd.getTime())) regDateIso = rd.toISOString();
    }

    out.push({ phone, device1: d1 || "", device2: d2 || "", expiry: expIso, registration_date: regDateIso, status });
  }
  return out;
}

/* ── Sheet trigger ───────────────────────────────────────────────────────── */

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

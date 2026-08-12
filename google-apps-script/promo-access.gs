/**
 * MagicBook five-day promotion extension for the existing access backend.
 *
 * Integration in the existing doPost router (after its JSON parsing):
 *   if (payload.action === 'promo_redeem') {
 *     return promoJsonOutput_(promoRedeem_(payload));
 *   }
 *
 * Required Script Properties:
 *   GAS_SECRET               same value used by the Vercel backend
 *   ACCESS_USERS_SHEET_NAME  optional, defaults to Users
 */

var PROMO_GRANT_DAYS_ = 5;
var PROMO_MAX_DAYS_ = 30;
var PROMO_REQUEST_MAX_AGE_MS_ = 2 * 60 * 1000;
var PROMO_CODE_MAX_FUTURE_MS_ = (5 * 24 * 60 * 60 * 1000) + (10 * 60 * 1000);
var PROMO_REDEMPTIONS_SHEET_ = 'PromoRedemptions';

function promoJsonOutput_(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function promoRedeem_(payload) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return { success: false, error: 'busy' };

  try {
    var proof = promoVerifyRequest_(payload);
    if (!proof.ok) return { success: false, error: proof.error };

    var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    var usersSheetName = PropertiesService.getScriptProperties().getProperty('ACCESS_USERS_SHEET_NAME') || 'Users';
    var usersSheet = spreadsheet.getSheetByName(usersSheetName);
    if (!usersSheet) return { success: false, error: 'promo_users_sheet_missing' };

    var columns = promoEnsureUserColumns_(usersSheet);
    if (!columns.phone || !columns.expiry) {
      return { success: false, error: 'promo_user_columns_missing' };
    }

    var phone = promoNormalizePhone_(payload.phone);
    var deviceId = String(payload.deviceId || '').trim();
    var promoCodeId = String(payload.promoCodeId || '').trim().toLowerCase();
    var now = new Date();
    var rowNumber = promoFindUserRow_(usersSheet, columns.phone, phone);
    var existingExpiry = rowNumber ? promoReadDate_(usersSheet.getRange(rowNumber, columns.expiry).getValue()) : null;

    // Never shorten, replace or extend an access that is still valid.
    if (existingExpiry && existingExpiry.getTime() > now.getTime()) {
      return { success: false, error: 'active_access', expiry: existingExpiry.toISOString() };
    }

    var redemptionSheet = promoGetRedemptionSheet_(spreadsheet);
    var history = promoReadHistory_(redemptionSheet, phone);
    if (history.usedCodeIds[promoCodeId]) {
      return { success: false, error: 'promo_code_reused' };
    }

    var storedPromoDays = rowNumber
      ? Number(usersSheet.getRange(rowNumber, columns.promoDaysUsed).getValue()) || 0
      : 0;
    var promoDaysUsed = Math.max(storedPromoDays, history.daysUsed);
    if (promoDaysUsed >= PROMO_MAX_DAYS_) {
      return { success: false, error: 'promo_limit_reached', promoDaysUsed: PROMO_MAX_DAYS_ };
    }

    if (!rowNumber) {
      rowNumber = Math.max(2, usersSheet.getLastRow() + 1);
      usersSheet.getRange(rowNumber, columns.phone).setValue(phone);
    }

    var deviceResult = promoAuthorizeDevice_(usersSheet, rowNumber, columns, deviceId);
    if (!deviceResult.ok) return { success: false, error: deviceResult.error };

    var newExpiry = new Date(now.getTime() + PROMO_GRANT_DAYS_ * 24 * 60 * 60 * 1000);
    var newPromoDaysUsed = Math.min(PROMO_MAX_DAYS_, promoDaysUsed + PROMO_GRANT_DAYS_);
    var newPromoRedemptions = Math.floor(newPromoDaysUsed / PROMO_GRANT_DAYS_);

    usersSheet.getRange(rowNumber, columns.expiry).setValue(newExpiry);
    usersSheet.getRange(rowNumber, columns.promoDaysUsed).setValue(newPromoDaysUsed);
    usersSheet.getRange(rowNumber, columns.promoRedemptions).setValue(newPromoRedemptions);
    usersSheet.getRange(rowNumber, columns.lastPromoCodeId).setValue(promoCodeId);
    usersSheet.getRange(rowNumber, columns.accessSource).setValue('promo');

    redemptionSheet.appendRow([
      now,
      phone,
      promoCodeId,
      PROMO_GRANT_DAYS_,
      newExpiry,
      promoDeviceHash_(deviceId),
      'granted'
    ]);
    SpreadsheetApp.flush();

    return {
      success: true,
      status: 'success',
      phone: phone,
      expiry: newExpiry.toISOString(),
      promoDaysUsed: newPromoDaysUsed,
      promoRedemptions: newPromoRedemptions,
      promoGrantedDays: PROMO_GRANT_DAYS_
    };
  } catch (error) {
    console.error('[promo_redeem]', error && error.stack ? error.stack : error);
    return { success: false, error: 'server_error' };
  } finally {
    lock.releaseLock();
  }
}

function promoVerifyRequest_(payload) {
  var secret = PropertiesService.getScriptProperties().getProperty('GAS_SECRET') || '';
  if (!secret || !promoSafeEqual_(String(payload.token || ''), secret)) {
    return { ok: false, error: 'unauthorized' };
  }

  var phone = promoNormalizePhone_(payload.phone);
  var deviceId = String(payload.deviceId || '').trim();
  var promoCodeId = String(payload.promoCodeId || '').trim().toLowerCase();
  var timestamp = String(payload.promoTimestamp || '').trim();
  var nonce = String(payload.promoNonce || '').trim();
  var signature = String(payload.promoSignature || '').trim().toLowerCase();
  var validUntil = String(payload.promoValidUntil || '').trim();

  if (!/^\d{6,15}$/.test(phone)
      || !/^[A-Za-z0-9_-]{8,128}$/.test(deviceId)
      || !/^[a-f0-9]{64}$/.test(promoCodeId)
      || !/^\d{13}$/.test(timestamp)
      || !/^[A-Za-z0-9_-]{16,64}$/.test(nonce)
      || !/^[a-f0-9]{64}$/.test(signature)) {
    return { ok: false, error: 'invalid_request' };
  }

  var nowMs = Date.now();
  var timestampMs = Number(timestamp);
  var validUntilMs = Date.parse(validUntil);
  if (Math.abs(nowMs - timestampMs) > PROMO_REQUEST_MAX_AGE_MS_) {
    return { ok: false, error: 'request_expired' };
  }
  if (!isFinite(validUntilMs) || validUntilMs <= nowMs || validUntilMs - nowMs > PROMO_CODE_MAX_FUTURE_MS_) {
    return { ok: false, error: 'promo_expired' };
  }

  var canonical = [timestamp, nonce, phone, deviceId, promoCodeId, new Date(validUntilMs).toISOString()].join('\n');
  var expected = promoHmacHex_(canonical, secret);
  if (!promoSafeEqual_(signature, expected)) {
    return { ok: false, error: 'unauthorized' };
  }

  var cache = CacheService.getScriptCache();
  var nonceKey = 'promo_nonce_' + nonce;
  if (cache.get(nonceKey)) return { ok: false, error: 'request_replayed' };
  cache.put(nonceKey, '1', 600);
  return { ok: true };
}

function promoEnsureUserColumns_(sheet) {
  var lastColumn = Math.max(1, sheet.getLastColumn());
  var headers = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0];
  var map = {};
  headers.forEach(function (header, index) {
    map[promoHeaderKey_(header)] = index + 1;
  });

  var columns = {
    phone: promoFindColumn_(map, ['phone', 'telefono', 'numero', 'phonenumber']),
    expiry: promoFindColumn_(map, ['expiry', 'scadenza', 'expiresat']),
    device1: promoFindColumn_(map, ['device1', 'dispositivo1']),
    device2: promoFindColumn_(map, ['device2', 'dispositivo2'])
  };

  if (!columns.phone || !columns.expiry) return columns;
  columns.device1 = columns.device1 || promoAppendColumn_(sheet, map, 'device1');
  columns.device2 = columns.device2 || promoAppendColumn_(sheet, map, 'device2');
  columns.promoDaysUsed = promoFindColumn_(map, ['promodaysused']) || promoAppendColumn_(sheet, map, 'promoDaysUsed');
  columns.promoRedemptions = promoFindColumn_(map, ['promoredemptions']) || promoAppendColumn_(sheet, map, 'promoRedemptions');
  columns.lastPromoCodeId = promoFindColumn_(map, ['lastpromocodeid']) || promoAppendColumn_(sheet, map, 'lastPromoCodeId');
  columns.accessSource = promoFindColumn_(map, ['accesssource']) || promoAppendColumn_(sheet, map, 'accessSource');
  return columns;
}

function promoAppendColumn_(sheet, map, name) {
  var column = sheet.getLastColumn() + 1;
  sheet.getRange(1, column).setValue(name);
  map[promoHeaderKey_(name)] = column;
  return column;
}

function promoFindColumn_(map, aliases) {
  for (var index = 0; index < aliases.length; index += 1) {
    if (map[promoHeaderKey_(aliases[index])]) return map[promoHeaderKey_(aliases[index])];
  }
  return 0;
}

function promoHeaderKey_(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function promoFindUserRow_(sheet, phoneColumn, phone) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  var values = sheet.getRange(2, phoneColumn, lastRow - 1, 1).getDisplayValues();
  for (var index = 0; index < values.length; index += 1) {
    if (promoNormalizePhone_(values[index][0]) === phone) return index + 2;
  }
  return 0;
}

function promoAuthorizeDevice_(sheet, row, columns, deviceId) {
  var device1 = String(sheet.getRange(row, columns.device1).getValue() || '').trim();
  var device2 = String(sheet.getRange(row, columns.device2).getValue() || '').trim();
  if (device1 === deviceId || device2 === deviceId) return { ok: true };
  if (!device1) {
    sheet.getRange(row, columns.device1).setValue(deviceId);
    return { ok: true };
  }
  if (!device2) {
    sheet.getRange(row, columns.device2).setValue(deviceId);
    return { ok: true };
  }
  return { ok: false, error: 'device_reset_required' };
}

function promoGetRedemptionSheet_(spreadsheet) {
  var sheet = spreadsheet.getSheetByName(PROMO_REDEMPTIONS_SHEET_);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(PROMO_REDEMPTIONS_SHEET_);
    sheet.appendRow(['redeemedAt', 'phone', 'promoCodeId', 'daysGranted', 'expiry', 'deviceHash', 'status']);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function promoReadHistory_(sheet, phone) {
  var result = { daysUsed: 0, usedCodeIds: {} };
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return result;
  var rows = sheet.getRange(2, 1, lastRow - 1, 7).getValues();
  rows.forEach(function (row) {
    if (promoNormalizePhone_(row[1]) !== phone || String(row[6] || '') !== 'granted') return;
    var codeId = String(row[2] || '').trim().toLowerCase();
    var days = Number(row[3]) || 0;
    if (codeId) result.usedCodeIds[codeId] = true;
    if (days > 0 && days <= PROMO_GRANT_DAYS_) result.daysUsed += days;
  });
  result.daysUsed = Math.min(PROMO_MAX_DAYS_, result.daysUsed);
  return result;
}

function promoReadDate_(value) {
  if (value instanceof Date && !isNaN(value.getTime())) return value;
  var parsed = new Date(value);
  return isNaN(parsed.getTime()) ? null : parsed;
}

function promoNormalizePhone_(value) {
  var phone = String(value || '').replace(/\D/g, '');
  if (phone.indexOf('00') === 0) phone = phone.slice(2);
  if (phone && phone.indexOf('39') !== 0) phone = '39' + phone;
  return phone;
}

function promoDeviceHash_(deviceId) {
  var secret = PropertiesService.getScriptProperties().getProperty('GAS_SECRET') || '';
  return promoHmacHex_('promo-device:' + deviceId, secret);
}

function promoHmacHex_(value, secret) {
  var bytes = Utilities.computeHmacSha256Signature(String(value), String(secret));
  return bytes.map(function (byte) {
    var normalized = byte < 0 ? byte + 256 : byte;
    return ('0' + normalized.toString(16)).slice(-2);
  }).join('');
}

function promoSafeEqual_(left, right) {
  left = String(left || '');
  right = String(right || '');
  if (!left || left.length !== right.length) return false;
  var difference = 0;
  for (var index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

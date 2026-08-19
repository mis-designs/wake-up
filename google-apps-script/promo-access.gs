/**
 * MagicBook five-day promotion extension for the existing access backend.
 *
 * Integration in the existing doPost router (after its JSON parsing):
 *   if (payload.action === 'promo_redeem') {
 *     return promoJsonOutput_(promoRedeem_(payload));
 *   }
 *   if (payload.action === 'admin_promo_users') {
 *     return promoJsonOutput_(promoAdminUsers_(payload));
 *   }
 *   if (payload.action === 'admin_mark_paid') {
 *     return promoJsonOutput_(promoAdminMarkPaid_(payload));
 *   }
 *
 * Required Script Properties:
 *   GAS_SECRET               same value used by the Vercel backend
 *   ACCESS_USERS_SHEET_NAME  optional, defaults to the existing SHEET_NAME
 *                            constant or Sheet1
 */

var PROMO_GRANT_DAYS_ = 5;
var PROMO_MAX_DAYS_ = 30;
var PROMO_MAX_UNIQUE_USERS_ = 1500;
var PROMO_REQUEST_MAX_AGE_MS_ = 2 * 60 * 1000;
var PROMO_CODE_MAX_FUTURE_MS_ = (5 * 24 * 60 * 60 * 1000) + (10 * 60 * 1000);
var PROMO_REDEMPTIONS_SHEET_ = 'PromoRedemptions';

function promoJsonOutput_(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function promoGetUsersSheet_() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var configuredName = PropertiesService.getScriptProperties().getProperty('ACCESS_USERS_SHEET_NAME') || '';
  var existingName = typeof SHEET_NAME !== 'undefined' ? String(SHEET_NAME || '').trim() : '';
  return spreadsheet.getSheetByName(String(configuredName || existingName || 'Sheet1').trim());
}

function promoVerifyAdminRequest_(payload) {
  var properties = PropertiesService.getScriptProperties();
  var secret = properties.getProperty('GAS_SECRET') || '';
  var adminKey = properties.getProperty('GAS_ADMIN_KEY') || properties.getProperty('ADMIN_KEY') || '';
  if (!secret || !adminKey) return false;
  return promoSafeEqual_(String(payload.token || ''), secret)
    && promoSafeEqual_(String(payload.adminKey || ''), adminKey);
}

function promoAdminUsers_(payload) {
  if (!promoVerifyAdminRequest_(payload)) return { success: false, error: 'unauthorized' };

  var usersSheet = promoGetUsersSheet_();
  if (!usersSheet) return { success: false, error: 'promo_users_sheet_missing' };

  try {
    var columns = promoEnsureUserColumns_(usersSheet);
    if (!columns.phone || !columns.expiry) {
      return { success: false, error: 'promo_user_columns_missing' };
    }

    var lastRow = usersSheet.getLastRow();
    if (lastRow < 2) return { success: true, list: [] };
    var values = usersSheet.getRange(2, 1, lastRow - 1, usersSheet.getLastColumn()).getValues();
    var list = [];

    values.forEach(function (rowValues) {
      var phone = promoNormalizePhone_(rowValues[columns.phone - 1]);
      if (!phone || !promoRowHasPromoHistory_(rowValues, columns)) return;

      var accessSource = String(rowValues[columns.accessSource - 1] || '').trim().toLowerCase();
      var explicitPromo = columns.promoFlag ? rowValues[columns.promoFlag - 1] : '';
      var isPaid = ['paid', 'normal', 'regular', 'customer', 'manual', 'admin'].indexOf(accessSource) !== -1;
      var hasExplicitPromoFlag = Boolean(columns.promoFlag)
        && explicitPromo !== ''
        && explicitPromo !== null;
      var explicitPromoEnabled = explicitPromo === true
        || String(explicitPromo || '').trim().toLowerCase() === 'true'
        || String(explicitPromo || '').trim() === '1';
      var isPromo = !isPaid && (hasExplicitPromoFlag
        ? explicitPromoEnabled
        : accessSource === 'promo');

      list.push({
        phone: phone,
        accessSource: accessSource,
        isPromo: isPromo,
        promoDaysUsed: Number(rowValues[columns.promoDaysUsed - 1]) || 0,
        promoRedemptions: Number(rowValues[columns.promoRedemptions - 1]) || 0
      });
    });

    return { success: true, list: list };
  } catch (error) {
    console.error('[admin_promo_users]', error && error.stack ? error.stack : error);
    return { success: false, error: 'server_error' };
  }
}

function promoAdminMarkPaid_(payload) {
  if (!promoVerifyAdminRequest_(payload)) return { success: false, error: 'unauthorized' };

  var usersSheet = promoGetUsersSheet_();
  if (!usersSheet) return { success: false, error: 'promo_users_sheet_missing' };

  var phone = promoNormalizePhone_(payload.phone);
  if (!phone) return { success: false, error: 'bad_phone' };

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1200)) return { success: false, error: 'busy' };
  try {
    var columns = promoEnsureUserColumns_(usersSheet);
    if (!columns.phone || !columns.accessSource) {
      return { success: false, error: 'promo_user_columns_missing' };
    }
    var rowNumber = promoFindUserRow_(usersSheet, columns.phone, phone);
    if (!rowNumber) return { success: false, error: 'not_found' };

    usersSheet.getRange(rowNumber, columns.accessSource).setValue('paid');
    if (columns.promoFlag) usersSheet.getRange(rowNumber, columns.promoFlag).setValue(false);
    return { success: true, phone: phone, accessSource: 'paid', isPromo: false };
  } catch (error) {
    console.error('[admin_mark_paid]', error && error.stack ? error.stack : error);
    return { success: false, error: 'server_error' };
  } finally {
    lock.releaseLock();
  }
}

function promoRedeem_(payload) {
  // Reject malformed, expired or forged requests before entering the global
  // write section. Under load this keeps cryptography and replay checks from
  // blocking other users that are ready to be committed.
  var proof = promoVerifyRequest_(payload);
  if (!proof.ok) return { success: false, error: proof.error };

  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var configuredUsersSheetName = PropertiesService.getScriptProperties().getProperty('ACCESS_USERS_SHEET_NAME') || '';
  var existingUsersSheetName = typeof SHEET_NAME !== 'undefined' ? String(SHEET_NAME || '').trim() : '';
  var usersSheetName = String(configuredUsersSheetName || existingUsersSheetName || 'Sheet1').trim();
  var usersSheet = spreadsheet.getSheetByName(usersSheetName);
  if (!usersSheet) return { success: false, error: 'promo_users_sheet_missing' };

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1200)) return { success: false, error: 'busy', retryAfterMs: 700 };

  var redemptionSheet = null;
  var auditRow = null;
  var successResult = null;

  try {
    var columns = promoEnsureUserColumns_(usersSheet);
    if (!columns.phone || !columns.expiry) {
      return { success: false, error: 'promo_user_columns_missing' };
    }

    var phone = promoNormalizePhone_(payload.phone);
    var deviceId = String(payload.deviceId || '').trim();
    var promoCodeId = String(payload.promoCodeId || '').trim().toLowerCase();
    var now = new Date();
    var rowNumber = promoFindUserRow_(usersSheet, columns.phone, phone);
    var lastColumn = Math.max.apply(null, Object.keys(columns).map(function (key) {
      return Number(columns[key]) || 0;
    }));
    var rowValues = rowNumber
      ? usersSheet.getRange(rowNumber, 1, 1, lastColumn).getValues()[0]
      : new Array(lastColumn).fill('');
    var existingExpiry = promoReadDate_(rowValues[columns.expiry - 1]);

    // Never shorten, replace or extend an access that is still valid.
    if (existingExpiry && existingExpiry.getTime() > now.getTime()) {
      return { success: false, error: 'active_access', expiry: existingExpiry.toISOString() };
    }

    redemptionSheet = promoGetRedemptionSheet_(spreadsheet);
    var storedCodeIds = promoParseCodeIds_(rowValues[columns.promoUsedCodeIds - 1]);
    var history = storedCodeIds.length
      ? { daysUsed: 0, usedCodeIds: promoCodeIdMap_(storedCodeIds) }
      : promoReadHistory_(redemptionSheet, phone);
    var lastPromoCodeId = String(rowValues[columns.lastPromoCodeId - 1] || '').trim().toLowerCase();
    if (lastPromoCodeId) history.usedCodeIds[lastPromoCodeId] = true;
    if (history.usedCodeIds[promoCodeId]) {
      return { success: false, error: 'promo_code_reused' };
    }

    var storedPromoDays = Number(rowValues[columns.promoDaysUsed - 1]) || 0;
    var promoDaysUsed = Math.max(storedPromoDays, history.daysUsed);
    if (promoDaysUsed >= PROMO_MAX_DAYS_) {
      return { success: false, error: 'promo_limit_reached', promoDaysUsed: PROMO_MAX_DAYS_ };
    }

    // The campaign cap applies to distinct phone numbers, not redemptions.
    // Existing promo users may still redeem a later code, but a new promo
    // user is admitted only while fewer than 1,500 unique users exist. This
    // runs inside the script lock, so concurrent requests cannot pass the cap.
    var isExistingPromoUser = promoRowHasPromoHistory_(rowValues, columns)
      || history.daysUsed > 0;
    if (!isExistingPromoUser
        && promoCountUniqueUsers_(usersSheet, columns) >= PROMO_MAX_UNIQUE_USERS_) {
      return {
        success: false,
        error: 'promo_campaign_full',
        promoUserLimit: PROMO_MAX_UNIQUE_USERS_
      };
    }

    if (!rowNumber) {
      rowNumber = Math.max(2, usersSheet.getLastRow() + 1);
    }

    var deviceResult = promoAuthorizeDeviceValues_(
      rowValues[columns.device1 - 1],
      rowValues[columns.device2 - 1],
      deviceId
    );
    if (!deviceResult.ok) return { success: false, error: deviceResult.error };

    var newExpiry = new Date(now.getTime() + PROMO_GRANT_DAYS_ * 24 * 60 * 60 * 1000);
    var newPromoDaysUsed = Math.min(PROMO_MAX_DAYS_, promoDaysUsed + PROMO_GRANT_DAYS_);
    var newPromoRedemptions = Math.floor(newPromoDaysUsed / PROMO_GRANT_DAYS_);
    var usedCodeIds = Object.keys(history.usedCodeIds).filter(function (codeId) {
      return /^[a-f0-9]{64}$/.test(codeId);
    });
    usedCodeIds.push(promoCodeId);
    usedCodeIds = usedCodeIds.slice(-6);

    rowValues[columns.phone - 1] = phone;
    rowValues[columns.device1 - 1] = deviceResult.device1;
    rowValues[columns.device2 - 1] = deviceResult.device2;
    rowValues[columns.expiry - 1] = newExpiry;
    if (columns.registration && !rowValues[columns.registration - 1]) {
      rowValues[columns.registration - 1] = now;
    }
    rowValues[columns.promoDaysUsed - 1] = newPromoDaysUsed;
    rowValues[columns.promoRedemptions - 1] = newPromoRedemptions;
    rowValues[columns.lastPromoCodeId - 1] = promoCodeId;
    rowValues[columns.promoUsedCodeIds - 1] = usedCodeIds.join(',');
    rowValues[columns.accessSource - 1] = 'promo';
    if (columns.promoFlag) rowValues[columns.promoFlag - 1] = true;
    usersSheet.getRange(rowNumber, 1, 1, lastColumn).setValues([rowValues]);

    auditRow = [
      now,
      phone,
      promoCodeId,
      PROMO_GRANT_DAYS_,
      newExpiry,
      promoDeviceHash_(deviceId),
      'granted'
    ];

    successResult = {
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

  // The durable access state above is authoritative. Keep the append-only
  // audit outside the critical section so it never delays another activation.
  if (auditRow && redemptionSheet) {
    try {
      redemptionSheet.appendRow(auditRow);
    } catch (auditError) {
      console.error('[promo_redeem_audit]', auditError && auditError.stack ? auditError.stack : auditError);
    }
  }
  return successResult || { success: false, error: 'server_error' };
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
    registration: promoFindColumn_(map, ['registrationdate', 'registrazione', 'createdat']),
    device1: promoFindColumn_(map, ['device1', 'dispositivo1']),
    device2: promoFindColumn_(map, ['device2', 'dispositivo2'])
  };

  if (!columns.phone || !columns.expiry) return columns;
  columns.device1 = columns.device1 || promoAppendColumn_(sheet, map, 'device1');
  columns.device2 = columns.device2 || promoAppendColumn_(sheet, map, 'device2');
  columns.promoDaysUsed = promoFindColumn_(map, ['promodaysused']) || promoAppendColumn_(sheet, map, 'promoDaysUsed');
  columns.promoRedemptions = promoFindColumn_(map, ['promoredemptions']) || promoAppendColumn_(sheet, map, 'promoRedemptions');
  columns.lastPromoCodeId = promoFindColumn_(map, ['lastpromocodeid']) || promoAppendColumn_(sheet, map, 'lastPromoCodeId');
  columns.promoUsedCodeIds = promoFindColumn_(map, ['promousedcodeids']) || promoAppendColumn_(sheet, map, 'promoUsedCodeIds');
  columns.accessSource = promoFindColumn_(map, ['accesssource']) || promoAppendColumn_(sheet, map, 'accessSource');
  columns.promoFlag = promoFindColumn_(map, ['ispromo', 'promo', 'promouser']);
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
  var phoneRange = sheet.getRange(2, phoneColumn, lastRow - 1, 1);
  var exactMatch = phoneRange.createTextFinder(phone).matchEntireCell(true).findNext();
  if (exactMatch) return exactMatch.getRow();
  var values = phoneRange.getDisplayValues();
  for (var index = 0; index < values.length; index += 1) {
    if (promoNormalizePhone_(values[index][0]) === phone) return index + 2;
  }
  return 0;
}

function promoRowHasPromoHistory_(rowValues, columns) {
  return (Number(rowValues[columns.promoDaysUsed - 1]) || 0) > 0
    || (Number(rowValues[columns.promoRedemptions - 1]) || 0) > 0
    || Boolean(String(rowValues[columns.lastPromoCodeId - 1] || '').trim())
    || Boolean(String(rowValues[columns.promoUsedCodeIds - 1] || '').trim())
    || Boolean(columns.promoFlag && rowValues[columns.promoFlag - 1])
    || String(rowValues[columns.accessSource - 1] || '').trim().toLowerCase() === 'promo';
}

function promoCountUniqueUsers_(sheet, columns) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;

  var relevantColumns = [
    columns.phone,
    columns.promoDaysUsed,
    columns.promoRedemptions,
    columns.lastPromoCodeId,
    columns.promoUsedCodeIds,
    columns.accessSource
  ];
  if (columns.promoFlag) relevantColumns.push(columns.promoFlag);
  var firstColumn = Math.min.apply(null, relevantColumns);
  var lastColumn = Math.max.apply(null, relevantColumns);
  var values = sheet
    .getRange(2, firstColumn, lastRow - 1, lastColumn - firstColumn + 1)
    .getValues();
  var uniquePhones = {};

  values.forEach(function (compactRow) {
    var rowValues = [];
    relevantColumns.forEach(function (column) {
      rowValues[column - 1] = compactRow[column - firstColumn];
    });
    if (!promoRowHasPromoHistory_(rowValues, columns)) return;
    var phone = promoNormalizePhone_(rowValues[columns.phone - 1]);
    if (/^\d{6,15}$/.test(phone)) uniquePhones[phone] = true;
  });

  return Object.keys(uniquePhones).length;
}

function promoAuthorizeDeviceValues_(device1Value, device2Value, deviceId) {
  var device1 = String(device1Value || '').trim();
  var device2 = String(device2Value || '').trim();
  if (device1 === deviceId || device2 === deviceId) return { ok: true, device1: device1, device2: device2 };
  if (!device1) {
    return { ok: true, device1: deviceId, device2: device2 };
  }
  if (!device2) {
    return { ok: true, device1: device1, device2: deviceId };
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
  var matches = sheet.getRange(2, 2, lastRow - 1, 1)
    .createTextFinder(phone)
    .matchEntireCell(true)
    .findAll();
  matches.forEach(function (match) {
    var row = sheet.getRange(match.getRow(), 1, 1, 7).getValues()[0];
    if (String(row[6] || '') !== 'granted') return;
    var codeId = String(row[2] || '').trim().toLowerCase();
    var days = Number(row[3]) || 0;
    if (codeId) result.usedCodeIds[codeId] = true;
    if (days > 0 && days <= PROMO_GRANT_DAYS_) result.daysUsed += days;
  });
  result.daysUsed = Math.min(PROMO_MAX_DAYS_, result.daysUsed);
  return result;
}

function promoParseCodeIds_(value) {
  return String(value || '')
    .split(',')
    .map(function (codeId) { return String(codeId || '').trim().toLowerCase(); })
    .filter(function (codeId) { return /^[a-f0-9]{64}$/.test(codeId); })
    .slice(-6);
}

function promoCodeIdMap_(codeIds) {
  var map = {};
  (codeIds || []).forEach(function (codeId) { map[codeId] = true; });
  return map;
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

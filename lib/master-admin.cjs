'use strict';
const crypto = require('node:crypto');
const MAX_SESSION_MS = 8 * 60 * 60 * 1000;
function configuration() {
  const code = process.env.master_admin;
  return typeof code === 'string' && /^[A-Za-z0-9]{32,256}$/.test(code) && process.env.SESSION_SECRET ? code : null;
}
function equal(a, b) {
  const left = crypto.createHash('sha256').update(String(a)).digest();
  const right = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(left, right);
}
function revision(code) {
  return crypto.createHmac('sha256', process.env.SESSION_SECRET).update('master-admin-video-v1\0').update(code).digest('hex');
}
function loginClaims({ code, isAdmin, now = Date.now() }) {
  if (code === undefined || code === null || code === '') return {};
  if (isAdmin !== true) throw Object.assign(new Error('master_admin_forbidden'), { statusCode: 403 });
  const configured = configuration();
  if (!configured) throw Object.assign(new Error('master_admin_not_configured'), { statusCode: 503 });
  if (typeof code !== 'string' || code.length > 256 || !equal(code, configured)) {
    throw Object.assign(new Error('master_admin_invalid'), { statusCode: 401 });
  }
  return { masterAdminUntil: now + MAX_SESSION_MS, masterAdminRevision: revision(configured) };
}
// Call only after authenticating the token's signature, purpose and account/device.
function isMaster(payload, now = Date.now()) {
  const configured = configuration();
  return Boolean(configured && payload?.role === 'admin'
    && Number.isSafeInteger(payload.masterAdminUntil) && payload.masterAdminUntil > now
    && payload.masterAdminUntil <= now + MAX_SESSION_MS
    && typeof payload.masterAdminRevision === 'string' && /^[a-f0-9]{64}$/.test(payload.masterAdminRevision)
    && equal(payload.masterAdminRevision, revision(configured)));
}
function preserveClaims(payload, now = Date.now()) {
  return isMaster(payload, now) ? { masterAdminUntil: payload.masterAdminUntil, masterAdminRevision: payload.masterAdminRevision } : {};
}
module.exports = { loginClaims, isMaster, preserveClaims };

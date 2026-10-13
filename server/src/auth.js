'use strict';
/**
 * Authentication + authorisation helpers.
 * Zero external dependencies: HMAC-SHA256 signed tokens (JWT shape) and
 * scrypt password hashing, both from node:crypto.
 */

const crypto = require('crypto');
const db = require('./db');

const SECRET = process.env.JWT_SECRET || 'dev-only-secret-change-me';
const TOKEN_TTL = Number(process.env.TOKEN_TTL_SECONDS || 60 * 60 * 24 * 7);
const KEYLEN = 64;
const ROLES = ['student', 'staff', 'admin'];

const b64url = (input) => Buffer.from(input).toString('base64url');

function signToken(payload) {
  const now = Math.floor(Date.now() / 1000);
  const body = { ...payload, iat: now, exp: now + TOKEN_TTL };
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify(body));
  const sig = crypto.createHmac('sha256', SECRET).update(`${header}.${claims}`).digest('base64url');
  return `${header}.${claims}.${sig}`;
}

function verifyToken(token) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, claims, sig] = parts;
  const expected = crypto.createHmac('sha256', SECRET).update(`${header}.${claims}`).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let body;
  try {
    body = JSON.parse(Buffer.from(claims, 'base64url').toString('utf8'));
  } catch (_e) {
    return null;
  }
  if (!body.exp || body.exp < Math.floor(Date.now() / 1000)) return null;
  return body;
}

function hashPassword(plain, salt) {
  const s = salt || crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(String(plain), s, KEYLEN).toString('hex');
  return `scrypt$${s}$${derived}`;
}

function verifyPassword(plain, stored) {
  if (typeof stored !== 'string' || !stored.startsWith('scrypt$')) return false;
  const [, salt, expected] = stored.split('$');
  if (!salt || !expected) return false;
  const derived = crypto.scryptSync(String(plain), salt, KEYLEN).toString('hex');
  const a = Buffer.from(derived, 'hex');
  const b = Buffer.from(expected, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const PUBLIC_COLUMNS = 'id, name, email, role, department, phone, is_active, created_at';

function userFromRequest(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
  const claims = verifyToken(token);
  if (!claims || !claims.sub) return null;
  const user = db.get(`SELECT ${PUBLIC_COLUMNS} FROM users WHERE id = ?`, claims.sub);
  if (!user || !user.is_active) return null;
  return user;
}

function optionalAuth(req, _res, next) {
  req.user = userFromRequest(req);
  next();
}

function authRequired(req, res, next) {
  const user = userFromRequest(req);
  if (!user) {
    return res.status(401).json({ success: false, error: 'Authentication required. Please sign in.' });
  }
  req.user = user;
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Authentication required. Please sign in.' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: `Forbidden. This action requires role: ${roles.join(' or ')}.`,
      });
    }
    next();
  };
}

module.exports = {
  signToken,
  verifyToken,
  hashPassword,
  verifyPassword,
  optionalAuth,
  authRequired,
  requireRole,
  PUBLIC_COLUMNS,
  ROLES,
};

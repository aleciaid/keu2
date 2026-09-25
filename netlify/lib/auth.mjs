import crypto from 'node:crypto';
import { getPool, table } from './db.mjs';
import { ApiError } from './http.mjs';

/**
 * Password di-hash dengan scrypt bawaan Node (tanpa dependency native, aman di
 * Lambda). Token sesi berupa string acak; yang disimpan di database hanya
 * SHA-256-nya, sehingga bocornya isi tabel tidak langsung memberi akses.
 */

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };
const TOKEN_TTL_DAYS = Number(process.env.AUTH_TOKEN_TTL_DAYS) || 30;

const MAX_FAILURES = 10;
const FAILURE_WINDOW_MINUTES = 15;

const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 200;
const MAX_EMAIL_LENGTH = 254;

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, SCRYPT.keylen, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt}$${derived.toString('hex')}`;
}

export function verifyPassword(password, stored) {
  try {
    const parts = String(stored).split('$');
    if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

    const [, n, r, p, salt, expectedHex] = parts;
    const expected = Buffer.from(expectedHex, 'hex');
    if (!expected.length) return false;

    const derived = crypto.scryptSync(password, salt, expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
    });

    return derived.length === expected.length && crypto.timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

export function createToken() {
  return crypto.randomBytes(32).toString('hex');
}

export function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export function assertValidCredentials(email, password) {
  const normalized = normalizeEmail(email);

  if (!normalized || normalized.length > MAX_EMAIL_LENGTH || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new ApiError(400, 'invalid_email', 'Format email tidak valid.');
  }
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    throw new ApiError(400, 'weak_password', `Password minimal ${MIN_PASSWORD_LENGTH} karakter.`);
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    throw new ApiError(400, 'invalid_password', 'Password terlalu panjang.');
  }

  return normalized;
}

function attemptKey(email, ip) {
  return crypto.createHash('sha256').update(`${email}|${ip}`).digest('hex');
}

export async function assertNotRateLimited(email, ip) {
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT failures FROM ${table('auth_attempts')}
     WHERE attempt_key = ? AND last_failure_at > DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? MINUTE)`,
    [attemptKey(email, ip), FAILURE_WINDOW_MINUTES],
  );

  if (rows.length && Number(rows[0].failures) >= MAX_FAILURES) {
    throw new ApiError(429, 'too_many_attempts', 'Terlalu banyak percobaan masuk. Coba lagi beberapa menit lagi.');
  }
}

export async function recordFailedAttempt(email, ip) {
  const pool = getPool();
  await pool.query(
    `INSERT INTO ${table('auth_attempts')} (attempt_key, failures, first_failure_at, last_failure_at)
     VALUES (?, 1, UTC_TIMESTAMP(), UTC_TIMESTAMP())
     ON DUPLICATE KEY UPDATE
       failures = IF(last_failure_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? MINUTE), 1, failures + 1),
       first_failure_at = IF(last_failure_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? MINUTE), UTC_TIMESTAMP(), first_failure_at),
       last_failure_at = UTC_TIMESTAMP()`,
    [attemptKey(email, ip), FAILURE_WINDOW_MINUTES, FAILURE_WINDOW_MINUTES],
  );
}

export async function clearFailedAttempts(email, ip) {
  const pool = getPool();
  await pool.query(`DELETE FROM ${table('auth_attempts')} WHERE attempt_key = ?`, [attemptKey(email, ip)]);
}

export async function createSession(userId, deviceLabel) {
  const pool = getPool();
  const token = createToken();
  const expiresAt = new Date(Date.now() + TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

  await pool.query(
    `INSERT INTO ${table('sessions')} (id, user_id, token_hash, device_label, created_at, expires_at)
     VALUES (?, ?, ?, ?, UTC_TIMESTAMP(), ?)`,
    [crypto.randomUUID(), userId, hashToken(token), String(deviceLabel || '').slice(0, 120) || null, expiresAt],
  );

  return { token, expiresAt };
}

export async function revokeSession(token) {
  if (!token) return false;
  const pool = getPool();
  const [result] = await pool.query(
    `DELETE FROM ${table('sessions')} WHERE token_hash = ?`,
    [hashToken(token)],
  );
  return result.affectedRows > 0;
}

/** Validasi token dan kembalikan user pemiliknya. Membuang sesi kedaluwarsa. */
export async function requireSession(token) {
  if (!token) throw new ApiError(401, 'unauthorized', 'Sesi tidak ditemukan. Silakan masuk kembali.');

  const pool = getPool();
  const tokenHash = hashToken(token);

  const [rows] = await pool.query(
    `SELECT s.id AS session_id, s.expires_at,
            u.id AS user_id, u.email, u.display_name, u.created_at, u.last_login_at
     FROM ${table('sessions')} s
     JOIN ${table('users')} u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > UTC_TIMESTAMP()
     LIMIT 1`,
    [tokenHash],
  );

  if (!rows.length) {
    await pool.query(`DELETE FROM ${table('sessions')} WHERE token_hash = ?`, [tokenHash]).catch(() => {});
    throw new ApiError(401, 'session_expired', 'Sesi sudah berakhir. Silakan masuk kembali.');
  }

  const row = rows[0];

  await pool.query(
    `UPDATE ${table('sessions')} SET last_used_at = UTC_TIMESTAMP()
     WHERE id = ? AND (last_used_at IS NULL OR last_used_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 HOUR))`,
    [row.session_id],
  ).catch(() => {});

  return {
    sessionId: row.session_id,
    user: publicUser(row),
  };
}

export function publicUser(row) {
  return {
    id: row.user_id ?? row.id,
    email: row.email,
    displayName: row.display_name || null,
    createdAt: toIso(row.created_at),
  };
}

export function toIso(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

import crypto from 'node:crypto';
import { ensureSchema, getPool, table } from '../lib/db.mjs';
import {
  ApiError,
  json,
  parseBody,
  readToken,
  clientIp,
  userAgent,
  wrap,
} from '../lib/http.mjs';
import {
  assertNotRateLimited,
  assertValidCredentials,
  clearFailedAttempts,
  createSession,
  hashPassword,
  normalizeEmail,
  publicUser,
  recordFailedAttempt,
  requireSession,
  revokeSession,
  verifyPassword,
} from '../lib/auth.mjs';

/**
 * Endpoint akun: register, login, logout, me.
 *
 * Pesan gagal login sengaja dibuat sama untuk email tidak dikenal maupun
 * password salah, supaya tidak bisa dipakai menebak email yang terdaftar.
 */

async function handleRegister(event, body) {
  const email = assertValidCredentials(body.email, body.password);
  const displayName = String(body.displayName || '').trim().slice(0, 120) || null;

  await ensureSchema();
  const pool = getPool();

  const [existing] = await pool.query(
    `SELECT id FROM ${table('users')} WHERE email_normalized = ? LIMIT 1`,
    [email],
  );
  if (existing.length) {
    throw new ApiError(409, 'email_taken', 'Email ini sudah terdaftar. Coba masuk saja.');
  }

  const userId = crypto.randomUUID();
  const now = new Date();

  await pool.query(
    `INSERT INTO ${table('users')} (id, email, email_normalized, password_hash, display_name, created_at, updated_at, last_login_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [userId, String(body.email).trim(), email, hashPassword(body.password), displayName, now, now, now],
  );

  const session = await createSession(userId, userAgent(event));

  return {
    token: session.token,
    expiresAt: session.expiresAt.toISOString(),
    user: { id: userId, email: String(body.email).trim(), displayName, createdAt: now.toISOString() },
  };
}

async function handleLogin(event, body) {
  const email = normalizeEmail(body.email);
  const password = typeof body.password === 'string' ? body.password : '';

  if (!email || !password) {
    throw new ApiError(400, 'missing_credentials', 'Email dan password wajib diisi.');
  }

  const ip = clientIp(event);
  await ensureSchema();
  await assertNotRateLimited(email, ip);

  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT id, email, display_name, password_hash, created_at FROM ${table('users')}
     WHERE email_normalized = ? LIMIT 1`,
    [email],
  );

  const invalid = new ApiError(401, 'invalid_credentials', 'Email atau password salah.');

  if (!rows.length || !verifyPassword(password, rows[0].password_hash)) {
    await recordFailedAttempt(email, ip);
    throw invalid;
  }

  const row = rows[0];
  await clearFailedAttempts(email, ip);
  await pool.query(
    `UPDATE ${table('users')} SET last_login_at = UTC_TIMESTAMP() WHERE id = ?`,
    [row.id],
  );

  const session = await createSession(row.id, userAgent(event));

  return {
    token: session.token,
    expiresAt: session.expiresAt.toISOString(),
    user: publicUser({ ...row, user_id: row.id }),
  };
}

async function handleLogout(event, body) {
  const token = readToken(event, body);
  await revokeSession(token);
  return { ok: true };
}

async function handleMe(event, body) {
  const token = readToken(event, body);
  await ensureSchema();
  const { user, sessionId } = await requireSession(token);
  return { user, sessionId };
}

export const handler = wrap(async (event, cors) => {
  const body = parseBody(event);
  const action = String(body.action || '');

  switch (action) {
    case 'register':
      return json(200, await handleRegister(event, body), cors);
    case 'login':
      return json(200, await handleLogin(event, body), cors);
    case 'logout':
      return json(200, await handleLogout(event, body), cors);
    case 'me':
      return json(200, await handleMe(event, body), cors);
    default:
      throw new ApiError(400, 'unknown_action', 'Aksi tidak dikenal.');
  }
});

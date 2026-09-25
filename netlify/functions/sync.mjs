import { ensureSchema, getPool, table } from '../lib/db.mjs';
import { ApiError, json, parseBody, readToken, wrap } from '../lib/http.mjs';
import { requireSession, toIso } from '../lib/auth.mjs';

/**
 * Endpoint sinkronisasi data keuangan: push, pull, status, delete.
 *
 * Snapshot disimpan utuh sebagai JSON per akun. Bentuk ini membuat pemulihan di
 * perangkat lain menjadi operasi timpa yang sederhana, tanpa merge per tabel.
 */

const MAX_SNAPSHOT_BYTES = 8 * 1024 * 1024;

function countRecords(snapshot) {
  const data = snapshot?.data;
  if (!data || typeof data !== 'object') return 0;
  return Object.values(data).reduce(
    (sum, rows) => sum + (Array.isArray(rows) ? rows.length : 0),
    0,
  );
}

function assertSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    throw new ApiError(400, 'invalid_snapshot', 'Snapshot tidak valid.');
  }
  if (!snapshot.data || typeof snapshot.data !== 'object' || Array.isArray(snapshot.data)) {
    throw new ApiError(400, 'invalid_snapshot', 'Snapshot harus memiliki objek "data".');
  }
}

function parseClientDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

async function handlePush(event, body) {
  const token = readToken(event, body);
  await ensureSchema();
  const { user } = await requireSession(token);

  assertSnapshot(body.snapshot);

  const serialized = JSON.stringify(body.snapshot);
  const byteSize = Buffer.byteLength(serialized, 'utf8');

  if (byteSize > MAX_SNAPSHOT_BYTES) {
    throw new ApiError(
      413,
      'snapshot_too_large',
      `Data melebihi batas ${Math.round(MAX_SNAPSHOT_BYTES / 1024 / 1024)} MB.`,
    );
  }

  const recordCount = countRecords(body.snapshot);
  const schemaVersion = Number(body.snapshot.schemaVersion) || 1;
  const clientUpdatedAt = parseClientDate(body.clientUpdatedAt);
  const pool = getPool();

  // UPDATE lebih dulu supaya tidak bergantung pada sintaks ON DUPLICATE KEY,
  // lalu INSERT bila barisnya belum ada. Tabrakan langka ditangani fallback.
  const [updated] = await pool.query(
    `UPDATE ${table('datasets')}
     SET snapshot = ?, schema_version = ?, record_count = ?, byte_size = ?, client_updated_at = ?, updated_at = UTC_TIMESTAMP()
     WHERE user_id = ?`,
    [serialized, schemaVersion, recordCount, byteSize, clientUpdatedAt, user.id],
  );

  if (updated.affectedRows === 0) {
    try {
      await pool.query(
        `INSERT INTO ${table('datasets')} (user_id, snapshot, schema_version, record_count, byte_size, client_updated_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())`,
        [user.id, serialized, schemaVersion, recordCount, byteSize, clientUpdatedAt],
      );
    } catch (error) {
      if (error?.code !== 'ER_DUP_ENTRY') throw error;
      await pool.query(
        `UPDATE ${table('datasets')}
         SET snapshot = ?, schema_version = ?, record_count = ?, byte_size = ?, client_updated_at = ?, updated_at = UTC_TIMESTAMP()
         WHERE user_id = ?`,
        [serialized, schemaVersion, recordCount, byteSize, clientUpdatedAt, user.id],
      );
    }
  }

  const [rows] = await pool.query(
    `SELECT updated_at FROM ${table('datasets')} WHERE user_id = ? LIMIT 1`,
    [user.id],
  );

  return { updatedAt: toIso(rows[0]?.updated_at), recordCount, byteSize };
}

async function handlePull(event, body) {
  const token = readToken(event, body);
  await ensureSchema();
  const { user } = await requireSession(token);

  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT snapshot, schema_version, record_count, byte_size, updated_at
     FROM ${table('datasets')} WHERE user_id = ? LIMIT 1`,
    [user.id],
  );

  if (!rows.length) {
    throw new ApiError(404, 'no_data', 'Belum ada data tersimpan di server untuk akun ini.');
  }

  const row = rows[0];
  let snapshot;
  try {
    snapshot = JSON.parse(row.snapshot);
  } catch {
    throw new ApiError(500, 'corrupt_snapshot', 'Data di server tidak bisa dibaca.');
  }

  return {
    snapshot,
    updatedAt: toIso(row.updated_at),
    recordCount: row.record_count,
    byteSize: row.byte_size,
    schemaVersion: row.schema_version,
  };
}

async function handleStatus(event, body) {
  const token = readToken(event, body);
  await ensureSchema();
  const { user } = await requireSession(token);

  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT record_count, byte_size, updated_at, schema_version
     FROM ${table('datasets')} WHERE user_id = ? LIMIT 1`,
    [user.id],
  );

  if (!rows.length) {
    return { hasData: false, updatedAt: null, recordCount: 0, byteSize: 0, schemaVersion: null };
  }

  const row = rows[0];
  return {
    hasData: true,
    updatedAt: toIso(row.updated_at),
    recordCount: row.record_count,
    byteSize: row.byte_size,
    schemaVersion: row.schema_version,
  };
}

async function handleDelete(event, body) {
  const token = readToken(event, body);
  await ensureSchema();
  const { user } = await requireSession(token);

  const pool = getPool();
  await pool.query(`DELETE FROM ${table('datasets')} WHERE user_id = ?`, [user.id]);
  return { ok: true };
}

export const handler = wrap(async (event, cors) => {
  const body = parseBody(event);
  const action = String(body.action || '');

  switch (action) {
    case 'push':
      return json(200, await handlePush(event, body), cors);
    case 'pull':
      return json(200, await handlePull(event, body), cors);
    case 'status':
      return json(200, await handleStatus(event, body), cors);
    case 'delete':
      return json(200, await handleDelete(event, body), cors);
    default:
      throw new ApiError(400, 'unknown_action', 'Aksi tidak dikenal.');
  }
});

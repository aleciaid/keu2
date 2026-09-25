import mysql from 'mysql2/promise';

/**
 * Koneksi MySQL bersama untuk seluruh Netlify Function.
 *
 * Kredensial hanya hidup di environment server (`.env` saat `netlify dev`,
 * atau Environment variables di Netlify). Tidak ada satu pun bagian file ini
 * yang boleh di-import dari kode client.
 *
 * Kolom waktu disimpan dalam UTC: pool memakai `timezone: 'Z'` sehingga Date
 * ditulis dan dibaca sebagai UTC, dan perbandingan waktu dilakukan dengan
 * `UTC_TIMESTAMP()` di SQL agar tidak bergantung zona waktu server.
 */

const DEFAULT_PREFIX = 'fin_';
const MAX_PREFIX_LENGTH = 20;

let pool = null;
let schemaPromise = null;

function tablePrefix() {
  const raw = String(process.env.DB_TABLE_PREFIX ?? DEFAULT_PREFIX).trim();
  if (!/^[A-Za-z0-9_]{0,20}$/.test(raw) || raw.length > MAX_PREFIX_LENGTH) {
    const error = new Error('DB_TABLE_PREFIX hanya boleh huruf, angka, dan underscore (maks 20 karakter).');
    error.code = 'INVALID_PREFIX';
    throw error;
  }
  return raw;
}

/** Nama tabel ber-prefix. Prefix divalidasi ketat karena masuk ke string SQL. */
export function table(name) {
  if (!/^[a-z_]+$/.test(name)) throw new Error(`Nama tabel tidak valid: ${name}`);
  return `${tablePrefix()}${name}`;
}

export function getPool() {
  if (pool) return pool;

  const uri = process.env.DATABASE_URL;
  if (!uri) {
    const error = new Error('DATABASE_URL belum diset di environment server.');
    error.code = 'NOT_CONFIGURED';
    throw error;
  }

  const sslMode = String(process.env.DB_SSL || 'require').toLowerCase();
  const ssl = sslMode === 'off' ? undefined : { rejectUnauthorized: sslMode === 'verify' };

  pool = mysql.createPool({
    uri,
    ssl,
    waitForConnections: true,
    // Lambda membuka banyak container sekaligus; batasi agar tidak menghabiskan
    // slot koneksi MySQL.
    connectionLimit: 2,
    maxIdle: 2,
    idleTimeout: 60000,
    queueLimit: 0,
    connectTimeout: 15000,
    timezone: 'Z',
    charset: 'utf8mb4',
  });

  return pool;
}

function schemaStatements() {
  return [
    `CREATE TABLE IF NOT EXISTS ${table('users')} (
      id CHAR(36) NOT NULL,
      email VARCHAR(254) NOT NULL,
      email_normalized VARCHAR(254) NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      display_name VARCHAR(120) NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      last_login_at DATETIME NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_email (email_normalized)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    `CREATE TABLE IF NOT EXISTS ${table('sessions')} (
      id CHAR(36) NOT NULL,
      user_id CHAR(36) NOT NULL,
      token_hash CHAR(64) NOT NULL,
      device_label VARCHAR(120) NULL,
      created_at DATETIME NOT NULL,
      expires_at DATETIME NOT NULL,
      last_used_at DATETIME NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_token (token_hash),
      KEY idx_sessions_user (user_id),
      CONSTRAINT fk_sessions_user FOREIGN KEY (user_id)
        REFERENCES ${table('users')} (id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    `CREATE TABLE IF NOT EXISTS ${table('datasets')} (
      user_id CHAR(36) NOT NULL,
      snapshot LONGTEXT NOT NULL,
      schema_version INT NOT NULL DEFAULT 1,
      record_count INT NOT NULL DEFAULT 0,
      byte_size INT NOT NULL DEFAULT 0,
      client_updated_at DATETIME NULL,
      updated_at DATETIME NOT NULL,
      PRIMARY KEY (user_id),
      CONSTRAINT fk_datasets_user FOREIGN KEY (user_id)
        REFERENCES ${table('users')} (id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    `CREATE TABLE IF NOT EXISTS ${table('auth_attempts')} (
      attempt_key CHAR(64) NOT NULL,
      failures INT NOT NULL DEFAULT 0,
      first_failure_at DATETIME NOT NULL,
      last_failure_at DATETIME NOT NULL,
      PRIMARY KEY (attempt_key)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  ];
}

/**
 * Membuat tabel bila belum ada. Hasilnya di-cache per container Lambda supaya
 * tidak dijalankan ulang di setiap request.
 */
export function ensureSchema() {
  if (schemaPromise) return schemaPromise;

  schemaPromise = (async () => {
    const connection = getPool();
    for (const statement of schemaStatements()) {
      await connection.query(statement);
    }
  })().catch((error) => {
    schemaPromise = null;
    throw error;
  });

  return schemaPromise;
}

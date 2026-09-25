import { db } from '../db/database';

/**
 * accountSync.js — akun opsional + sinkronisasi snapshot ke server sendiri.
 *
 * Sepenuhnya opsional: tanpa akun, aplikasi tetap berjalan penuh dengan data
 * di perangkat. Setelah masuk, seluruh data keuangan bisa diunggah dan
 * dipulihkan di perangkat lain.
 *
 * Token sesi disimpan di tabel `deviceInfo`, bukan `settings`, supaya tidak
 * ikut terbawa saat user mengekspor backup JSON.
 */

const API_BASE = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '');
const AUTH_PATH = '/api/auth';
const SYNC_PATH = '/api/sync';

const AUTH_KEY = 'accountAuth';
const META_KEY = 'accountSyncMeta';

const AUTO_PUSH_INTERVAL_MS = 15 * 60 * 1000;
const SNAPSHOT_SCHEMA_VERSION = 1;

/**
 * Tabel yang ikut disinkronkan. `logs`, `settings`, dan `deviceInfo` sengaja
 * tidak ikut: log bersifat lokal, sedangkan preferensi tampilan sebaiknya tetap
 * per perangkat.
 */
export const SNAPSHOT_TABLES = [
  'wallets',
  'transactions',
  'categories',
  'budgetPlans',
  'savingsTargets',
  'savingsDeposits',
  'assets',
];

let pushing = false;

async function loadAuth() {
  const row = await db.deviceInfo.get(AUTH_KEY);
  return row?.value || null;
}

async function saveAuth(auth) {
  await db.deviceInfo.put({ key: AUTH_KEY, value: auth });
}

async function clearAuth() {
  await db.deviceInfo.delete(AUTH_KEY);
}

async function loadMeta() {
  const row = await db.deviceInfo.get(META_KEY);
  return row?.value || {};
}

async function saveMeta(patch) {
  const current = await loadMeta();
  const next = { ...current, ...patch };
  await db.deviceInfo.put({ key: META_KEY, value: next });
  return next;
}

async function apiFetch(path, payload) {
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    throw Object.assign(
      new Error('Tidak bisa menghubungi server. Periksa koneksi internet Anda.'),
      { code: 'NETWORK' },
    );
  }

  let data = null;
  try {
    data = await res.json();
  } catch {
    // respons tanpa body JSON
  }

  if (!res.ok) {
    throw Object.assign(
      new Error(data?.message || `Server menolak permintaan (${res.status}).`),
      { code: data?.error || 'API_ERROR', status: res.status },
    );
  }

  return data || {};
}

async function authedCall(path, payload) {
  const auth = await loadAuth();
  if (!auth?.token) {
    throw Object.assign(new Error('Anda belum masuk ke akun.'), { code: 'AUTH_REQUIRED' });
  }

  try {
    return await apiFetch(path, { ...payload, token: auth.token });
  } catch (error) {
    if (error.code === 'unauthorized' || error.code === 'session_expired') {
      await clearAuth();
      throw Object.assign(
        new Error('Sesi sudah berakhir. Silakan masuk kembali.'),
        { code: 'AUTH_REQUIRED' },
      );
    }
    throw error;
  }
}

/** Buat akun baru dan langsung masuk. */
export async function register({ email, password, displayName }) {
  const result = await apiFetch(AUTH_PATH, {
    action: 'register',
    email: String(email || '').trim(),
    password,
    displayName: displayName ? String(displayName).trim() : '',
  });

  await saveAuth({
    token: result.token,
    expiresAt: result.expiresAt,
    user: result.user,
  });

  return result.user;
}

export async function login({ email, password }) {
  const result = await apiFetch(AUTH_PATH, {
    action: 'login',
    email: String(email || '').trim(),
    password,
  });

  await saveAuth({
    token: result.token,
    expiresAt: result.expiresAt,
    user: result.user,
  });

  return result.user;
}

/** Keluar dari akun. Data lokal tidak dihapus. */
export async function logout() {
  const auth = await loadAuth();
  if (auth?.token) {
    try {
      await apiFetch(AUTH_PATH, { action: 'logout', token: auth.token });
    } catch {
      // sesi mungkin sudah tidak berlaku di server; sesi lokal tetap dibersihkan
    }
  }
  await clearAuth();
  await saveMeta({ autoPush: false, serverUpdatedAt: '', recordCount: null, byteSize: null });
}

/** Status akun dari data lokal saja, dipakai sebagai sumber reaktif untuk UI. */
export async function getStatus() {
  const [auth, meta] = await Promise.all([loadAuth(), loadMeta()]);
  return {
    loggedIn: !!auth?.token,
    user: auth?.user || null,
    autoPush: meta.autoPush === true,
    lastPushAt: meta.lastPushAt || '',
    lastPullAt: meta.lastPullAt || '',
    serverUpdatedAt: meta.serverUpdatedAt || '',
    recordCount: typeof meta.recordCount === 'number' ? meta.recordCount : null,
    byteSize: typeof meta.byteSize === 'number' ? meta.byteSize : null,
  };
}

export async function setAutoPush(enabled) {
  await saveMeta({ autoPush: !!enabled });
}

export async function getLocalRecordCounts() {
  const entries = await Promise.all(
    SNAPSHOT_TABLES.map(async (name) => [name, await db.table(name).count()]),
  );
  const counts = Object.fromEntries(entries);
  counts.total = Object.values(counts).reduce((sum, value) => sum + value, 0);
  return counts;
}

/** Metadata data di server (bukan isi datanya). */
export async function fetchServerStatus() {
  return authedCall(SYNC_PATH, { action: 'status' });
}

export async function buildSnapshot() {
  const data = {};
  for (const name of SNAPSHOT_TABLES) {
    data[name] = await db.table(name).toArray();
  }

  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    appVersion: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0',
    exportedAt: new Date().toISOString(),
    data,
  };
}

async function applySnapshot(snapshot) {
  const data = snapshot?.data || {};

  await db.transaction('rw', SNAPSHOT_TABLES.map((name) => db.table(name)), async () => {
    for (const name of SNAPSHOT_TABLES) {
      await db.table(name).clear();
      const rows = Array.isArray(data[name]) ? data[name] : [];
      if (rows.length) await db.table(name).bulkPut(rows);
    }
  });
}

export async function pushSnapshot() {
  const snapshot = await buildSnapshot();
  const result = await authedCall(SYNC_PATH, {
    action: 'push',
    snapshot,
    clientUpdatedAt: new Date().toISOString(),
  });

  const pushedAt = new Date().toISOString();
  await saveMeta({
    lastPushAt: pushedAt,
    serverUpdatedAt: result.updatedAt || pushedAt,
    recordCount: result.recordCount ?? null,
    byteSize: result.byteSize ?? null,
  });

  return result;
}

/**
 * Pulihkan data dari server. Ini MENIMPA seluruh data keuangan lokal, jadi
 * pemanggil harus mengonfirmasi lebih dulu ke user.
 */
export async function pullSnapshot() {
  const result = await authedCall(SYNC_PATH, { action: 'pull' });
  await applySnapshot(result.snapshot);

  const pulledAt = new Date().toISOString();
  await saveMeta({
    lastPullAt: pulledAt,
    serverUpdatedAt: result.updatedAt || pulledAt,
    recordCount: result.recordCount ?? null,
    byteSize: result.byteSize ?? null,
  });

  return result;
}

export async function deleteServerData() {
  await authedCall(SYNC_PATH, { action: 'delete' });
  await saveMeta({ serverUpdatedAt: '', recordCount: null, byteSize: null, lastPushAt: '', lastPullAt: '' });
}

/**
 * Dipanggil dari interval App.jsx. Aman dipanggil sesering apa pun: kalau
 * auto-push mati, belum masuk, atau belum lewat 15 menit, fungsi langsung
 * keluar tanpa memanggil server.
 */
export async function runAutoPush() {
  try {
    if (pushing) return { skipped: true };

    const [auth, meta] = await Promise.all([loadAuth(), loadMeta()]);
    if (!auth?.token || meta.autoPush !== true) return { skipped: true };

    const lastMs = meta.lastPushAt ? Date.parse(meta.lastPushAt) : 0;
    if (lastMs && Date.now() - lastMs < AUTO_PUSH_INTERVAL_MS) return { skipped: true };

    pushing = true;
    try {
      await pushSnapshot();
      return { pushed: true };
    } finally {
      pushing = false;
    }
  } catch {
    // Auto-push gagal (mis. offline atau sesi berakhir) cukup diabaikan.
    return { skipped: true };
  }
}

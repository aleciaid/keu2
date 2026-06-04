/**
 * appUpdater.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Deteksi versi app yang baru di-bundle vs versi yang tersimpan di localStorage.
 * Jika berbeda → clear cache WebView/SW stale → simpan versi baru.
 *
 * ⚠️  Data user (IndexedDB / Dexie) TIDAK disentuh — hanya cache aset
 *     (Service Worker cache storage + WebView HTTP cache) yang di-clear.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const VERSION_KEY = 'app_bundle_version';

/** Versi yang di-embed saat build oleh Vite `define`. */
const CURRENT_VERSION =
  typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0';

/**
 * Hapus semua Service Worker cache storage (cache aset/stale).
 * IndexedDB (Dexie) tidak tergantung pada cache ini — data user aman.
 */
async function clearAssetCaches() {
  try {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      console.info(`[AppUpdater] Cleared ${keys.length} cache store(s).`);
    }
  } catch (e) {
    console.warn('[AppUpdater] Failed to clear caches:', e);
  }
}

/**
 * Unregister semua Service Worker aktif agar versi baru langsung diambil.
 */
async function unregisterServiceWorkers() {
  try {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((r) => r.unregister()));
      console.info(
        `[AppUpdater] Unregistered ${registrations.length} service worker(s).`
      );
    }
  } catch (e) {
    console.warn('[AppUpdater] Failed to unregister service workers:', e);
  }
}

/**
 * Periksa apakah versi bundle saat ini berbeda dari versi yang tersimpan.
 * Jika berbeda, lakukan cache invalidation dan simpan versi baru.
 *
 * @returns {{ updated: boolean, from: string|null, to: string }}
 */
export async function checkAndApplyUpdate() {
  const storedVersion = localStorage.getItem(VERSION_KEY);

  // Pertama kali install — tidak perlu clear, langsung simpan versi
  if (!storedVersion) {
    localStorage.setItem(VERSION_KEY, CURRENT_VERSION);
    console.info(`[AppUpdater] First install. Version: ${CURRENT_VERSION}`);
    return { updated: false, from: null, to: CURRENT_VERSION };
  }

  // Versi sama — tidak ada yang perlu dilakukan
  if (storedVersion === CURRENT_VERSION) {
    return { updated: false, from: storedVersion, to: CURRENT_VERSION };
  }

  // ── Versi BERBEDA → ada pembaruan ────────────────────────────────────────
  console.info(
    `[AppUpdater] Update detected: ${storedVersion} → ${CURRENT_VERSION}`
  );

  // 1. Hapus cache aset stale (SW cache storage)
  await clearAssetCaches();

  // 2. Unregister SW lama agar segera diganti
  await unregisterServiceWorkers();

  // 3. Simpan versi baru
  localStorage.setItem(VERSION_KEY, CURRENT_VERSION);

  return { updated: true, from: storedVersion, to: CURRENT_VERSION };
}

/** Baca versi yang sedang berjalan (embedded saat build). */
export function getCurrentVersion() {
  return CURRENT_VERSION;
}

/** Baca versi yang tersimpan dari sesi sebelumnya. */
export function getStoredVersion() {
  return localStorage.getItem(VERSION_KEY);
}

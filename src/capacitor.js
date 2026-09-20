import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';

/**
 * Initialize Capacitor native plugins.
 * This function is safe to call on web — all calls are no-ops when
 * running outside a native container.
 */
export async function initCapacitor() {
  const isNative = Capacitor.isNativePlatform();

  if (!isNative) {
    // Running on the web (browser/PWA) — nothing to configure.
    return;
  }

  // ─── Status Bar ───────────────────────────────────────────────
  try {
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: '#020617' });
  } catch (e) {
    console.warn('StatusBar plugin error:', e);
  }

  // ─── Splash Screen ───────────────────────────────────────────
  try {
    // The splash screen auto-hides after `launchShowDuration` (set in
    // capacitor.config.ts), but we hide it manually once React is ready.
    setTimeout(() => {
      SplashScreen.hide({ fadeOutDuration: 400 });
    }, 500);
  } catch (e) {
    console.warn('SplashScreen plugin error:', e);
  }

  // ─── Hardware Back Button (Android) ──────────────────────────
  try {
    CapApp.addListener('backButton', ({ canGoBack }) => {
      if (canGoBack) {
        window.history.back();
      } else {
        // If we're at the root, minimise the app instead of closing it
        CapApp.minimizeApp();
      }
    });
  } catch (e) {
    console.warn('App plugin error:', e);
  }
}

/**
 * Utility: check whether we are running inside a Capacitor native shell.
 */
export function isNativePlatform() {
  return Capacitor.isNativePlatform();
}

/**
 * Utility: get the current platform ('android', 'ios', or 'web').
 */
export function getPlatform() {
  return Capacitor.getPlatform();
}

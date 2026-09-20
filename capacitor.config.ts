import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.fintrack.app',
  appName: 'FinTrack',
  webDir: 'dist',
  server: {
    // Serve all assets from the app bundle (offline)
    androidScheme: 'https',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: '#020617',
      showSpinner: false,
      launchFadeOutDuration: 500,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#020617',
    },
  },
  android: {
    // Allow mixed content for local IndexedDB usage
    allowMixedContent: true,
    // Capture back button for in-app navigation
    captureInput: true,
    backgroundColor: '#020617',
  },
};

export default config;

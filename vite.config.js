import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      manifest: {
        name: "FinTrack - Personal Finance Tracker",
        short_name: "FinTrack",
        description: "Offline-first personal finance tracking app with multi-wallet support",
        start_url: "/",
        display: "standalone",
        background_color: "#020617",
        theme_color: "#020617",
        orientation: "portrait",
        categories: ["finance", "utilities"],
        icons: [
          {
            src: "/icon-192.svg",
            sizes: "192x192",
            type: "image/svg+xml",
            purpose: "any maskable"
          },
          {
            src: "/icon-512.svg", 
            sizes: "512x512",
            type: "image/svg+xml",
            purpose: "any maskable"
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,json}'],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
      }
    })
  ],
  build: {
    rollupOptions: {
      input: {
        main: './index.html',
      },
    },
  },
})

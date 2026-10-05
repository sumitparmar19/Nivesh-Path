// Vite config for the Nivesh-Path React app. Builds to frontend/dist (served by Express); in dev, API calls
// and the shared static files (stock logos, legacy pages) are proxied to the Express server on :3000.
/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const backend = "http://localhost:3000";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    assetsDir: "static", // /static/* so it never collides with the legacy /assets/* files
    emptyOutDir: true,
    sourcemap: false,
  },
  server: {
    port: 5173,
    proxy: { "/api": backend, "/img": backend, "/search": backend, "/health": backend },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    css: false,
    include: ["src/**/*.test.{ts,tsx}"], // e2e/ is Playwright's
  },
});

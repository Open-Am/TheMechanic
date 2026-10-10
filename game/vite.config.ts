import { defineConfig } from "vite";

// Static build for any CDN. `--host` exposes the dev server on the local network for phone testing.
export default defineConfig({
  base: "./",
  server: { host: true, port: 5173 },
  build: { target: "es2022", sourcemap: false },
});

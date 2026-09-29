import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  plugins: [svelte()],
  worker: { format: "es" },
  build: {
    // maplibre-gl alone is ~1 MB minified; split it so app code caches independently.
    chunkSizeWarningLimit: 1100,
    rolldownOptions: { output: { advancedChunks: { groups: [{ name: "maplibre", test: /maplibre-gl/ }] } } },
  },
});

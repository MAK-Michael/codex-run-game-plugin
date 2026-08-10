import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig({
  plugins: [viteSingleFile()],
  build: {
    outDir: "dist/ui",
    emptyOutDir: true,
    assetsInlineLimit: 100_000,
  },
});

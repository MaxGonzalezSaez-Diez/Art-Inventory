import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ command }) => ({
  // Packaged app loads index.html from disk (file://), so assets must be
  // referenced with relative paths.
  base: command === "build" ? "./" : "/",
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true
  },
  build: {
    outDir: "dist/renderer"
  }
}));

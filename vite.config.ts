import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  base: "./",
  plugins: [react()],
  resolve: {
    alias: {
      "@common": path.resolve(__dirname, "src/common"),
      "@renderer": path.resolve(__dirname, "src/renderer")
    }
  },
  build: {
    outDir: "dist/renderer"
  }
});

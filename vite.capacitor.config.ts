import { defineConfig } from "vite";
import { resolve } from "node:path";
import { copyFileSync, existsSync } from "node:fs";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/** Self-contained static build for the iOS Capacitor shell. No SSR. */
export default defineConfig({
  plugins: [
    tailwindcss(),
    viteReact(),
    {
      name: "cap-index",
      closeBundle() {
        const from = resolve("dist-ios/index.capacitor.html");
        const to = resolve("dist-ios/index.html");
        if (existsSync(from)) copyFileSync(from, to);
      },
    },
  ],
  resolve: { tsconfigPaths: true },
  build: {
    outDir: "dist-ios",
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      input: resolve("index.capacitor.html"),
    },
  },
});

import react from "@vitejs/plugin-react";
import { loadEnv, type Plugin } from "vite";
import { defineConfig } from "vitest/config";

/** Adds <link rel="preconnect"> to the API origin so the first request skips the DNS + TLS wait. */
function preconnectApi(mode: string): Plugin {
  return {
    name: "firecal-preconnect-api",
    transformIndexHtml() {
      const url = loadEnv(mode, process.cwd(), "VITE_").VITE_API_URL || process.env.VITE_API_URL;
      if (!url) return [];
      try {
        return [{ tag: "link", attrs: { rel: "preconnect", href: new URL(url).origin, crossorigin: "" }, injectTo: "head" }];
      } catch {
        return [];
      }
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), preconnectApi(mode)],
  server: { port: 5173 },
  build: {
    chunkSizeWarningLimit: 900,
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: { provider: "v8", reporter: ["text-summary", "lcov"], include: ["src/**/*.{ts,tsx}"] },
  },
}));

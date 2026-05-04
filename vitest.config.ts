import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
    },
  },
  test: {
    environment: "node",
    // Include integration tests under app/ so route handler tests run too.
    // E2E tests live in e2e/ and are excluded — Playwright owns those.
    include: ["lib/**/*.test.ts", "app/**/*.test.ts"],
    exclude: ["node_modules/**", "e2e/**", ".next/**"],
    globals: false,
  },
});

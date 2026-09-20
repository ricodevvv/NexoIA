import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
    env: {
      ENCRYPTION_KEY: "0".repeat(64),
      DATABASE_URL: "postgres://nexo:nexo@localhost:5432/nexo_test",
    },
  },
});

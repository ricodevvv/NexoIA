import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const BASE = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  globalSetup: "./tests/e2e/global-setup.ts",
  use: { baseURL: BASE, trace: "retain-on-failure", ...devices["Desktop Chrome"] },
  webServer: [
    { command: "node tests/mocks/llm.mjs", port: 4010, env: { MOCK_LLM_PORT: "4010" }, reuseExistingServer: false },
    { command: "node tests/mocks/mcp.mjs", port: 4110, env: { MOCK_MCP_PORT: "4110" }, reuseExistingServer: false },
    { command: "node tests/mocks/mcp-oauth.mjs", port: 4120, env: { MOCK_OAUTH_PORT: "4120", MOCK_OAUTH_TTL: "5" }, reuseExistingServer: false },
    {
      command: `pnpm exec next dev -p ${PORT}`,
      url: `${BASE}/login`,
      timeout: 180_000,
      reuseExistingServer: false,
      env: {
        DATABASE_URL: "postgres://nexo:nexo@localhost:5432/nexo_test",
        BETTER_AUTH_URL: BASE,
        COMPAT_NAME: "Mock",
        COMPAT_BASE_URL: "http://127.0.0.1:4010/v1",
        COMPAT_MODELS: "mock-1",
        ALLOW_PRIVATE_MCP: "1",
        CODE_EXECUTION: "1",
        CODE_SANDBOX_COMMAND: "",
        STORAGE_DRIVER: "db",
        SIGNUP_RATE_MAX: "100",
        ANTHROPIC_API_KEY: "",
        OPENAI_API_KEY: "",
        OPENAI_MODELS: "",
        RESEND_API_KEY: "",
      },
    },
  ],
});

import { defineConfig, devices } from "@playwright/test";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const backendDir = path.join(root, "backend");
const winPy = path.join(backendDir, ".venv", "Scripts", "python.exe");
const posixPy = path.join(backendDir, ".venv", "bin", "python");
const python = process.env.PYTHON ?? (existsSync(winPy) ? winPy : existsSync(posixPy) ? posixPy : "python");

const resultsDir = path.join(import.meta.dirname, "test-results");
mkdirSync(resultsDir, { recursive: true });
const dbPath = path.join(resultsDir, `e2e-${Date.now()}.db`).replace(/\\/g, "/");

const API_PORT = 8011;
const WEB_PORT = 5181;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  timeout: 45_000,
  use: {
    baseURL: `http://127.0.0.1:${WEB_PORT}`,
    trace: "retain-on-failure",
    viewport: { width: 1440, height: 900 },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
  webServer: [
    {
      command: `"${python}" -m uvicorn app.main:app --host 127.0.0.1 --port ${API_PORT}`,
      cwd: backendDir,
      url: `http://127.0.0.1:${API_PORT}/api/health`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        DATABASE_URL: `sqlite:///${dbPath}`,
        AI_PROVIDER: "heuristic",
        GEMINI_API_KEY: "",
        OPENAI_COMPAT_API_KEY: "",
        GITHUB_TOKEN: "",
        GITHUB_WRITE_ENABLED: "false",
        WRITE_ALLOWED_REPOS: "",
        CORS_ORIGINS: `http://127.0.0.1:${WEB_PORT}`,
      },
    },
    {
      command: `npm run dev -- --host 127.0.0.1 --port ${WEB_PORT} --strictPort`,
      cwd: import.meta.dirname,
      url: `http://127.0.0.1:${WEB_PORT}`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: { ISSUEPILOT_API: `http://127.0.0.1:${API_PORT}` },
    },
  ],
});

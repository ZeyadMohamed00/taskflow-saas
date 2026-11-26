import { defineConfig } from "@playwright/test";

// Runs the real stack: FastAPI serving the built SPA on :8000 with a throwaway SQLite database.
export default defineConfig({
  testDir: ".",
  timeout: 60_000,
  use: { baseURL: "http://localhost:8000", channel: process.env.PW_CHANNEL || undefined, screenshot: "only-on-failure" },
  webServer: {
    command: "rm -f e2e.db && DATABASE_URL=sqlite:///./e2e.db python -m uvicorn app.main:app --port 8000",
    cwd: "../..",
    url: "http://localhost:8000/health",
    reuseExistingServer: false,
    timeout: 60_000,
  },
});

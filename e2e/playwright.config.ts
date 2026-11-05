import { defineConfig, devices } from '@playwright/test';
import { join } from 'node:path';
import { API, WEB } from './servers';

const here = (path: string) => join(__dirname, path);
const ci = !!process.env['CI'];

/**
 * The real web (the dev server: SSR plus the /api proxy Traefik does in production) over the
 * real api in fixture mode: GitHub data and sign-in answered locally, wraps in memory. As in
 * production, server-side rendering reads the api directly (`API_INTERNAL_URL`) and the browser
 * goes through the proxy. The api must be built first (`pnpm -r build`).
 */
export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  globalSetup: './global-setup.ts',
  // One api in memory shared by every test: run them in order.
  workers: 1,
  forbidOnly: ci,
  retries: ci ? 1 : 0,
  reporter: ci ? [['github'], ['list']] : 'list',
  use: {
    baseURL: WEB,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'node dist/main',
      cwd: here('../apps/api'),
      port: 3201,
      reuseExistingServer: false,
      env: {
        PORT: '3201',
        GITHUB_FIXTURES_DIR: here('../apps/api/test/fixtures/github'),
        PUBLIC_BASE_URL: WEB,
        API_BASE_URL: API,
      },
    },
    {
      command: 'pnpm exec ng serve --port 4201 --proxy-config ../../e2e/proxy.conf.json',
      cwd: here('../apps/web'),
      url: WEB,
      reuseExistingServer: false,
      timeout: 180_000,
      // Going back through this dev server instead depends on how `localhost` resolves: in a
      // container it may listen on ::1 only while Node's fetch dials 127.0.0.1. The api listens
      // on both.
      env: { API_INTERNAL_URL: API },
    },
  ],
});

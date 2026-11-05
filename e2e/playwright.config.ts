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
  projects: [
    // The public page as a computer opens it: server rendering, hydration, the phone frame.
    { name: 'desktop', testMatch: 'public-wrap.spec.ts', use: { ...devices['Desktop Chrome'] } },
    // The whole journey on a phone, from the entry to deleting the wrap.
    { name: 'phone', testMatch: 'mobile-flow.spec.ts', use: { ...devices['Pixel 7'] } },
  ],
  webServer: [
    {
      command: 'node dist/main',
      cwd: here('../apps/api'),
      port: 3201,
      reuseExistingServer: false,
      env: {
        PORT: '3201',
        // The people in fixtures/people.ts; the api's own e2e tests keep theirs.
        GITHUB_FIXTURES_DIR: here('fixtures/github'),
        PUBLIC_BASE_URL: WEB,
        API_BASE_URL: API,
        // Every test comes from the same address: real limits would turn a CI retry into a 429.
        RATE_LIMIT_PREVIEW_MAX: '1000',
        RATE_LIMIT_PUBLISH_MAX: '1000',
        // Publishing queues the video as in production; nothing renders it, so it waits in line.
        RENDER_VIDEO_ENABLED: 'true',
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

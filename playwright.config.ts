import { defineConfig } from '@playwright/test';
import { uiPort,uiOrigin } from './tests/ui/fixtures/origins';

export default defineConfig({
  testDir: './tests/ui',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: uiOrigin,
    browserName: 'chromium',
    channel: process.env.PLAYWRIGHT_CHANNEL ?? 'msedge',
    locale: 'es-PE',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1280, height: 900 } } },
    { name: 'tablet', use: { viewport: { width: 768, height: 1024 }, hasTouch: true } },
    { name: 'mobile', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
  webServer: {
    command: `npm run preview:local -- --port ${uiPort}`,
    env: { APP_LOCAL_UI_TEST: '1' },
    url: uiOrigin,
    // Never reuse a server that could load the user's remote .env.local destination.
    reuseExistingServer: false,
    timeout: 30000,
  },
});

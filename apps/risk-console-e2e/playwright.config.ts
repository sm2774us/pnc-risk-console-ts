import { defineConfig, devices } from '@playwright/test';

const CI = !!process.env['CI'];
/** Optional: point at a system Chromium when Playwright's own browser download is unavailable. */
const chromium = process.env['PW_CHROMIUM_PATH'];
export default defineConfig({
  testDir: './src',
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 2 : 0,
  workers: CI ? 2 : undefined,
  reporter: CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: 'http://localhost:4200',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: chromium ? { executablePath: chromium, args: ['--no-sandbox', '--disable-gpu'] } : {},
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /a11y|auth/ },
  ],
  webServer: [
    {
      command: 'node ../../dist/apps/bff/main.mjs',
      url: 'http://localhost:3000/healthz',
      reuseExistingServer: !CI,
      timeout: 60_000,
      env: { NODE_ENV: 'development', PORT: '3000', AUTH_MODE: 'demo', DATASET_SIZE: '50000' },
    },
    { command: 'npx nx serve risk-console', cwd: '../..', url: 'http://localhost:4200', reuseExistingServer: !CI, timeout: 180_000 },
  ],
});

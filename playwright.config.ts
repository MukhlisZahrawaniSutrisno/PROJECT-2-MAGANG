import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';
const existingChrome = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || 'C:/Users/Mukhlis Zahrawani S/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe';
export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30000,
  reporter: 'list',
  use: { baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3000', trace: 'retain-on-failure', launchOptions: existsSync(existingChrome) ? { executablePath: existingChrome } : {} },
  projects: [{ name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width:1440,height:1050 } } }, { name:'mobile', use: { ...devices['iPhone 13'], defaultBrowserType:'chromium' } }],
});

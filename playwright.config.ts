import { defineConfig } from '@playwright/test';
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
const root = join(homedir(), '.agent-browser/browsers');
const installed = existsSync(root)
  ? readdirSync(root)
      .filter((p) => p.startsWith('chrome-'))
      .sort()
      .reverse()
  : [];
const chrome = installed
  .map((p) =>
    join(
      root,
      p,
      'Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
    ),
  )
  .find(existsSync);
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  reporter: [['list'], ['json', { outputFile: 'test-results/results.json' }]],
  use: {
    baseURL: process.env.TEST_BASE_URL || 'http://localhost:3000',
    viewport: { width: 1440, height: 1000 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: {
      executablePath: process.env.CHROME_PATH || chrome,
      args: [
        '--enable-features=WebMCP',
        '--enable-blink-features=WebMCP,WebMCPTesting',
      ],
    },
  },
});

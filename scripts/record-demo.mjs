import { chromium } from '@playwright/test';
import { existsSync, readdirSync, mkdirSync, copyFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
const root = join(homedir(), '.agent-browser/browsers');
const executablePath = readdirSync(root).filter(p => p.startsWith('chrome-')).sort().reverse().map(p => join(root, p, 'Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing')).find(existsSync);
const browser = await chromium.launch({ executablePath, args: ['--enable-features=WebMCP', '--enable-blink-features=WebMCP,WebMCPTesting'] });
mkdirSync('docs/media', { recursive: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1040 }, recordVideo: { dir: 'test-results/video', size: { width: 1440, height: 1040 } }, reducedMotion: 'reduce' });
const page = await context.newPage();
// Pauses below pace the recording for a human viewer; verification uses condition-based waits.
const beat = ms => page.waitForTimeout(ms);
try {
 await page.goto(process.env.TEST_BASE_URL || 'http://localhost:3001');
 await page.locator('.context-id').filter({ hasText: /[a-f0-9]{8}/ }).waitFor();
 await page.evaluate(() => document.fonts.ready);
 await page.getByRole('heading', { name: 'The page is the context.' }).click();
 await page.screenshot({ path: 'docs/media/pagescope.png', fullPage: true });
 await beat(2500);
 await page.getByRole('combobox', { name: 'Failure scenario' }).click(); await beat(1000);
 await page.getByRole('option', { name: 'Out-of-order search' }).click(); await beat(2200);
 await page.getByRole('button', { name: 'Reproduce bug', exact: true }).click();
 await page.getByText('The bug is reproduced.', { exact: true }).waitFor(); await beat(3000);
 await page.getByRole('button', { name: 'inspect_state', exact: true }).click(); await beat(5000);
 await page.getByRole('tab', { name: 'Timeline', exact: true }).click();
 await page.locator('.trace-list').evaluate(el => { el.scrollTop = el.scrollHeight; }); await beat(4000);
 await page.getByRole('button', { name: 'Apply fix & verify', exact: true }).click();
 await page.getByText('Patched run complete.', { exact: true }).waitFor(); await beat(3000);
 await page.getByRole('tab', { name: 'Tools', exact: true }).click();
 await page.getByRole('button', { name: 'inspect_state', exact: true }).click(); await beat(4000);
 await page.getByRole('tab', { name: 'Patch', exact: true }).click();
 await page.locator('.diagnosis').scrollIntoViewIfNeeded(); await beat(3500);
 await page.screenshot({ path: 'docs/media/verified.png', fullPage: true });
 await context.close();
 const video = await page.video().path(); copyFileSync(video, '../pagescope-demo.webm');
 console.log('Saved docs/media/pagescope.png, docs/media/verified.png, and ../pagescope-demo.webm');
} finally { await browser.close(); }

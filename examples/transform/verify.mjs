import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromePath } from '../../scripts/browser.mjs';
const mode = process.argv[2] || 'original';
assert.ok(['original', 'instrumented', 'fixed'].includes(mode));
const origin = process.env.TRANSFORM_URL || 'http://localhost:3010';
const browser = await chromium.launch({ executablePath: chromePath(), args: [
  '--enable-features=WebMCP', '--enable-blink-features=WebMCP,WebMCPTesting',
] });
mkdirSync('docs/verification', { recursive: true });
mkdirSync('docs/media', { recursive: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 720 },
  recordVideo: mode === 'instrumented' ? { dir: 'test-results/transform-video', size: { width: 1280, height: 720 } } : undefined });
try {
  const page = await context.newPage();
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let firstStarted;
  const started = new Promise(resolve => { firstStarted = resolve; });
  const first = JSON.stringify({ file: 'first.json', color: 'red' }, null, 2);
  const second = JSON.stringify({ file: 'second.json', color: 'blue' }, null, 2);
  await page.route('**/__tab-debug-fixtures/*.json', async route => {
    const isFirst = route.request().url().endsWith('/first.json');
    if (isFirst) { firstStarted(); await gate; }
    await route.fulfill({ contentType: 'application/json', body: isFirst ? first : second });
  });
  await page.goto(origin + '/json-to-yaml');
  const editor = page.locator('.monaco-editor').nth(0).locator('.view-lines');
  await expect(editor).toContainText('userId', { timeout: 60000 });
  await page.locator('button[aria-haspopup="true"]').click();
  await page.getByPlaceholder('Enter URL').fill(origin + '/__tab-debug-fixtures/first.json');
  await page.getByRole('button', { name: 'Fetch URL', exact: true }).click();
  await started;
  await page.getByPlaceholder('Enter URL').fill(origin + '/__tab-debug-fixtures/second.json');
  await page.getByRole('button', { name: 'Fetch URL', exact: true }).click();
  await expect(editor).toContainText('second.json');
  const chosenFileVisible = await editor.innerText();
  const firstResponse = page.waitForResponse('**/__tab-debug-fixtures/first.json');
  release();
  await (await firstResponse).finished();
  if (mode === 'fixed') {
    // Wait for the completion callback to run, then independently assert rendered text.
    await page.waitForTimeout(300);
    await expect(editor).toContainText('second.json');
    await expect(editor).not.toContainText('first.json');
  } else await expect(editor).toContainText('first.json');
  const evidence = {
    checkedAt: new Date().toISOString(), repository: 'https://github.com/ritz078/transform',
    revision: 'ff7557939be351706f4dc6f71cc375e3bc64c225', mode,
    method: 'Real upstream app and file-loading UI. Only two JSON responses and their completion order are controlled by Playwright.',
    requestOrder: ['first.json', 'second.json'], responseOrder: ['second.json', 'first.json'],
    chosenFileVisible, finalVisibleEditor: await editor.innerText(),
    expectedFile: 'second.json', actualFile: mode === 'fixed' ? 'second.json' : 'first.json',
  };
  if (mode !== 'original') {
    evidence.webmcp = {};
    for (const name of ['inspect_requests', 'inspect_state']) {
      evidence.webmcp[name] = await page.evaluate(async name => {
        const tools = await document.modelContext.getTools();
        const tool = tools.find(t => t.name === name);
        if (!tool) throw new Error('Native WebMCP tool missing: ' + name);
        return JSON.parse(await document.modelContext.executeTool(tool, '{}'));
      }, name);
    }
    assert.match(evidence.webmcp.inspect_state.state.Editor1.value, mode === 'fixed' ? /second.json/ : /first.json/);
    assert.equal(evidence.webmcp.inspect_requests.events.filter(e => e.kind === 'response' && e.data.status === 200).length, 2);
  }
  await page.screenshot({ path: `docs/media/transform-${mode}.png` });
  writeFileSync(`docs/verification/transform-${mode}.json`, JSON.stringify(evidence, null, 2) + '\n');
  console.log(`${mode}: last selected second.json; visible ${evidence.actualFile}${evidence.webmcp ? '; native WebMCP verified' : ''}`);
  if (mode === 'instrumented') {
    const video = page.video();
    await context.close();
    await video.saveAs('docs/media/transform-reproduction.webm');
  }
} finally { await context.close(); await browser.close(); }

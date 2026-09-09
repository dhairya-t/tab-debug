import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromePath } from './browser.mjs';
const mode = process.env.NEXT_EXAMPLE_MODE || 'development';
const origin = process.env.NEXT_EXAMPLE_URL || 'http://localhost:3002';
const browser = await chromium.launch({
  executablePath: chromePath(),
  args: [
    '--enable-features=WebMCP',
    '--enable-blink-features=WebMCP,WebMCPTesting',
  ],
});
const evidence = { mode, origin, checks: [] };
let server;
let serverLog = '';
if (process.env.NEXT_EXAMPLE_MANAGED === '1') {
  server = spawn(
    process.execPath,
    [
      'node_modules/next/dist/bin/next',
      mode === 'production' ? 'start' : 'dev',
      '--port',
      '3002',
    ],
    {
      cwd: new URL('../examples/next-app', import.meta.url),
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  server.stdout.on('data', (data) => {
    serverLog = (serverLog + data).slice(-8000);
  });
  server.stderr.on('data', (data) => {
    serverLog = (serverLog + data).slice(-8000);
  });
}

try {
  if (server) {
    const deadline = Date.now() + 45000;
    while (true) {
      try {
        if ((await fetch(origin)).ok) break;
      } catch {}
      if (Date.now() > deadline || server.exitCode !== null)
        throw new Error('Example failed to start: ' + serverLog);
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  const page = await browser.newPage();
  await page.goto(origin);
  await page.getByRole('button', { name: 'Count: 0', exact: true }).waitFor();
  const names = () =>
    page.evaluate(async () =>
      (await document.modelContext.getTools()).map((t) => t.name),
    );
  const call = (name) =>
    page.evaluate(async (name) => {
      const tools = await document.modelContext.getTools();
      const tool = tools.find((t) => t.name === name);
      return JSON.parse(await document.modelContext.executeTool(tool, '{}'));
    }, name);
  if (mode === 'production') {
    assert.deepEqual(await names(), []);
    await page.getByRole('button', { name: 'Count: 0', exact: true }).click();
    await page.getByRole('button', { name: 'Count: 1', exact: true }).waitFor();
    evidence.checks.push(
      'default production integration registers no tools and leaves app interactive',
    );
  } else {
    await page.waitForFunction(
      async () => (await document.modelContext.getTools()).length === 5,
    );
    await page.waitForFunction(async () => {
      const t = (await document.modelContext.getTools()).find(
        (t) => t.name === 'inspect_state',
      );
      if (!t) return false;
      const state = JSON.parse(
        await document.modelContext.executeTool(t, '{}'),
      ).state;
      return state.Counter?.count === 0 && state.Home?.visible;
    });
    assert.equal((await call('inspect_state')).state.Home.visible, true);
    await page.getByRole('button', { name: 'Count: 0', exact: true }).click();
    await page.getByRole('button', { name: 'Count: 1', exact: true }).waitFor();
    await page.getByRole('link', { name: 'Other page', exact: true }).click();
    await page.waitForURL('**/other');
    await page.waitForFunction(async () => {
      const t = (await document.modelContext.getTools()).find(
        (t) => t.name === 'inspect_state',
      );
      return JSON.parse(await document.modelContext.executeTool(t, '{}')).state
        .Other?.visible;
    });
    const state = await call('inspect_state');
    assert.equal(state.route, '/other');
    assert.equal(state.state.Counter.count, 1);
    assert.equal(state.state.Home, undefined);
    assert.equal(state.state.Other.visible, true);
    assert.equal((await names()).length, 5);
    await page.getByRole('button', { name: 'Count: 1', exact: true }).waitFor();
    evidence.checks.push(
      'default development wrapper exposes five real WebMCP tools',
      'state hook exposes selected fields',
      'client navigation changes page context and removes old page state',
      'shared application state remains mounted across navigation',
    );
    evidence.stateAfterNavigation = state;
  }
  mkdirSync('docs/verification', { recursive: true });
  writeFileSync(
    `docs/verification/next-${mode}.json`,
    JSON.stringify(evidence, null, 2) + '\n',
  );
  console.log(JSON.stringify(evidence));
} finally {
  await browser.close();
  server?.kill('SIGTERM');
}

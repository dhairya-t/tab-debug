import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { stripVTControlCharacters } from 'node:util';
import { chromePath } from './browser.mjs';

const base = process.env.TEST_BASE_URL || 'http://localhost:3001';
const directory = resolve('test-results/exports');
mkdirSync(directory, { recursive: true });
const browser = await chromium.launch({ executablePath: chromePath() });
try {
  const page = await browser.newPage({ reducedMotion: 'reduce' });
  await page.goto(new URL('/replay', base).href);
  await page.waitForFunction(() => !!window.__PAGESCOPE_REPLAY__);
  await page
    .getByRole('button', { name: 'Capture & compare', exact: true })
    .click();
  await page
    .getByTestId('preview-patched')
    .locator('.result-badge')
    .filter({ hasText: 'PASS' })
    .waitFor();
  let downloaded = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Save incident', exact: true })
    .click();
  await (await downloaded).saveAs(resolve(directory, 'incident.json'));
  downloaded = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Export regression test', exact: true })
    .click();
  await (await downloaded).saveAs(resolve(directory, 'exported.spec.ts'));
} finally {
  await browser.close();
}

const config = resolve(directory, 'playwright.config.mjs');
writeFileSync(
  config,
  `export default ${JSON.stringify({ testDir: directory, outputDir: resolve('test-results/export-browser'), testMatch: 'exported.spec.ts', timeout: 20000, workers: 1, retries: 0, reporter: 'json', use: { launchOptions: { executablePath: chromePath() } } })};\n`,
);
async function execute(url) {
  const child = spawn(
    process.execPath,
    ['node_modules/@playwright/test/cli.js', 'test', '--config', config],
    {
      env: { ...process.env, PAGESCOPE_BASE_URL: url },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (data) => {
    stdout += data;
  });
  child.stderr.on('data', (data) => {
    stderr += data;
  });
  const code = await new Promise((yes, no) => {
    child.on('error', no);
    child.on('exit', yes);
  });
  try {
    return { code, report: JSON.parse(stdout) };
  } catch {
    throw new Error(stderr || stdout);
  }
}
const original = await execute(new URL('/replay', base).href);
assert.ok(
  original.report.suites.length,
  JSON.stringify(original.report.errors),
);
const failure = original.report.suites[0].specs[0].tests[0].results[0];
assert.equal(original.code, 1);
assert.equal(failure.status, 'failed');
const message = stripVTControlCharacters(failure.error.message);
assert.match(message, /toEqual/);
assert.match(message, /namibia/);
assert.match(message, /lena/);
const patched = await execute(new URL('/replay?implementation=patched', base).href);
assert.equal(patched.code, 0);
assert.equal(patched.report.stats.expected, 1);
assert.equal(patched.report.stats.unexpected, 0);
mkdirSync('docs/verification', { recursive: true });
writeFileSync(
  'docs/verification/exported-regression.json',
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      baseUrl: base,
      method:
        'Downloaded the generated test from the UI; ran the exact same file in two fresh browser processes.',
      original: {
        exitCode: original.code,
        status: failure.status,
        assertion: 'Expected lena, received namibia',
      },
      patched: {
        exitCode: patched.code,
        testsPassed: patched.report.stats.expected,
      },
      testFile: 'test-results/exports/exported.spec.ts',
      incident: JSON.parse(
        readFileSync(resolve(directory, 'incident.json'), 'utf8'),
      ),
    },
    null,
    2,
  ) + '\n',
);
console.log(
  'Exported regression verified: original FAILS on the state assertion; the identical test PASSES on the patched app.',
);

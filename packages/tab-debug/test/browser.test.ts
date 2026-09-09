import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PageScope } from '../src/core.ts';
import { attachBrowserTools } from '../src/browser.ts';
import type { ModelContext } from '../src/webmcp.ts';

function fixture(fetcher: typeof fetch, context?: ModelContext) {
  const host = Object.assign(new EventTarget(), {
    fetch: fetcher,
    document: { modelContext: context },
  }) as unknown as Window;
  const scope = new PageScope();
  scope.enterPage('/checkout');
  return { host, scope };
}
test('automatic capture preserves Request, init, body and Response identity without retaining private data', async () => {
  const request = new Request(
    'https://example.test/api/quote?token=secret-value',
    { method: 'POST', body: 'private-body' },
  );
  const init = { headers: { Authorization: 'Bearer private-value' } };
  const response = Response.json({ private: 'response-body' });
  let calls = 0;
  const { host, scope } = fixture(async (input, options) => {
    calls++;
    assert.equal(input, request);
    assert.equal(options, init);
    assert.equal(await (input as Request).text(), 'private-body');
    return response;
  });
  const original = host.fetch;
  const connection = attachBrowserTools(scope, host);
  assert.equal(await connection.ready, false);
  assert.equal(await host.fetch(request, init), response);
  assert.equal(calls, 1);
  const events = scope.snapshot().events;
  assert.equal(events.filter((e) => e.kind === 'request').length, 1);
  assert.equal(
    events.find((e) => e.kind === 'request')?.label,
    'POST /api/quote',
  );
  assert.doesNotMatch(
    JSON.stringify(events),
    /private|secret-value|response-body|token=/,
  );
  connection.dispose();
  assert.equal(host.fetch, original);
});
test('cleanup removes tools and error listeners, invalidates pending writes, and allows remount', async () => {
  let finish!: (r: Response) => void;
  const signals: AbortSignal[] = [];
  const names: string[] = [];
  const { host, scope } = fixture(
    () =>
      new Promise((r) => {
        finish = r;
      }),
    {
      registerTool(tool, { signal }) {
        names.push(tool.name);
        signals.push(signal);
      },
    },
  );
  const connection = attachBrowserTools(scope, host);
  assert.equal(await connection.ready, true);
  assert.equal(names.length, 5);
  assert.throws(() => attachBrowserTools(scope, host), /only one TabDebug/);
  const errorEvent = Object.assign(new Event('error'), {
    error: new Error('render failed'),
  });
  host.dispatchEvent(errorEvent);
  assert.equal(scope.snapshot().events.at(-1)?.label, 'render failed');
  const pending = host.fetch('/slow');
  connection.dispose();
  assert.ok(signals.every((s) => s.aborted));
  finish(new Response('done'));
  await pending;
  host.dispatchEvent(errorEvent);
  assert.deepEqual(
    scope.snapshot().events.map((e) => e.kind),
    ['navigation'],
  );
  const second = attachBrowserTools(scope, host);
  await second.ready;
  second.dispose();
});
test('fetch failures preserve the original exception and later wrappers survive cleanup', async () => {
  const error = new TypeError('network offline');
  const { host, scope } = fixture(async () => {
    throw error;
  });
  const connection = attachBrowserTools(scope, host);
  await assert.rejects(host.fetch('/api/search'), (e) => e === error);
  assert.equal(scope.snapshot().events.at(-1)?.label, 'network offline');
  const captured = host.fetch;
  const later: typeof fetch = (...args) => captured(...args);
  host.fetch = later;
  connection.dispose();
  assert.equal(host.fetch, later);
  await assert.rejects(host.fetch('/after'), (e) => e === error);
  assert.deepEqual(
    scope.snapshot().events.map((e) => e.kind),
    ['navigation'],
  );
});
test('a partial WebMCP registration failure aborts the already registered tools', async () => {
  let registered: AbortSignal | undefined;
  let count = 0;
  const { host, scope } = fixture(async () => new Response(), {
    registerTool(_, { signal }) {
      registered = signal;
      if (++count === 2) throw new Error('registration denied');
    },
  });
  const connection = attachBrowserTools(scope, host);
  assert.equal(await connection.ready, false);
  assert.equal(registered?.aborted, true);
  connection.dispose();
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { PageScope, sanitize, toolNames } from '../src/core.ts';
import { registerPageTools, type ModelContext } from '../src/webmcp.ts';
test('sensitive keys and nested values are redacted before retention', () => {
  const scope = new PageScope();
  scope.enterPage('/archive?token=secret');
  scope.setState('session', {
    email: 'me@example.com',
    nested: { apiKey: 'private', label: 'Bearer abc' },
  });
  const text = JSON.stringify(scope.snapshot());
  assert.ok(!text.includes('me@example'));
  assert.ok(!text.includes('private'));
  assert.ok(!text.includes('Bearer abc'));
  assert.equal(scope.snapshot().route, '/archive');
});
test('circular values, oversized payloads, arrays, and depth are bounded', () => {
  const circular: { self?: unknown } = {};
  circular.self = circular;
  assert.deepEqual(
    sanitize(circular),
    Object.assign(Object.create(null), { self: '[circular]' }),
  );
  assert.equal((sanitize(Array(100).fill(1)) as unknown[]).length, 24);
  const scope = new PageScope();
  scope.setState(
    'large',
    Object.fromEntries(
      Array.from({ length: 24 }, (_, i) => [String(i), 'a'.repeat(700)]),
    ),
  );
  assert.deepEqual(scope.snapshot().state.large, {
    truncated: true,
    reason: '8KB record budget',
  });
});
test('ring buffer evicts oldest events and preserves monotonic sequence IDs', () => {
  const scope = new PageScope({ capacity: 4 });
  for (let i = 0; i < 12; i++) scope.record('action', String(i));
  assert.deepEqual(
    scope.snapshot().events.map((e) => e.seq),
    [9, 10, 11, 12],
  );
  assert.equal(scope.snapshot().dropped, 8);
});
test('snapshots cannot mutate retained state', () => {
  const scope = new PageScope();
  scope.setState('component', { value: 1 });
  const snapshot = scope.snapshot();
  (snapshot.state.component as { value: number }).value = 9;
  snapshot.events[0].label = 'changed';
  assert.deepEqual(scope.snapshot().state.component, { value: 1 });
  assert.notEqual(scope.snapshot().events[0].label, 'changed');
});
test('navigation isolates late requests and resets state', async () => {
  const scope = new PageScope();
  scope.enterPage('/first');
  scope.setState('OldPage', { value: true });
  let finish!: (value: Response) => void;
  const request = scope.fetch(
    '/api/first?token=secret',
    undefined,
    (() =>
      new Promise((resolve) => {
        finish = resolve;
      })) as typeof fetch,
  );
  scope.enterPage('/second');
  const id = scope.snapshot().pageId;
  finish(new Response('{}'));
  await request;
  const snapshot = scope.snapshot();
  assert.equal(snapshot.pageId, id);
  assert.equal(snapshot.events.length, 1);
  assert.deepEqual(snapshot.state, {});
  assert.equal(snapshot.route, '/second');
});
test('requests capture status and correlation, never headers or query values', async () => {
  const scope = new PageScope();
  await scope.fetch(
    '/api/item?token=secret',
    { headers: { Authorization: 'secret' } },
    (async () => new Response('{}', { status: 503 })) as typeof fetch,
  );
  const snapshot = scope.snapshot();
  assert.equal(snapshot.events[1].kind, 'response');
  assert.equal(
    (snapshot.events[1].data as { requestId: number }).requestId,
    snapshot.events[0].seq,
  );
  assert.equal(snapshot.events[2].kind, 'error');
  assert.ok(!JSON.stringify(snapshot).includes('secret'));
});
test('tool validation rejects malformed and unknown inputs without state changes', () => {
  const scope = new PageScope();
  scope.enterPage('/');
  const before = scope.getVersion();
  for (const input of [
    null,
    [],
    { limit: 0 },
    { limit: 51 },
    { limit: 1.5 },
    { extra: true },
  ])
    assert.throws(() => scope.callTool('inspect_timeline', input));
  assert.throws(() => scope.callTool('delete_everything', {}));
  assert.equal(scope.getVersion(), before);
  for (const tool of toolNames) assert.ok(scope.callTool(tool, {}));
  assert.equal(scope.getVersion(), before);
});
test('native registration is read-only, schema bounded, and disposed callbacks reject', async () => {
  const scope = new PageScope();
  const registered: Parameters<ModelContext['registerTool']>[0][] = [];
  const signals: AbortSignal[] = [];
  const context: ModelContext = {
    registerTool(tool, options) {
      registered.push(tool);
      signals.push(options.signal);
    },
  };
  const controller = new AbortController();
  assert.equal(
    await registerPageTools(scope, context, controller.signal),
    true,
  );
  assert.equal(registered.length, 5);
  assert.ok(registered.every((t) => t.annotations.readOnlyHint));
  assert.equal(JSON.parse(String(registered[0].execute({}))).route, '/');
  controller.abort();
  assert.ok(signals.every((s) => s.aborted));
  assert.throws(() => registered[0].execute({}), /disposed/);
  assert.equal(
    await registerPageTools(scope, undefined, new AbortController().signal),
    false,
  );
});

test('unchanged state does not emit self-triggering subscription updates', () => {
  const scope = new PageScope(); let notifications = 0;
  const unsubscribe = scope.subscribe(() => notifications++);
  scope.setState('Search', { query: 'lena' });
  scope.setState('Search', { query: 'lena' });
  assert.equal(notifications, 1);
  unsubscribe(); scope.setState('Search', { query: 'namibia' });
  assert.equal(notifications, 1);
});
test('state source names and count have explicit limits', () => {
  const scope = new PageScope();
  assert.throws(() => scope.setState('', {}));
  assert.throws(() => scope.setState('x'.repeat(81), {}));
  for (let i = 0; i < 24; i++) scope.setState('source' + i, { value: i });
  assert.throws(() => scope.setState('overflow', {}));
  scope.setState('source0', { value: 100 });
  assert.equal(Object.keys(scope.snapshot().state).length, 24);
});

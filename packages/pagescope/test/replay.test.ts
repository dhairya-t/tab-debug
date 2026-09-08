import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CompletionGate,
  createIncident,
  generatePlaywright,
  parseIncident,
  permutations,
  readPath,
  replay,
  stateDiff,
  type Json,
} from '../src/replay.ts';
import {
  createArchiveModel,
  createShippingModel,
} from '../../../lib/lab/models.ts';

export const recording = createIncident({
  appId: 'atlas.search.v1',
  route: '/',
  operations: ['namibia', 'atlantic', 'lena'].map((query, i) => ({
    id: `Q${i + 1}`,
    label: query,
    input: { query },
    output: { query, ids: [query] },
    transportMs: 10 + i,
  })),
  order: ['Q3', 'Q2', 'Q1'],
  rule: {
    label: 'Latest intent wins',
    actual: ['appliedQuery'],
    expected: ['query'],
  },
});
test('completion gate releases the requested order regardless of source readiness', async () => {
  const gate = new CompletionGate<string>();
  const seen: string[] = [];
  let readyA!: (value: string) => void;
  const a = gate
    .hold(
      'A',
      () =>
        new Promise((resolve) => {
          readyA = resolve;
        }),
    )
    .then((value) => {
      seen.push(value);
    });
  const b = gate
    .hold('B', async () => 'B')
    .then((value) => {
      seen.push(value);
    });
  await gate.release('B');
  await b;
  assert.deepEqual(seen, ['B']);
  readyA('A');
  await gate.release('A');
  await a;
  assert.deepEqual(seen, ['B', 'A']);
  await assert.rejects(gate.release('B'), /released/);
});
test('gate cancellation rejects consumers even while release waits for transport', async () => {
  const gate = new CompletionGate<string>();
  let done!: (value: string) => void;
  const result = gate.hold(
    'A',
    () =>
      new Promise((resolve) => {
        done = resolve;
      }),
  );
  const release = gate.release('A');
  await Promise.resolve();
  gate.cancel();
  await assert.rejects(result, /cancelled/);
  done('late');
  await assert.rejects(release, /cancelled/);
});
test('transport errors propagate to the application consumer', async () => {
  const gate = new CompletionGate<Json>();
  const result = gate.hold('A', async () => {
    throw new Error('offline');
  });
  await gate.release('A');
  await assert.rejects(result, /offline/);
});
test('real archive handler regresses after correct state; patch rejects stale commits', async () => {
  const before = await replay(recording, createArchiveModel('original'));
  const after = await replay(recording, createArchiveModel('patched'));
  assert.equal(before.passed, false);
  assert.equal(before.actual, 'namibia');
  assert.equal(before.expected, 'lena');
  assert.equal(after.passed, true);
  assert.equal((after.finalState as any).discarded, 2);
  assert.deepEqual(before.deliveredOrder, ['Q3', 'Q2', 'Q1']);
  assert.equal(readPath(before.checkpoints[1].state, ['appliedQuery']), 'lena');
  assert.ok(
    before.checkpoints[2].changes.some(
      (change) =>
        change.path === 'appliedQuery' &&
        change.before === 'lena' &&
        change.after === 'atlantic',
    ),
  );
});
test('all six permutations expose four failing archive schedules and zero patched failures', async () => {
  let failures = 0;
  for (const order of permutations(['Q1', 'Q2', 'Q3'])) {
    const incident = parseIncident({ ...recording, order });
    if (!(await replay(incident, createArchiveModel('original'))).passed)
      failures++;
    assert.equal(
      (await replay(incident, createArchiveModel('patched'))).passed,
      true,
    );
  }
  assert.equal(failures, 4);
});
test('a separate checkout handler uses the same generic gate, recording and assertion', async () => {
  const countries = ['Canada', 'Japan', 'France'];
  const incident = createIncident({
    appId: 'checkout.shipping.v1',
    route: '/shipping',
    operations: countries.map((destination, i) => ({
      id: `Q${i + 1}`,
      label: destination,
      input: { destination },
      output: { destination, cents: 800 + 800 * i, days: 3 + i },
      transportMs: 1,
    })),
    order: ['Q3', 'Q1', 'Q2'],
    rule: {
      label: 'Current destination quote',
      actual: ['quotedDestination'],
      expected: ['destination'],
    },
  });
  assert.equal(
    (await replay(incident, createShippingModel('original'))).actual,
    'Japan',
  );
  assert.equal(
    (await replay(incident, createShippingModel('patched'))).passed,
    true,
  );
});
test('import rejects malformed, oversized, unsafe and incomplete recordings', () => {
  assert.throws(() => parseIncident('{bad'), /malformed/);
  assert.throws(() => parseIncident(' '.repeat(200001)), /200KB/);
  for (const patch of [
    { order: ['Q1', 'Q1', 'Q2'] },
    { route: '//evil.test' },
    { appId: 'x<script>' },
    { rule: { label: 'oops', actual: ['__proto__'], expected: ['query'] } },
    { extra: true },
  ])
    assert.throws(() => parseIncident({ ...recording, ...patch }));
  const polluted = JSON.stringify(recording).replace(
    '"input":{"query":"namibia"}',
    '"input":{"__proto__":{"polluted":true}}',
  );
  assert.throws(() => parseIncident(polluted), /unsafe/);
  assert.equal(({} as any).polluted, undefined);
});
test('capture redacts explicitly projected sensitive values without retaining raw input', () => {
  const input = structuredClone(recording);
  (input.operations[0].input as any).token = 'supersecret';
  const { format: _, createdAt: __, ...draft } = input;
  const safe = createIncident(draft);
  assert.equal((safe.operations[0].input as any).token, '[redacted]');
  assert.equal(JSON.stringify(safe).includes('supersecret'), false);
});
test('snapshots and callback mutations cannot corrupt replay evidence or input', async () => {
  const before = JSON.stringify(recording);
  const result = await replay(recording, createArchiveModel('patched'), {
    onCheckpoint: (frame) => {
      (frame.state as any).query = 'corrupted';
    },
  });
  assert.equal(result.expected, 'lena');
  assert.equal(JSON.stringify(recording), before);
  (result.checkpoints[0].state as any).query = 'changed';
  assert.equal(readPath(result.finalState, ['query']), 'lena');
});
test('missing assertion paths never produce a false pass', async () => {
  const incident = parseIncident({
    ...recording,
    rule: { ...recording.rule, actual: ['missing'], expected: ['missingToo'] },
  });
  assert.equal(
    (await replay(incident, createArchiveModel('original'))).passed,
    false,
  );
});
test('semantic equality ignores object key order and bounds application snapshots', async () => {
  const adapter = {
    snapshot: () => ({ appliedQuery: { a: 1, b: 2 }, query: { b: 2, a: 1 } }),
    dispatch: async (_: unknown, response: Promise<Json>) => {
      await response;
    },
  };
  assert.equal((await replay(recording, adapter)).passed, true);
  await assert.rejects(
    replay(recording, {
      ...adapter,
      snapshot: () => ({ data: 'a'.repeat(2001) }),
    }),
    /bounded JSON/,
  );
});
test('aborted replay and throwing application handlers reject instead of reporting success', async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    replay(recording, createArchiveModel('original'), {
      signal: controller.signal,
    }),
    /cancelled/,
  );
  await assert.rejects(
    replay(recording, {
      snapshot: () => ({}),
      dispatch: async (_, response) => {
        await response;
        throw new Error('app failure');
      },
    }),
    /app failure/,
  );
});
test('state diffs include removals and replacements; generated test compares raw application state', () => {
  assert.deepEqual(stateDiff({ a: 1, b: 2 }, { a: 2 }), [
    { path: 'a', before: 1, after: 2 },
    { path: 'b', before: 2, after: undefined },
  ]);
  const script = generatePlaywright(recording);
  assert.match(script, /result.finalState/);
  assert.match(
    script,
    /expect\(actual, incident.rule.label\).toEqual\(expected\)/,
  );
  assert.doesNotMatch(script, /expect\(result.passed\)/);
});

import { sanitize } from './core.ts';

export type Json =
  | null
  | boolean
  | number
  | string
  | Json[]
  | { [key: string]: Json };
export type Operation = {
  id: string;
  label: string;
  input: Json;
  output: Json;
  transportMs: number;
};
export type StateRule = { label: string; actual: string[]; expected: string[] };
export type Incident = {
  format: 'pagescope.incident.v1';
  appId: string;
  route: string;
  createdAt: string;
  operations: Operation[];
  order: string[];
  rule: StateRule;
};
export type Checkpoint = {
  step: string;
  state: Json;
  changes: {
    path: string;
    before: Json | undefined;
    after: Json | undefined;
  }[];
};
export type ReplayResult = {
  checkpoints: Checkpoint[];
  finalState: Json;
  deliveredOrder: string[];
  passed: boolean;
  actual: Json | undefined;
  expected: Json | undefined;
};
const forbidden = new Set(['__proto__', 'constructor', 'prototype']);
const bytes = (value: unknown) =>
  new TextEncoder().encode(JSON.stringify(value)).length;
const clone = <T>(value: T): T => structuredClone(value);
function fail(message: string): never {
  throw new Error(`Invalid incident: ${message}`);
}
function exact(
  value: unknown,
  keys: string[],
): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    fail('expected an object');
  if (Object.keys(value).some((key) => !keys.includes(key)))
    fail('unknown property');
  if (keys.some((key) => !Object.hasOwn(value, key))) fail('missing property');
}
function boundedText(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= max;
}
function json(value: unknown, depth = 0): void {
  if (depth > 8) fail('data exceeds 8 levels');
  if (value === null || typeof value === 'boolean') return;
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (typeof value === 'string' && value.length <= 2000) return;
  if (Array.isArray(value) && value.length <= 64) {
    value.forEach((v) => json(v, depth + 1));
    return;
  }
  if (
    value &&
    typeof value === 'object' &&
    [Object.prototype, null].includes(Object.getPrototypeOf(value)) &&
    Object.keys(value).length <= 64
  ) {
    for (const [key, item] of Object.entries(value)) {
      if (forbidden.has(key) || key.length > 80) fail('unsafe data key');
      json(item, depth + 1);
    }
    return;
  }
  fail('data must be bounded JSON');
}
/** Validates untrusted recordings. No executable code, selectors, URLs to fetch, or headers. */
export function parseIncident(input: string | unknown): Incident {
  if (
    typeof input === 'string' &&
    new TextEncoder().encode(input).length > 200_000
  )
    fail('200KB file limit');
  let value: unknown;
  try {
    value = typeof input === 'string' ? JSON.parse(input) : clone(input);
  } catch {
    return fail('malformed JSON');
  }
  if (bytes(value) > 200_000) fail('200KB file limit');
  exact(value, [
    'format',
    'appId',
    'route',
    'createdAt',
    'operations',
    'order',
    'rule',
  ]);
  if (value.format !== 'pagescope.incident.v1') fail('unsupported format');
  if (!boundedText(value.appId, 80) || !/^[a-z0-9.-]+$/.test(value.appId))
    fail('app ID');
  if (
    !boundedText(value.route, 160) ||
    !/^\/(?!\/)[a-zA-Z0-9/_-]*$/.test(value.route)
  )
    fail('route must be a local path');
  if (
    !boundedText(value.createdAt, 40) ||
    !Number.isFinite(Date.parse(value.createdAt))
  )
    fail('creation time');
  if (
    !Array.isArray(value.operations) ||
    value.operations.length < 2 ||
    value.operations.length > 6
  )
    fail('expected 2–6 operations');
  const ids = new Set<string>();
  for (const op of value.operations) {
    exact(op, ['id', 'label', 'input', 'output', 'transportMs']);
    if (
      !boundedText(op.id, 24) ||
      !/^[a-zA-Z0-9_-]+$/.test(op.id) ||
      ids.has(op.id)
    )
      fail('unique operation IDs required');
    ids.add(op.id);
    if (!boundedText(op.label, 120)) fail('operation label');
    if (
      typeof op.transportMs !== 'number' ||
      !Number.isFinite(op.transportMs) ||
      op.transportMs < 0 ||
      op.transportMs > 120_000
    )
      fail('transport time');
    json(op.input);
    json(op.output);
  }
  if (
    !Array.isArray(value.order) ||
    value.order.length !== ids.size ||
    new Set(value.order).size !== ids.size ||
    value.order.some((id) => !ids.has(id))
  )
    fail('order must be an exact permutation');
  exact(value.rule, ['label', 'actual', 'expected']);
  if (!boundedText(value.rule.label, 160)) fail('rule label');
  for (const path of [value.rule.actual, value.rule.expected]) {
    if (
      !Array.isArray(path) ||
      !path.length ||
      path.length > 6 ||
      path.some((p) => !boundedText(p, 80) || forbidden.has(p))
    )
      fail('rule path');
  }
  return value as unknown as Incident;
}
/** Explicitly supplied fixture projections are redacted before retention. */
export function createIncident(
  input: Omit<Incident, 'format' | 'createdAt'>,
): Incident {
  return parseIncident({
    ...input,
    operations: input.operations.map((op) => ({
      ...op,
      label: sanitize(op.label),
      input: sanitize(op.input),
      output: sanitize(op.output),
    })),
    format: 'pagescope.incident.v1',
    createdAt: new Date().toISOString(),
  });
}

/** Separates completion order from transport latency. Never races wall-clock timers. */
export class CompletionGate<T> {
  #slots = new Map<
    string,
    {
      prepared: Promise<void>;
      value?: T;
      error?: unknown;
      failed: boolean;
      released: boolean;
      resolve: (value: T) => void;
      reject: (error: unknown) => void;
    }
  >();
  #closed = false;
  hold(id: string, source: () => Promise<T>): Promise<T> {
    if (this.#closed || this.#slots.has(id) || this.#slots.size >= 6)
      throw new Error('Gate is closed, duplicate, or full');
    let resolve!: (value: T) => void;
    let reject!: (error: unknown) => void;
    const result = new Promise<T>((yes, no) => {
      resolve = yes;
      reject = no;
    });
    // A caller may attach its consumer after starting a batch; keep cancellation handled meanwhile.
    void result.catch(() => {});
    const slot = {
      prepared: Promise.resolve(),
      failed: false,
      released: false,
      resolve,
      reject,
    } as {
      prepared: Promise<void>;
      value?: T;
      error?: unknown;
      failed: boolean;
      released: boolean;
      resolve: (value: T) => void;
      reject: (error: unknown) => void;
    };
    slot.prepared = Promise.resolve()
      .then(source)
      .then(
        (value) => {
          slot.value = value;
        },
        (error) => {
          slot.failed = true;
          slot.error = error;
        },
      );
    this.#slots.set(id, slot);
    return result;
  }
  async release(id: string): Promise<void> {
    const slot = this.#slots.get(id);
    if (this.#closed || !slot || slot.released)
      throw new Error('Unknown, released, or cancelled completion');
    slot.released = true;
    await slot.prepared;
    if (this.#closed) throw new Error('Replay cancelled');
    if (slot.failed) slot.reject(slot.error);
    else slot.resolve(slot.value as T);
  }
  cancel(reason: unknown = new Error('Replay cancelled')) {
    this.#closed = true;
    for (const slot of this.#slots.values()) slot.reject(reason);
  }
}

export function readPath(state: Json, path: string[]): Json | undefined {
  let value: Json | undefined = state;
  for (const key of path) {
    if (
      forbidden.has(key) ||
      value === null ||
      typeof value !== 'object' ||
      !Object.hasOwn(value, key)
    )
      return undefined;
    value = (value as Record<string, Json>)[key];
  }
  return value;
}
function canonical(value: Json): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
    .join(',')}}`;
}
export function stateDiff(
  before: Json,
  after: Json,
  prefix = '',
): Checkpoint['changes'] {
  if (canonical(before) === canonical(after)) return [];
  if (
    before &&
    after &&
    typeof before === 'object' &&
    typeof after === 'object' &&
    !Array.isArray(before) &&
    !Array.isArray(after)
  ) {
    return [...new Set([...Object.keys(before), ...Object.keys(after)])]
      .flatMap((key) => {
        const path = prefix ? `${prefix}.${key}` : key;
        if (!Object.hasOwn(before, key) || !Object.hasOwn(after, key))
          return [{ path, before: before[key], after: after[key] }];
        return stateDiff(before[key], after[key], path);
      })
      .slice(0, 64);
  }
  return [{ path: prefix || '$', before: clone(before), after: clone(after) }];
}
export type ReplayAdapter = {
  /** Must start an application operation and return when its business-state update settles. */
  dispatch: (operation: Operation, completion: Promise<Json>) => Promise<void>;
  snapshot: () => Json;
};
/** Runs the actual adapter's async handlers. Checkpoints follow settled handlers, not guesses about timing. */
export async function replay(
  raw: Incident,
  adapter: ReplayAdapter,
  options: {
    onCheckpoint?: (frame: Checkpoint) => void | Promise<void>;
    signal?: AbortSignal;
  } = {},
): Promise<ReplayResult> {
  const incident = parseIncident(raw);
  const gate = new CompletionGate<Json>();
  const tasks = new Map<string, Promise<void>>();
  const frames: Checkpoint[] = [];
  const abort = () => gate.cancel(new Error('Replay cancelled'));
  options.signal?.addEventListener('abort', abort, { once: true });
  if (options.signal?.aborted) {
    abort();
    throw new Error('Replay cancelled');
  }
  const checkpoint = async (step: string) => {
    const state = clone(adapter.snapshot());
    json(state);
    if (bytes(state) > 32_000)
      throw new Error('Replay state exceeds the 32KB checkpoint budget');
    const frame = {
      step,
      state,
      changes: frames.length ? stateDiff(frames.at(-1)!.state, state) : [],
    };
    frames.push(frame);
    await options.onCheckpoint?.(clone(frame));
  };
  try {
    for (const op of incident.operations) {
      const task = Promise.resolve(
        adapter.dispatch(
          clone(op),
          gate.hold(op.id, async () => clone(op.output)),
        ),
      );
      void task.catch(() => {});
      tasks.set(op.id, task);
    }
    await checkpoint('intent');
    for (const id of incident.order) {
      if (options.signal?.aborted) throw new Error('Replay cancelled');
      await gate.release(id);
      await tasks.get(id);
      await checkpoint(id);
    }
    const finalState = clone(adapter.snapshot());
    json(finalState);
    if (bytes(finalState) > 32_000)
      throw new Error('Replay state exceeds the 32KB checkpoint budget');
    const actual = readPath(finalState, incident.rule.actual);
    const expected = readPath(finalState, incident.rule.expected);
    return {
      checkpoints: frames,
      finalState,
      deliveredOrder: [...incident.order],
      passed:
        actual !== undefined &&
        expected !== undefined &&
        canonical(actual) === canonical(expected),
      actual,
      expected,
    };
  } finally {
    gate.cancel();
    options.signal?.removeEventListener('abort', abort);
  }
}
export function permutations(ids: string[]): string[][] {
  if (ids.length > 6 || new Set(ids).size !== ids.length)
    throw new Error('Expected up to 6 unique IDs');
  if (!ids.length) return [[]];
  return ids.flatMap((id, index) =>
    permutations(ids.filter((_, i) => i !== index)).map((rest) => [
      id,
      ...rest,
    ]),
  );
}

export type ReplayTarget = {
  appId: string;
  replay: (incident: Incident) => Promise<ReplayResult>;
};
declare global {
  interface Window {
    __PAGESCOPE_REPLAY__?: ReplayTarget;
  }
}
/** Optional development/test bridge. Installing it is explicit; the core SDK never creates browser globals. */
export function installReplayTarget(target: ReplayTarget): () => void {
  if (typeof window === 'undefined') return () => {};
  if (window.__PAGESCOPE_REPLAY__)
    throw new Error('A replay target is already installed');
  const bridge: ReplayTarget = {
    appId: target.appId,
    replay: async (input) => {
      const incident = parseIncident(input);
      if (incident.appId !== target.appId)
        throw new Error('Recording belongs to a different app');
      return target.replay(incident);
    },
  };
  window.__PAGESCOPE_REPLAY__ = bridge;
  return () => {
    if (window.__PAGESCOPE_REPLAY__ === bridge)
      delete window.__PAGESCOPE_REPLAY__;
  };
}

/** Generates an independent assertion over returned state. The original bug must FAIL this test. */
export function generatePlaywright(raw: Incident): string {
  const incident = parseIncident(raw);
  return `// Generated by PageScope. Recorded responses are data, never executable code.
// Set PAGESCOPE_BASE_URL to your app with the replay adapter installed.
// On this demo, /?implementation=patched exercises the documented patch.
import { test, expect } from '@playwright/test';
const incident = ${JSON.stringify(incident, null, 2)};
test(${JSON.stringify(incident.rule.label)}, async ({ page }) => {
  const target = process.env.PAGESCOPE_BASE_URL || 'http://localhost:3001${incident.route}';
  await page.goto(target);
  await page.waitForFunction(() => !!(window as any).__PAGESCOPE_REPLAY__);
  const result = await page.evaluate(async recording => {
    const adapter = (window as any).__PAGESCOPE_REPLAY__;
    if (adapter.appId !== recording.appId) throw new Error('Wrong replay target');
    return await adapter.replay(recording);
  }, incident);
  expect(result.deliveredOrder).toEqual(incident.order);
  const at = (path: string[]) => path.reduce((value, key) => value?.[key], result.finalState);
  const actual = at(incident.rule.actual);
  const expected = at(incident.rule.expected);
  expect(actual, 'The registered state field must exist').not.toBeUndefined();
  expect(expected, 'The expected state field must exist').not.toBeUndefined();
  expect(actual, incident.rule.label).toEqual(expected);
});
`;
}

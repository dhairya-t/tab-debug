/** Page-local, opt-in diagnostic state. No transport, cookies, bodies, or global patches. */
export type EventKind = 'navigation' | 'action' | 'request' | 'response' | 'state' | 'error' | 'discard';
export type TraceEvent = { seq: number; time: number; kind: EventKind; label: string; data: unknown };
export type Snapshot = { version: number; pageId: string; route: string; events: TraceEvent[]; state: Record<string, unknown>; dropped: number };
export const toolNames = ['get_page_context', 'inspect_requests', 'inspect_errors', 'inspect_state', 'inspect_timeline'] as const;
export type ToolName = typeof toolNames[number];
const sensitive = /password|secret|token|authorization|cookie|email|phone|api.?key/i;
export function sanitize(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (depth > 5) return '[depth limit]';
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value);
  if (typeof value === 'string') return value.replace(/Bearer\s+\S+/gi, 'Bearer [redacted]').replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '[email]').slice(0, 700);
  if (typeof value !== 'object') return String(value);
  if (seen.has(value)) return '[circular]';
  seen.add(value);
  if (Array.isArray(value)) return value.slice(0, 24).map(v => sanitize(v, depth + 1, seen));
  const out: Record<string, unknown> = Object.create(null);
  for (const [key, item] of Object.entries(value).slice(0, 24)) out[key.slice(0, 80)] = sensitive.test(key) ? '[redacted]' : sanitize(item, depth + 1, seen);
  return out;
}
function bounded(value: unknown): unknown {
  const clean = sanitize(value);
  return JSON.stringify(clean).length > 8000 ? { truncated: true, reason: '8KB record budget' } : clean;
}
function pathOnly(url: string): string {
  try { return new URL(url, 'http://pagescope.invalid').pathname.slice(0, 240); } catch { return '[invalid URL]'; }
}
export class PageScope {
  #events: TraceEvent[] = [];
  #state: Record<string, unknown> = Object.create(null);
  #listeners = new Set<() => void>();
  #seq = 0;
  #version = 0;
  #generation = 0;
  #route = '/';
  #pageId = '';
  #dropped = 0;
  readonly capacity: number;
  constructor(options: { capacity?: number } = {}) {
    const capacity = options.capacity ?? 120;
    if (!Number.isInteger(capacity) || capacity < 4 || capacity > 1000) throw new Error('Capacity must be an integer from 4 to 1000');
    this.capacity = capacity;
  }
  subscribe = (listener: () => void) => { this.#listeners.add(listener); return () => { this.#listeners.delete(listener); }; };
  getVersion = () => this.#version;
  #notify() { this.#version++; for (const listener of this.#listeners) listener(); }
  enterPage(route: string) {
    this.#generation++; this.#events = []; this.#state = Object.create(null); this.#seq = 0; this.#dropped = 0;
    this.#route = pathOnly(route); this.#pageId = crypto.randomUUID();
    this.record('navigation', 'Page context created', { route: this.#route });
  }
  record(kind: EventKind, label: string, data: unknown = {}) {
    const event: TraceEvent = { seq: ++this.#seq, time: Date.now(), kind, label: String(sanitize(label)).slice(0, 160), data: bounded(data) };
    if (this.#events.length >= this.capacity) { this.#events.shift(); this.#dropped++; }
    this.#events.push(event); this.#notify(); return event.seq;
  }
  setState(name: string, state: unknown) {
    if (!Object.hasOwn(this.#state, name) && Object.keys(this.#state).length >= 24) throw new Error('Maximum 24 state sources per page');
    this.#state[name.slice(0, 80)] = sensitive.test(name) ? '[redacted]' : bounded(state);
    this.record('state', name, this.#state[name.slice(0, 80)]);
  }
  removeState(name: string) { delete this.#state[name]; this.#notify(); }
  captureError(error: unknown, source: string) {
    const e = error instanceof Error ? error : new Error(String(error));
    this.record('error', e.message, { source, name: e.name });
  }
  async fetch(input: string, init?: RequestInit, fetcher: typeof fetch = globalThis.fetch): Promise<Response> {
    const generation = this.#generation;
    const path = pathOnly(input);
    const start = performance.now();
    const requestId = this.record('request', `${init?.method ?? 'GET'} ${path}`, { method: init?.method ?? 'GET', path });
    try {
      const response = await fetcher(input, init);
      if (generation === this.#generation) {
        this.record('response', `${response.status} ${path}`, { requestId, status: response.status, ok: response.ok, durationMs: Math.round((performance.now() - start) * 10) / 10 });
        if (!response.ok) this.captureError(new Error(`HTTP ${response.status} from ${path}`), 'fetch');
      }
      return response;
    } catch (error) {
      if (generation === this.#generation) {
        this.record('response', `Network failure: ${path}`, { requestId, status: 0, ok: false, durationMs: Math.round(performance.now() - start) });
        this.captureError(error, 'fetch');
      }
      throw error;
    }
  }
  snapshot(): Snapshot {
    return structuredClone({ version: 1, pageId: this.#pageId, route: this.#route, events: this.#events, state: this.#state, dropped: this.#dropped });
  }
  callTool(name: string, input: unknown = {}) {
    if (!toolNames.includes(name as ToolName)) throw new Error(`Unknown PageScope tool: ${name}`);
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Input must be an object');
    const values = input as Record<string, unknown>;
    if (Object.keys(values).some(key => key !== 'limit')) throw new Error('Unknown input property');
    const limit = values.limit ?? 20;
    if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1 || limit > 50) throw new Error('limit must be an integer from 1 to 50');
    const snapshot = this.snapshot();
    const base = { pageId: snapshot.pageId, route: snapshot.route };
    if (name === 'get_page_context') return { ...base, eventCount: snapshot.events.length, dropped: snapshot.dropped, stateSources: Object.keys(snapshot.state), latestError: snapshot.events.filter(e => e.kind === 'error').at(-1) ?? null, guarantees: ['page-local', 'bounded records', 'opt-in state', 'no headers or bodies captured'] };
    if (name === 'inspect_state') return { ...base, state: snapshot.state };
    const events = snapshot.events.filter(e => name === 'inspect_timeline' || (name === 'inspect_errors' ? e.kind === 'error' : e.kind === 'request' || e.kind === 'response'));
    return { ...base, total: events.length, dropped: snapshot.dropped, events: events.slice(-limit) };
  }
}

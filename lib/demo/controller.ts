import { PageScope } from '../../packages/pagescope/src/core.ts';
import { photos, type Photo, type Scenario } from './data.ts';
export type ArchivePhoto = Omit<Photo, 'title'> & { title: string | null };
export type DemoState = {
  scenario: Scenario;
  fixed: boolean;
  busy: boolean;
  phase: 'ready' | 'broken' | 'verified';
  query: string;
  appliedQuery: string;
  items: ArchivePhoto[];
  issue: string | null;
  runId: number;
  failedAttempts: number;
  discarded: number;
  durationMs: number;
};
export class DemoController {
  readonly scope: PageScope;
  readonly baseUrl: string;
  #listeners = new Set<() => void>();
  #generation = 0;
  #state: DemoState = {
    scenario: 'network',
    fixed: false,
    busy: false,
    phase: 'ready',
    query: '',
    appliedQuery: '',
    items: photos,
    issue: null,
    runId: 0,
    failedAttempts: 0,
    discarded: 0,
    durationMs: 0,
  };
  constructor(scope: PageScope, baseUrl = '') {
    this.scope = scope;
    this.baseUrl = baseUrl;
  }
  subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };
  getSnapshot = () => this.#state;
  #update(patch: Partial<DemoState>) {
    this.#state = { ...this.#state, ...patch };
    const {
      scenario,
      fixed,
      busy,
      query,
      appliedQuery,
      phase,
      items,
      failedAttempts,
      discarded,
    } = this.#state;
    this.scope.setState('Archive', {
      scenario,
      fixed,
      busy,
      query,
      appliedQuery,
      phase,
      resultCount: items.length,
      titles: items.map((p) => p.title),
      failedAttempts,
      discarded,
    });
    for (const listener of this.#listeners) listener();
  }
  select(scenario: Scenario) {
    if (
      !(scenario === 'network' || scenario === 'race' || scenario === 'render')
    )
      throw new Error('Unknown scenario');
    if (this.#state.busy) throw new Error('An experiment is already running');
    this.reset(scenario);
  }
  reset(scenario: Scenario = this.#state.scenario) {
    this.#generation++;
    this.scope.enterPage('/examples');
    this.#update({
      scenario,
      fixed: false,
      busy: false,
      phase: 'ready',
      items: photos,
      issue: null,
      query: '',
      appliedQuery: '',
      runId: this.#state.runId + 1,
      failedAttempts: 0,
      discarded: 0,
      durationMs: 0,
    });
  }
  async run(fixed = false) {
    if (this.#state.busy) throw new Error('An experiment is already running');
    const scenario = this.#state.scenario;
    const generation = ++this.#generation;
    const start = performance.now();
    this.scope.record(
      'action',
      fixed ? 'Verify patched implementation' : 'Reproduce original bug',
      { scenario },
    );
    this.#update({
      busy: true,
      fixed,
      phase: 'ready',
      items: photos,
      issue: null,
      query: '',
      appliedQuery: '',
      failedAttempts: 0,
      discarded: 0,
      runId: this.#state.runId + 1,
    });
    try {
      if (scenario === 'network') {
        const attempts = fixed ? 2 : 1;
        for (let attempt = 0; attempt < attempts; attempt++) {
          const response = await this.scope.fetch(
            `${this.baseUrl}/api/archive?case=network&attempt=${attempt}`,
          );
          if (generation !== this.#generation) return;
          if (response.ok) {
            const data = (await response.json()) as { items: Photo[] };
            this.#update({ items: data.items });
            break;
          }
          this.#update({ failedAttempts: attempt + 1, items: [] });
          if (fixed && attempt === attempts - 1)
            throw new Error('Archive unavailable after bounded retry');
          if (fixed)
            this.scope.record('action', 'Bounded retry', {
              attempt: attempt + 1,
            });
        }
      } else if (scenario === 'race') {
        // Fixture deliberately delays the first request. Production code should never add this delay.
        let latestRequest = 0;
        const search = async (query: string) => {
          const request = ++latestRequest;
          this.#update({ query });
          const response = await this.scope.fetch(
            `${this.baseUrl}/api/archive?case=race&q=${query}`,
          );
          if (!response.ok)
            throw new Error(`Search failed: ${response.status}`);
          const data = (await response.json()) as {
            items: Photo[];
            query: string;
          };
          if (generation !== this.#generation) return;
          if (fixed && request !== latestRequest) {
            this.scope.record('discard', 'Stale response rejected', {
              responseQuery: data.query,
              activeQuery: this.#state.query,
              request,
            });
            this.#update({ discarded: this.#state.discarded + 1 });
            return;
          }
          this.#update({ items: data.items, appliedQuery: data.query });
        };
        await Promise.all([search('namibia'), search('lena')]);
      } else {
        const response = await this.scope.fetch(
          `${this.baseUrl}/api/archive?case=render`,
        );
        if (!response.ok)
          throw new Error(`Metadata request failed: ${response.status}`);
        const data = (await response.json()) as { items: ArchivePhoto[] };
        if (generation !== this.#generation) return;
        this.#update({ items: data.items });
      }
      if (generation !== this.#generation) return;
      this.#update({
        busy: false,
        phase: fixed ? 'verified' : 'broken',
        durationMs: Math.round(performance.now() - start),
      });
      this.scope.record(
        'action',
        fixed ? 'Patched run completed' : 'Bug reproduced',
        { scenario, resultCount: this.#state.items.length },
      );
    } catch (error) {
      if (generation !== this.#generation) return;
      this.scope.captureError(error, 'experiment');
      this.#update({
        busy: false,
        phase: 'broken',
        issue: error instanceof Error ? error.message : String(error),
        durationMs: Math.round(performance.now() - start),
      });
    }
  }
}

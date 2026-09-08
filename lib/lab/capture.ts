import { PageScope } from '../../packages/pagescope/src/core.ts';
import {
  createIncident,
  type Incident,
  type Json,
  type Operation,
} from '../../packages/pagescope/src/replay.ts';
import { appIds, type AppKind } from './models.ts';

/** Only these selected fixture fields enter a recording. Raw response bodies are never retained. */
export async function captureIncident(
  app: AppKind,
  values: string[],
  order: string[],
  scope: PageScope,
  signal: AbortSignal,
): Promise<Incident> {
  const operations = await Promise.all(
    values.map(async (value, i): Promise<Operation> => {
      const start = performance.now();
      const route =
        app === 'atlas'
          ? `/api/archive?q=${encodeURIComponent(value)}`
          : `/api/shipping?country=${encodeURIComponent(value)}`;
      const response = await scope.fetch(route, { signal });
      if (!response.ok)
        throw new Error(`Capture request failed: HTTP ${response.status}`);
      const raw = await response.json();
      if (!raw || typeof raw !== 'object' || Array.isArray(raw))
        throw new Error('API returned an invalid fixture');
      const data = raw as Record<string, unknown>;
      const input: Json =
        app === 'atlas' ? { query: value } : { destination: value };
      let output: Json;
      if (app === 'atlas') {
        if (
          typeof data.query !== 'string' ||
          !Array.isArray(data.items) ||
          data.items.some((item) => !item || typeof item.id !== 'string')
        )
          throw new Error('API returned invalid observations');
        output = { query: data.query, ids: data.items.map((item) => item.id) };
      } else {
        if (
          typeof data.destination !== 'string' ||
          typeof data.cents !== 'number' ||
          typeof data.days !== 'number'
        )
          throw new Error('API returned an invalid quote');
        output = {
          destination: data.destination,
          cents: data.cents,
          days: data.days,
        };
      }
      return {
        id: `Q${i + 1}`,
        label: value,
        input,
        output,
        transportMs: Math.round((performance.now() - start) * 10) / 10,
      };
    }),
  );
  return createIncident({
    appId: appIds[app],
    route: app === 'atlas' ? '/' : '/shipping',
    operations,
    order,
    rule:
      app === 'atlas'
        ? {
            label:
              'Search results belong to the latest query after every request settles',
            actual: ['appliedQuery'],
            expected: ['query'],
          }
        : {
            label: 'The shipping quote belongs to the current delivery address',
            actual: ['quotedDestination'],
            expected: ['destination'],
          },
  });
}

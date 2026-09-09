import {
  type Json,
  type Operation,
  type ReplayAdapter,
} from '../../packages/tab-debug/src/replay.ts';

export type Variant = 'original' | 'patched';
export type AppKind = 'atlas' | 'shipping';
export const appIds = {
  atlas: 'atlas.search.v1',
  shipping: 'checkout.shipping.v1',
} as const;
export type LabState = { [key: string]: Json };

function object(value: Json): Record<string, Json> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected a recorded object');
  return value;
}
function text(value: Json | undefined): string {
  if (typeof value !== 'string' || value.length > 40)
    throw new Error('Invalid recorded input');
  return value;
}

/** This handler powers the visible archive AND the replay adapter. There is no parallel bug simulator. */
export function createArchiveModel(
  variant: Variant,
  publish: (state: LabState) => void = () => {},
): ReplayAdapter {
  let latest = 0;
  let state: LabState = {
    query: '',
    appliedQuery: '',
    ids: [],
    pending: 0,
    discarded: 0,
  };
  const update = (patch: LabState) => {
    state = { ...state, ...patch };
    publish(structuredClone(state));
  };
  return {
    snapshot: () => structuredClone(state),
    async dispatch(operation: Operation, response: Promise<Json>) {
      const request = ++latest;
      const query = text(object(operation.input).query);
      update({ query, pending: Number(state.pending) + 1 });
      const result = object(await response);
      const appliedQuery = text(result.query);
      if (
        !Array.isArray(result.ids) ||
        result.ids.length > 24 ||
        result.ids.some((id) => typeof id !== 'string' || id.length > 80)
      )
        throw new Error('Invalid recorded observations');
      if (variant === 'patched' && request !== latest) {
        update({
          discarded: Number(state.discarded) + 1,
          pending: Number(state.pending) - 1,
        });
        return;
      }
      update({
        appliedQuery,
        ids: result.ids,
        pending: Number(state.pending) - 1,
      });
    },
  };
}

export const destinations = ['Canada', 'Japan', 'France'] as const;
/** An independent checkout handler: changing the address must invalidate older shipping quotes. */
export function createShippingModel(
  variant: Variant,
  publish: (state: LabState) => void = () => {},
): ReplayAdapter {
  let revision = 0;
  let state: LabState = {
    destination: '',
    quotedDestination: '',
    cents: 0,
    days: 0,
    pending: 0,
    discarded: 0,
  };
  const update = (patch: LabState) => {
    state = { ...state, ...patch };
    publish(structuredClone(state));
  };
  return {
    snapshot: () => structuredClone(state),
    async dispatch(operation: Operation, quote: Promise<Json>) {
      const atRevision = ++revision;
      const destination = text(object(operation.input).destination);
      if (!(destinations as readonly string[]).includes(destination))
        throw new Error('Unknown destination');
      update({ destination, pending: Number(state.pending) + 1 });
      const value = object(await quote);
      const country = text(value.destination);
      if (
        !(destinations as readonly string[]).includes(country) ||
        typeof value.cents !== 'number' ||
        !Number.isInteger(value.cents) ||
        value.cents < 0 ||
        value.cents > 100_000 ||
        typeof value.days !== 'number' ||
        !Number.isInteger(value.days) ||
        value.days < 1 ||
        value.days > 60
      )
        throw new Error('Invalid recorded quote');
      if (variant === 'patched' && atRevision !== revision) {
        update({
          discarded: Number(state.discarded) + 1,
          pending: Number(state.pending) - 1,
        });
        return;
      }
      update({
        quotedDestination: country,
        cents: value.cents,
        days: value.days,
        pending: Number(state.pending) - 1,
      });
    },
  };
}
export function createModel(
  app: AppKind,
  variant: Variant,
  publish?: (state: LabState) => void,
) {
  return app === 'atlas'
    ? createArchiveModel(variant, publish)
    : createShippingModel(variant, publish);
}

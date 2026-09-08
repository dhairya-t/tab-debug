# Turn an async race into a regression

PageScope addresses a specific debugging gap: knowing which request finished last is insufficient to reproduce a bug. You also need the inputs, selected response data, the order in which application handlers committed, and a statement of correct state.

The [live lab](https://pagescope-omega.vercel.app) captures three actual API responses, projects only the needed fields, and delivers the recorded values through a completion gate. It runs the same async handlers that drive the visible archive or checkout. Their final state is checked against a registered invariant.

## The reproducible experiment

1. Start three searches: Namibia, Atlantic, Lena. Lena is the current user intent.
2. Release their responses in order Q3, Q2, Q1. The first correct result is overwritten by older handlers.
3. Inspect the checkpoint after Q2: the original `appliedQuery` changes from Lena to Atlantic while `query` stays Lena.
4. Replay the same data and order through the generation guard. Older handlers are discarded.
5. Explore all six permutations. With these three distinct inputs, four original schedules fail; every guarded schedule passes.
6. Export the incident and the Playwright test. The test fails on the original and passes on the patched application.

Those counts are computed by executing the handlers. Change the order so Q3 finishes last and the original also passes. Repeated or equivalent inputs can change the failure count. The UI never assigns a fixed score.

The [shipping example](https://pagescope-omega.vercel.app/shipping) uses an independent checkout handler: an older quote must not replace the quote for the current destination. Its fixtures are illustrative; no order is placed.

## Add it to your app

Build the package in this repository with `npm run build:sdk` and `npm pack ./packages/pagescope`. Install the resulting tarball in your app. Version 0.2 is not published to the npm registry.

The useful seam is your existing async handler's data source. Inject the recorded completion there while preserving the business logic and state publication. For example:

```ts
import { installReplayTarget, replay, type Json } from '@dhairya-t/pagescope/replay';

// Your application calls this same controller during normal use.
class SearchController {
  latest = 0;
  query = '';
  appliedQuery = '';

  async search(query: string, load = async () => {
    const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json() as { query: string };
  }) {
    const request = ++this.latest;
    this.query = query;
    const result = await load();
    if (request !== this.latest) return; // remove to reproduce the stale-write bug
    this.appliedQuery = result.query;
    // Publish the updated state through your normal application store here.
  }
}

// Install only in development/test or in a deliberately public fixture.
const dispose = installReplayTarget({
  appId: 'catalog.search.v1',
  replay: incident => {
    const controller = new SearchController();
    return replay(incident, {
      dispatch: (operation, completion) => controller.search(
        (operation.input as { query: string }).query,
        async () => await completion as { query: string },
      ),
      snapshot: (): Json => ({ query: controller.query, appliedQuery: controller.appliedQuery }),
    });
  },
});
// Call dispose() when your integration unmounts.
```

Validate the domain fields your handler consumes, as the [archive and checkout adapters](../lib/lab/models.ts) do. Schema validation establishes a bounded JSON envelope; your app remains responsible for its domain contract.

Create an incident with `createIncident({ appId, route, operations, order, rule })`. Each operation contains an ID, label, explicit input/output projections, and measured transport duration. The rule selects two paths in application state that must be equal after all operations settle. The demo's capture integration is [capture.ts](../lib/lab/capture.ts).

## Capture and replay are separate

`scope.fetch` continues to record metadata only. The lab **explicitly projects** safe response fields into an incident: search query and observation IDs, or destination and quote values. It does not retain headers, cookies, request bodies, arbitrary API response bodies, or server credentials. Images are looked up from the app's local catalog, not imported URLs.

`createIncident` sanitizes supplied projections before retention. `parseIncident` validates imported data but does not rewrite it silently; treat imported recordings as untrusted application data. Import reads the local file without uploading it.

A replay makes no API calls. Each operation receives a deferred promise. The scheduler resolves one promise according to the recording, awaits its actual application handler, captures a deep snapshot and field diff, then releases the next promise. It never uses sleeps to decide response order. UI animation pauses only make the transitions readable.

## Exported test

The downloaded `.spec.ts` file embeds the recording and uses standard Playwright. It waits for your explicitly installed replay target, checks the app ID, replays the incident, verifies the delivered order, and independently compares fields in the returned final state. It does not trust a precomputed `passed` flag.

```bash
# The default demo's original implementation should fail.
PAGESCOPE_BASE_URL='http://localhost:3001/' npx playwright test pagescope-atlas.spec.ts

# The identical file must pass after the patch.
PAGESCOPE_BASE_URL='http://localhost:3001/?implementation=patched' npx playwright test pagescope-atlas.spec.ts
```

The `implementation` query parameter is a public-demo convention. Your own app should run its actual current implementation. The optional `window.__PAGESCOPE_REPLAY__` bridge is a **mutating test interface**, distinct from the five read-only WebMCP tools. It is absent until explicitly installed and must be gated appropriately in a real production app.

Generate tests without the UI using the packaged CLI:

```bash
pagescope inspect incident.json
pagescope test incident.json regression.spec.ts
```

The CLI refuses to overwrite an existing file. Recordings contain JSON, not executable code. Native browser agents can retrieve the current incident through `inspect_state` → `state.Incident`, save it, and use the same CLI.

## What this covers

- Two to six explicitly registered concurrent operations; the public workbench presents three.
- All inputs are issued before any recorded completion is delivered. Enumeration covers permutations of these completions, **not every possible event-loop interleaving**.
- A final-state equality invariant. It does not prove the absence of all race conditions or transient UI defects.
- Up to 200KB per incident, bounded JSON depth/collections, 32KB per checkpoint, and an abortable 10-second default replay deadline. The deadline is a liveness bound, not a scheduling mechanism.
- A handler must return only after its state update settles. Additional async work outside that handler is outside the recorded boundary.
- Domain data must be explicitly selected; best-effort redaction cannot identify every secret in arbitrary prose.

This complements [Playwright's network mocking and HAR replay](https://playwright.dev/docs/mock). PageScope's added boundary is the application handler and its state invariant. It does not claim to replace a general session recorder, distributed tracing system, or server-side debugger.

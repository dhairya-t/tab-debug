# PageScope

**Catch the bug. Keep the proof.** Turn an intermittent browser race into a portable incident and a repeatable failing test.

[Live demo](https://pagescope-omega.vercel.app) · [Shipping example](https://pagescope-omega.vercel.app/shipping) · [Walkthrough](docs/media/demo.mp4) · [Integration guide](docs/replay.md)

Inspired by [Guillermo Rauch’s September 5, 2026 post](https://x.com/rauchg/status/2096065378598441431) about debugging tools exposed by the exact page a browser agent is testing.

![Original stale search results beside the verified generation guard](docs/media/replay.png)

## The problem

A screenshot can show that search results are wrong. It cannot tell the next developer which response arrived late, what it overwrote, or how to make the same bug happen again.

PageScope captures selected API response fields and the state invariant, controls completion order at the application's async boundary, and exports a Playwright test. The same recording fails before the fix and passes after it. Browser agents can retrieve the evidence through five native WebMCP tools.

## Try the complete loop

1. Select **Capture & compare**. Three actual API calls collect the fixture data.
2. Q3 returns the correct Lena results. Q2 and Q1 subsequently overwrite them in the original implementation.
3. Select **Jump to it** to inspect the first divergent state update.
4. Select **Check all 6 orders**. The original fails four schedules; the guarded handler passes all six. These results are computed by running the application handlers.
5. **Save incident** and reopen it in another browser. Replay works with the API blocked.
6. **Export regression test**. Run the exact same file against the original and the patched application.

Change the order so Q3 completes last: both versions pass. The outcome is not predetermined. The independent [checkout example](https://pagescope-omega.vercel.app/shipping) catches a quote for an old delivery address replacing the current one.

The [Diagnostics examples](https://pagescope-omega.vercel.app/examples) retain the original HTTP 503/retry, out-of-order search, and React error-boundary demonstrations.

## Run locally

```bash
npm ci
npm run dev:next
# http://localhost:3001
```

Node 24 recommended (minimum 22.13). The public deployment runs official Next.js on Vercel. A secondary Vinext/Cloudflare build is available through `npm run build`.

## Reusable package

[`@dhairya-t/pagescope`](packages/pagescope) contains the framework-independent diagnostic core, optional React bindings, native WebMCP registration, completion gate, incident validator, replay runner, state diffing, and Playwright generator. The core has no runtime dependencies.

```bash
npm run build:sdk
npm pack ./packages/pagescope
# Install the generated dhairya-t-pagescope-0.2.0.tgz in your app.
```

Version 0.2 is packaged locally and is not published to the npm registry.

```ts
import { createIncident, replay, installReplayTarget } from '@dhairya-t/pagescope/replay';
```

Integrate at an existing async handler's data-source boundary. The replay adapter must call your real handler and return after its state update settles; PageScope controls the completion promise and snapshots your explicitly selected state. See the [complete integration example](docs/replay.md#add-it-to-your-app).

The included CLI validates incidents and generates tests without the UI:

```bash
pagescope inspect incident.json
pagescope test incident.json regression.spec.ts
```

## Native browser-agent context

```bash
npx agent-browser install
npx agent-browser --session pagescope open https://pagescope-omega.vercel.app
# Capture a run in the page, then:
npx agent-browser --session pagescope webmcp list
npx agent-browser --session pagescope webmcp invoke inspect_state --params '{}'
```

`inspect_state` includes the portable recording in `state.Incident`, the observed failure in `state.Replay`, and the verified comparison in `state.Comparison`. An agent can save the incident and use the CLI to produce the same regression test.

| Tool | Evidence |
| --- | --- |
| `get_page_context` | Tab/page identity, route, diagnostic counts, latest error |
| `inspect_requests` | Opt-in request metadata, correlation IDs, measured durations |
| `inspect_errors` | Captured HTTP, React, and invariant failures |
| `inspect_state` | Explicit state, portable incident, comparison and schedule results |
| `inspect_timeline` | Ordered diagnostic events and replay checkpoints |

The tools validate arguments and are read-only. Native WebMCP is experimental and feature-detected. Unsupported browsers retain the local inspector and all replay controls. The SDK does not install a fake native API.

## Engineering boundaries

- **Deterministic completion order.** A deferred-promise gate releases one response, awaits its actual application handler, then captures state. No timing guesses establish ordering.
- **Portable, bounded evidence.** JSON-only incidents up to 200KB; 2–6 operations; 32KB checkpoints; explicit cancellation and a liveness deadline. No uploaded code or dynamic evaluation.
- **Explicit data selection.** `scope.fetch` retains metadata only. The lab separately projects observation IDs or shipping quote fields into recordings. Headers, cookies and arbitrary bodies are not captured.
- **Independent assertions.** The exported Playwright test reads returned application state and compares the recorded paths. It does not trust an adapter's `passed` flag.
- **Two distinct interfaces.** The five WebMCP tools are read-only. The optional `installReplayTarget` bridge drives application handlers and must be explicitly enabled in development/test or a public fixture.
- **Honest coverage.** Six schedules cover the completion permutations of three already-issued operations. This is not a proof about every event-loop interleaving, nor an LLM accuracy benchmark.

The public patches are documented source branches. They do not generate repairs or edit a repository. Next.js already provides [server-side MCP diagnostics](https://nextjs.org/docs/app/guides/mcp); PageScope complements them with page-specific evidence and reproducible async behavior.

## Verify

```bash
npm run check                # TypeScript, 25 tests, SDK compilation
npm run build:vercel
npm run start:next           # another terminal
TEST_BASE_URL=http://localhost:3001 npm run test:e2e
TEST_BASE_URL=http://localhost:3001 npm run test:export
TEST_BASE_URL=http://localhost:3001 npm run test:webmcp
```

`test:export` downloads the test through the UI, runs it in fresh browser processes, verifies a genuine state-assertion failure on the original, and verifies success with the identical file on the patched application. CI includes this check.

See [verification evidence](docs/verification.md), [architecture](docs/architecture.md), [research](docs/research.md), and [replay limits](docs/replay.md#what-this-covers).

## License and credits

MIT. Built by [Dhairya Thakkar](https://github.com/dhairya-t).

Real NASA/USGS imagery, with [source credits](public/images/CREDITS.md). The typography and density take cues from [Vercel](https://vercel.com/design), [Linear](https://linear.app), and [Teenage Engineering](https://teenage.engineering/products/field-system), in an original editorial composition.

# Architecture

```mermaid
flowchart LR
  App[React application] -->|explicit state and actions| Scope[PageScope instance]
  Fetch[scope.fetch] -->|request and response metadata| Scope
  Boundary[React ErrorBoundary] -->|captured error| Scope
  Scope --> Sanitize[Sanitize and bound]
  Sanitize --> Ring[120-event ring buffer]
  Ring --> Executor[Validated read-only executors]
  Executor --> UI[Visible inspector]
  Executor --> Registry[document.modelContext]
  Registry --> Agent[agent-browser / compatible host]
```

## Correlation and lifetimes

Request-start sequence IDs act as correlation IDs for response events. Durations use `performance.now()`; the event clock uses `Date.now()`. Event ordering is defined by sequence IDs, not wall-clock timestamps.

`enterPage` increments a generation, generates a new UUID, and clears events and state. Each in-flight fetch captures its starting generation. Completion is recorded only when that generation still matches. This is isolation of diagnostic writes; the caller remains responsible for cancelling requests or suppressing stale business-state updates. The race experiment demonstrates a separate application-level generation guard.

WebMCP tools are registered once with an AbortSignal. Unmounting the integration aborts registrations; disposed executors also reject late calls. Every executor reads the current scope rather than closing over an old snapshot. An unsupported browser receives no fake native API.

State and events are sanitized before they enter the buffer. Snapshots are deep copies so callers cannot mutate the retained records. Unchanged state values do not emit new events. The subscription API exposes a monotonically increasing version for `useSyncExternalStore`.

## Reproduction cases

| Case | Real failing behavior | Patch behavior | Evidence |
| --- | --- | --- | --- |
| Silent request failure | Fixture returns HTTP 503; original path treats it as an empty collection | One bounded retry receives HTTP 200, restoring items | Correlated request/response events, status codes, item counts |
| Out-of-order search | Namibia request is deliberately delayed; its late response overwrites the newer Lena results | Per-search generation check discards the stale result | Query versus applied query; request timing; discard event |
| Nullable metadata | Fixture returns null title; original component throws during render | Nullish fallback before uppercase conversion | React boundary error; original nullable state; safe rendered output |

The public API fixture accepts a small fixed set of cases and an optional bounded search string. It does not proxy user URLs, execute uploaded code, invoke models, or write persistent records.

## Framework boundaries

The core package has no React or server dependency. The React entry point provides a provider, subscription hook, explicit state hook, registration hook, and boundary. The browser is the only WebMCP registration boundary.

Official Next.js 16 handles the public Vercel deployment. A retained Vinext build emits a Cloudflare Worker for the secondary Sites runtime. `vercel.json` selects the official Next.js build; the Sites build uses the generated Vite configuration. The SDK and fixture behavior are shared.

## Limits

- Opt-in diagnostics do not expose build errors, server logs, full network payloads, React fiber internals, or arbitrary component state.
- Redaction does not identify every kind of secret in prose. Never treat it as a substitute for selecting safe fields.
- Native WebMCP is experimental; registration surfaces and browser support can change.
- The demo models one browser process and controlled failures. It does not claim an LLM diagnosis success rate or an agent benchmark.
- Patch buttons exercise existing code branches. They do not edit a repository or generate a fix.

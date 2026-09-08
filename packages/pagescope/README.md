# @dhairya-t/pagescope

Opt-in page-local debugging tools for browser agents, using native WebMCP.

Version 0.2 adds deterministic async replay and portable regression tests. Import `createIncident`, `parseIncident`, `CompletionGate`, `replay`, `stateDiff`, `generatePlaywright`, and `installReplayTarget` from `@dhairya-t/pagescope/replay`. The `pagescope` CLI provides `inspect` and `test` commands for incident JSON files.

Replay controls recorded completion promises at your real application's async handler boundary. The optional browser replay target is a mutating development/test interface and is separate from the read-only WebMCP tools. It is never installed automatically. See the [replay integration guide](https://github.com/dhairya-t/pagescope/blob/main/docs/replay.md).

The core package has no runtime dependencies. The optional React adapter supports React 18+.

```ts
import { PageScope } from '@dhairya-t/pagescope';
import { registerPageTools } from '@dhairya-t/pagescope/webmcp';

const scope = new PageScope({ capacity: 120 });
scope.enterPage(window.location.pathname);
scope.setState('Search', { query: 'lena', count: 1 });
const response = await scope.fetch('/api/search?q=lena');

const lifecycle = new AbortController();
await registerPageTools(scope, document.modelContext, lifecycle.signal);
// On page integration teardown: lifecycle.abort()
```

For TypeScript projects without WebMCP DOM typings, use the exported `ModelContext` type for the optional `document.modelContext` property.

React exports: `PageScopeProvider`, `usePageScope`, `usePageSnapshot`, `useInspectState`, `useWebMCP`, `PageScopeBoundary`.

The five tools are `get_page_context`, `inspect_requests`, `inspect_errors`, `inspect_state`, and `inspect_timeline`. They are read-only and accept an optional integer `limit` from 1 to 50.

On SPA navigation, call `enterPage` to clear the previous context. Late requests cannot write into a newer page’s diagnostic buffer. Requests are not cancelled automatically; application state still needs its own cancellation or generation guard.

Enable only in development or behind your application’s authorization gate. Register only safe fields. Redaction is a best-effort backstop, not a guarantee for arbitrary secrets. The wrapper does not capture request headers, bodies, or query strings. There is no network telemetry or persistent storage.

Native WebMCP is experimental and feature-detected. The package does not install a fake browser API.

See the [repository](https://github.com/dhairya-t/pagescope) for the interactive Next.js demo, reproducible browser tests, and full integration guide. MIT license.

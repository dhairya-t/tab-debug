# tab-debug

Expose the current page's requests, errors, and selected state to a browser agent through WebMCP. No separate MCP server.

## Next.js App Router

Install the release archive (the package is not on the npm registry):

```bash
npm install https://tab-debug-dhairya.vercel.app/downloads/dhairya-t-tab-debug-0.3.0.tgz
```

Wrap your existing layout:

```tsx
// app/layout.tsx
import { TabDebug } from '@dhairya-t/tab-debug/next';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body><TabDebug>{children}</TabDebug></body></html>;
}
```

`TabDebug` activates in development only. It registers five browser tools, captures metadata for subsequent browser `fetch` calls, records uncaught errors and unhandled promise rejections, and clears the previous page's context on pathname changes. It adds no visible UI. Keep your existing layout, styles, and providers.

Choose which component state the agent should see:

```tsx
'use client';
import { useDebugState } from '@dhairya-t/tab-debug/react';

// Inside your existing component, after declaring its state:
useDebugState('Search', { query, resultCount: results.length, loading });
```

Start your development server and open that page in a WebMCP-capable agent browser:

```bash
npx agent-browser open http://localhost:3000
npx agent-browser webmcp list
npx agent-browser webmcp invoke inspect_state --params '{}'
```

Browser setup and a working integration: [Add to your app](https://tab-debug-dhairya.vercel.app/setup).

## What is captured

| Tool | Output |
| --- | --- |
| `get_page_context` | Current pathname, page ID, counts, latest captured error |
| `inspect_requests` | Browser fetch method, URL path, status, duration |
| `inspect_errors` | Failed fetches, uncaught errors, unhandled rejections, explicitly reported errors |
| `inspect_state` | Values supplied through `useDebugState` |
| `inspect_timeline` | Ordered events from this page |

Tools only read and accept an optional `limit` integer from 1 to 50. State is bounded and redacted before retention. Request headers, query strings, and bodies are not recorded. There is no telemetry or persistence.

Only calls made after mount through the current `window.fetch` are observed. This does not capture server-side requests, XMLHttpRequest, framework internals, or errors a React boundary has already handled. For handled errors, `useDebug()` returns a diagnostic session with `captureError(error, 'source')`, or null when disabled. Mount one provider per tab. The fetch wrapper preserves request/response objects and is removed on teardown; navigation keeps the application's component tree intact.

The default development gate is disabled in production builds. An explicit `enabled` override is available for authorized test environments (the public demo uses known fixtures). Register only safe fields: redaction is a backstop, not a guarantee for arbitrary secrets.

## Other React apps

```tsx
import { TabDebugProvider } from '@dhairya-t/tab-debug/react';
<TabDebugProvider enabled={isDevelopment} route={pathname}>
  {children}
</TabDebugProvider>
```

Supply your router's pathname. Without React, use `PageScope` from the main entry and `attachBrowserTools` from `/browser`; call `enterPage(pathname)` on navigation and `dispose()` on teardown. The existing low-level `PageScope`, React, and WebMCP exports remain available for explicit instrumentation.

Native WebMCP is experimental and requires a compatible browser/agent. Without it, local diagnostic capture still works; no fake browser API is installed. React and Next.js are optional peer dependencies; the core has no runtime dependencies.

## Optional replay

Replay requires an adapter for your application's async handler. It is separate from the one-component debugging setup. See the [replay guide](https://github.com/dhairya-t/tab-debug/blob/main/docs/replay.md).

The `tab-debug` CLI validates saved incidents and generates Playwright tests:

```bash
tab-debug inspect incident.json
tab-debug test incident.json regression.spec.ts
```

Incident format `pagescope.incident.v1` and the `__PAGESCOPE_REPLAY__` test bridge retain their original names to read existing recordings. MIT license.

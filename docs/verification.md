# Verification

The test commands and evidence in this repository distinguish the underlying SDK, the visible application, and the actual native WebMCP transport.

## Current demo: a reproduced Transform bug

Pinned upstream: `ritz078/transform@ff7557939be351706f4dc6f71cc375e3bc64c225` (MIT). The full app runs locally without changing its React 17 / Next 10 stack.

- **Original app:** select first.json, then second.json; complete the responses in the opposite order. The rendered editor incorrectly ends with first.json. No application source was changed. [Evidence](verification/transform-original.json).
- **Instrumented app:** add a development-only SDK connection and one editor state registration effect. The same bug reproduces. Native `document.modelContext` calls report two HTTP 200 responses and the wrong editor value. [Evidence](verification/transform-instrumented.json).
- **Patched app:** a request-generation check after `res.text()` prevents the older load from overwriting the editor. The same test retains second.json; native tools agree. [Evidence](verification/transform-fixed.json).
- **Public reproduction:** a reduced loader with real HTTP requests, deliberately delayed first response, original/fixed runs, and state/request tools. The full original-app test is separate from this simplified UI.
- **20 browser tests** pass locally and on https://tab-debug-dhairya.vercel.app, including the new demo, error recovery, native tool calls, mobile layout, and favicon. SDK unit tests remain at 29. [Public check](verification/transform-public.json). [GitHub CI passed](https://github.com/dhairya-t/tab-debug/actions/runs/34309352199), including the independent Next.js development/production integration.

[Reproduction instructions, original source, license, and patch](../examples/transform). No upstream issue or PR has been submitted. Controlled latency establishes that the bug can occur; it is not a claim about production frequency.

## Version 0.3: tab-debug and Next.js setup

The application and package are now called tab-debug. The interface uses short labels and exposes the working controls without a marketing hero. The setup guide contains a working example imported from the same release archive as its install command.

- **29 unit tests** pass, including automatic fetch capture, original Request/Response identity, no retained bodies or query values, remounts, pending writes after teardown, duplicate installation rejection, and partial WebMCP registration failure.
- **17 browser tests** pass, including the setup form, archive integrity, enable/disable behavior, mobile layout, and copyable code.
- **Independent Next.js app:** the exact package installs in `examples/next-app`. In development, native WebMCP exposes five tools. Navigation changes page context, removes the previous page's state, and preserves a shared counter. See [development evidence](verification/next-development.json).
- **Production defaults:** the same example builds and remains interactive with zero browser tools registered. See [production evidence](verification/next-production.json).
- The same exported Playwright regression fails on the original state assertion and passes with the prewritten fix.
- Official Next.js and the secondary Vinext builds pass. CI also checks the independent Next.js app in development and production.

A live dependency audit identified an older Sharp version in Miniflare's local Cloudflare tooling. A targeted override uses Sharp 0.35.4; the online audit then reports zero vulnerabilities. Next.js already used that patched version. [Upstream advisory](https://github.com/advisories/GHSA-rgj7-g3m4-5g8c).

The sections below record earlier versions and their historical conditions.

## Version 0.2: reproducible async races

Verified September 8, 2026 against the official Next.js production build:

- **25 unit tests** cover the diagnostic core, completion gate, cancellation, stalled-handler deadlines, immutable checkpoints, semantic state equality, strict incident validation, and both application adapters.
- **14 browser tests** cover all original diagnostics plus capture, causal inspection, computed schedule results, changed-order passing cases, shipping quotes, invalid inputs, mobile layout, and reversed physical transport order.
- **Offline handoff:** an incident is exported, opened in a separate browser context with API requests blocked, and reproduces the original failure and patched result with zero API calls.
- **Exported regression:** the `.spec.ts` file is downloaded through the real UI and run in fresh browser processes. The original exits 1 specifically because it returns `namibia` instead of `lena`; the identical test exits 0 on the patched app. See [the machine-readable evidence](verification/exported-regression.json).
- **Native transport:** five tools are discovered and invoked, all five reject invalid arguments, two tabs are isolated, and `inspect_state` delivers the portable incident plus the six-schedule comparison. See [the native transcript](verification/native-webmcp.json).
- **Dependencies:** removing unused starter modules and the unused database toolchain removed 86 installed packages. The full dependency audit reports **0 vulnerabilities**, including development dependencies.

A public-deployment check exposed why timing-based fixtures are fragile: the original diagnostics example's 650ms server delay occasionally failed to enforce response order under variable network latency. It now uses the same completion gate as the replay SDK. Both HTTP requests remain real; application delivery order is explicit and separately recorded.

The final public deployment at **https://pagescope-omega.vercel.app** passed all 14 browser checks, the exported-test failure/success check, and the native WebMCP contract. Both committed JSON transcripts now record that public origin. [GitHub CI](https://github.com/dhairya-t/pagescope/actions/runs/34270953003) independently passed the final code on Linux.

The version 0.2 MP4 was an actual 26.20-second browser recording, H.264, 1440×1040 at 25fps. The old 0.1 verification below is retained as historical context.

## Version 0.1 archive

## SDK invariants

`npm run check` runs TypeScript checking, ten Node tests, and declaration/JavaScript emission for the standalone package.

Covered invariants: sensitive-key redaction before retention; circular and oversized data; ring-buffer eviction; snapshot immutability; late-request isolation after navigation; request correlation without headers/query values; input validation with no side effects; abortable WebMCP registrations; stable subscriptions for unchanged values; bounded state-source names and counts.

## Browser behavior

`TEST_BASE_URL=http://localhost:3001 npm run test:e2e` targets the official Next.js production server. It checks:

- Actual 503 response, diagnostic evidence, bounded retry, and restored items.
- Actual out-of-order responses, wrong original state, and stale-response rejection after the patch.
- Actual React render exception caught by an error boundary, and safe nullable rendering after the patch.
- Page-context reset when the demo changes view.
- JSON export content and schema.
- Mobile controls, image loading, and absence of horizontal overflow at 390px.
- Desktop rendering and keyboard dismissal of the explanatory dialog.

The race fixture deliberately delays only the first search response by 650ms. This controls the failure trigger; it is not a wait used to make tests pass. Tests wait for a hydrated page marker and observable outcomes.

Development error overlays intercept clicks on the intentionally broken render case. Production testing exercises the end-user behavior without suppressing the error or bypassing the boundary.

## Native transport

`npm run test:webmcp` drives Vercel’s actual agent-browser CLI and official Chrome for Testing. It discovers five native tools, invokes each one, rejects invalid arguments for all five, verifies the original error and patched recovery, and confirms two tabs have separate page IDs and diagnostics.

The recorded calls are in [`verification/native-webmcp.json`](verification/native-webmcp.json). The JSON records the verification time, runtime origin, schemas, annotations, and actual outputs. It contains only controlled demo data.

The in-app browser’s native WebMCP interface was also exercised with all five tools and a rejected invalid-input call.

## Interpretation

These are deterministic integration checks and measured request timings, not an LLM reasoning benchmark. PageScope does not claim a percentage improvement in agent accuracy, token usage, or debugging speed. The public patches are prewritten source branches, not generated repairs.

## Recorded outcome

Verified September 8, 2026: 10 SDK tests passed; 7 production-browser tests passed with zero skips or flaky retries; 5 native tools and 5 invalid-input cases passed with two-tab isolation. Production dependency audit (`npm audit --omit=dev`) reported 0 vulnerabilities. Four moderate development-only advisories remain in the unused Drizzle toolchain inherited from the starter.

The full seven-test browser suite and the native transport checks also passed against the public deployment at **https://pagescope-omega.vercel.app**. The committed native transcript records this public origin. The initial [GitHub CI run](https://github.com/dhairya-t/pagescope/actions/runs/34265245100) passed independently on Linux.

The [walkthrough](media/demo.mp4) is an actual browser recording: 30.52 seconds, H.264, 1440×1040, 25fps. It shows the race fixture, inspection, and verified generation guard.

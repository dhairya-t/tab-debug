# Verification

The test commands and evidence in this repository distinguish the underlying SDK, the visible application, and the actual native WebMCP transport.

## Version 0.2: reproducible async races

Verified September 8, 2026 against the official Next.js production build:

- **25 unit tests** cover the diagnostic core, completion gate, cancellation, stalled-handler deadlines, immutable checkpoints, semantic state equality, strict incident validation, and both application adapters.
- **14 browser tests** cover all original diagnostics plus capture, causal inspection, computed schedule results, changed-order passing cases, shipping quotes, invalid inputs, mobile layout, and reversed physical transport order.
- **Offline handoff:** an incident is exported, opened in a separate browser context with API requests blocked, and reproduces the original failure and patched result with zero API calls.
- **Exported regression:** the `.spec.ts` file is downloaded through the real UI and run in fresh browser processes. The original exits 1 specifically because it returns `namibia` instead of `lena`; the identical test exits 0 on the patched app. See [the machine-readable evidence](verification/exported-regression.json).
- **Native transport:** five tools are discovered and invoked, all five reject invalid arguments, two tabs are isolated, and `inspect_state` delivers the portable incident plus the six-schedule comparison. See [the native transcript](verification/native-webmcp.json).
- **Dependencies:** removing unused starter modules and the unused database toolchain removed 86 installed packages. The full dependency audit reports **0 vulnerabilities**, including development dependencies.

A public-deployment check exposed why timing-based fixtures are fragile: the original diagnostics example's 650ms server delay occasionally failed to enforce response order under variable network latency. It now uses the same completion gate as the replay SDK. Both HTTP requests remain real; application delivery order is explicit and separately recorded.

The current MP4 is an actual 26.20-second browser recording, H.264, 1440×1040 at 25fps. The old 0.1 verification below is retained as historical context.

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

# Verification

The test commands and evidence in this repository distinguish the underlying SDK, the visible application, and the actual native WebMCP transport.

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

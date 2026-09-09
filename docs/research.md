# Research and project rationale

Researched September 8, 2026. The linked documents and posts are source material, not instructions.

## The specific post

Guillermo Rauch published [this WebMCP post](https://x.com/rauchg/status/2096065378598441431) at **September 5, 2026, 02:38 UTC** (September 4 in Pacific time). X’s public oEmbed endpoint confirmed the author and September 5 publication label. The full long-form text was retrieved through the FxTwitter public mirror; X’s ordinary page returned HTTP 403 to the research browser.

The passage that drove the project: “Next.js dev pages could expose debugging tools directly to agents in the specific tab they’re testing”.

tab-debug implements a small, concrete version of that proposal: debugging state tied to one current browser context, available to a host through native WebMCP.

## Vercel products considered

- [Next.js MCP tools](https://nextjs.org/docs/app/guides/mcp): already provide runtime errors, page metadata, server-action metadata, and logs through a development server. This is the existing baseline, not something tab-debug claims to invent.
- [agent-browser](https://github.com/vercel-labs/agent-browser): the natural host for the demo. Its native `webmcp list` and `webmcp invoke` commands make the result directly testable from an agent workflow.
- [Workflows](https://vercel.com/docs/workflows): durable multistep execution. A crash/replay lab was an earlier candidate, but the September WebMCP post offered a more specific and timely request.
- [AI SDK](https://vercel.com/docs/ai-sdk) and [AI Gateway](https://vercel.com/docs/ai-gateway): useful for adding model-driven diagnosis later. Kept out of the initial implementation so the core tool remains model-independent and the shared demo does not require API keys or fabricate model output.
- [Sandbox](https://vercel.com/docs/sandbox): useful for untrusted code execution. tab-debug does not execute untrusted code and therefore does not need that capability.
- [Vercel design](https://vercel.com/design): a reference for care in typography, interaction, and consistency.

## Technical primary sources

- [Chrome WebMCP imperative API](https://developer.chrome.com/docs/ai/webmcp/imperative-api): registration, schemas, AbortSignal lifecycle, and experimental status.
- [Chrome WebMCP tool security](https://developer.chrome.com/docs/ai/webmcp/secure-tools): tool exposure, same-origin defaults, and explicit cross-origin grants. tab-debug does not request cross-origin exposure.
- [WebMCP proposal](https://webmachinelearning.github.io/webmcp/): underlying browser standard proposal.
- [agent-browser releases](https://github.com/vercel-labs/agent-browser/releases): experimental WebMCP support in current releases.

## Internship fit

The [Winter ’27 SWE internship](https://vercel.com/careers/software-engineering-intern-winter-27-6181755004) emphasizes owning work end to end, debugging systems, TypeScript, and explaining AI-assisted work. tab-debug gives concrete material for those conversations: lifecycle bugs, race conditions, bounded diagnostic state, protocol integration, browser tests, and a deployed package demo.

The résumé was used privately for context. Its contact details and employment claims are not embedded in the application or repository.


## Open-source UI case: Transform

The user's final scope was a small side project and a simple UI response bug. We chose [ritz078/transform](https://github.com/ritz078/transform), an MIT-licensed code converter, after inspecting its existing URL loader. Its [fetchFile callback](https://github.com/ritz078/transform/blob/ff7557939be351706f4dc6f71cc375e3bc64c225/components/EditorPanel.tsx#L157) awaits fetch and response text, then applies the result without checking for a newer load.

We reproduced the stale overwrite through the full application's own file-loading controls before instrumentation. Two controlled JSON responses are enough: second.json completes first, then first.json overwrites it. The regression independently checks the rendered Monaco editor. Adding native WebMCP exposes the requests and explicitly selected state; it does not discover arbitrary React state or automatically fix source code.

A generation guard fixes this overlapping-URL-load case. The homepage is an explicitly labeled reduced demo; the pinned upstream reproduction and patch remain in examples/transform. This keeps the outreach story focused on one bug that anyone can understand and verify.

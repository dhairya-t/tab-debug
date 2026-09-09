# A late download replaces the selected file

This is a small UI response-order bug reproduced in **ritz078/transform**, the open-source code converter. We cloned its actual app, loaded two files through its existing **Load File → Fetch URL** control, and let the first request finish last. The editor changed from `second.json` back to `first.json`. Both requests returned HTTP 200.

No bug was added. Playwright supplies two valid JSON files and controls when their responses finish. This demonstrates a possible ordering, not a measurement of how often users encounter it on the live site.

- Upstream: https://github.com/ritz078/transform
- Pinned commit: `ff7557939be351706f4dc6f71cc375e3bc64c225`
- File: [`components/EditorPanel.tsx`](https://github.com/ritz078/transform/blob/ff7557939be351706f4dc6f71cc375e3bc64c225/components/EditorPanel.tsx#L157)
- Unmodified reference copy: `upstream/EditorPanel.tsx`
- SHA-256: `56db5eda7064efe7eaed3b26cbc486b9e705c06494f944f5133fd68521ff5dd0`
- License: MIT, copyright 2019 Ritesh Kumar; retained in `upstream/LICENSE`.

## Reproduce in the full app

From a separate working directory:

```sh
git clone https://github.com/ritz078/transform.git
cd transform
git checkout ff7557939be351706f4dc6f71cc375e3bc64c225
YARN_IGNORE_ENGINES=1 npx --yes yarn@1.22.22 install --frozen-lockfile
NODE_OPTIONS=--openssl-legacy-provider node node_modules/next/dist/bin/next dev -p 3010
```

The project uses Next.js 10 / React 17. The above compatibility options were used for local verification on Node 24; upstream specifies Node 20. We did not upgrade its framework or modify its application logic to get a failing reproduction.

In the **tab-debug** repository, with dependencies installed:

```sh
node examples/transform/verify.mjs original
node examples/transform/prepare.mjs /absolute/path/to/transform
node examples/transform/verify.mjs instrumented
```

The second run executes the same file-loading UI. It additionally calls native `document.modelContext` tools and checks that they report two successful requests and `Editor1.value` containing the wrong file. Evidence and screenshots are saved under `docs/verification/transform-*.json` and `docs/media/transform-*.png`.

`prepare.mjs` adds a development-only connection in `_app.tsx` and a state registration effect in `EditorPanel.tsx`. It bundles the installed SDK for webpack 4; this legacy app predates the SDK’s Next App Router wrapper. The existing fetch callback is unchanged. Modern Next apps use the [single-wrapper setup](https://tab-debug-dhairya.vercel.app/setup).

The connection observes this local app’s own fetches and selected editor values. It does not connect to the demo author’s tabs or send telemetry.

## What this proves

HTTP success does not guarantee that the screen shows the right response. A browser agent can inspect the requests **and** the current editor value in the tab it is testing. Tab-debug provides that evidence; it does not automatically diagnose or fix the source code.

The public demo recreates **Load File → Fetch URL** and the JSON-to-YAML editor around the same loader. The scenario uses two submissions: click Fetch URL for staging.json, then enter production.json and click Fetch URL again while staging is still downloading. Editing the URL field without submitting it starts no request. Both editor panes show the same downloaded file: JSON on the left and its YAML conversion on the right. That is a plausible example of the verified overlapping-load sequence, not a reported user incident. The two sample files are fetched from this demo’s own server; the first is deliberately delayed for five seconds. Visitors can watch the walkthrough or use the URL controls themselves. **Read debugging data** presents the actual state/request tool results, with raw output available. It does not run an AI diagnosis. The evidence above comes from the full upstream app. No upstream issue or pull request has been submitted.

## Verify the fix

Apply the small patch in the Transform checkout:

```sh
git apply /absolute/path/to/tab-debug/examples/transform/fix.patch
```

Then run from tab-debug:

```sh
node examples/transform/verify.mjs fixed
```

Each URL load gets an increasing number. After reading the response body, it updates the editor only if its number is still current. Unmounting invalidates pending loads. This fixes overlapping URL loads; it does not claim to fix every possible editor or conversion race.

Verified results: original and instrumented versions display `first.json` (wrong); patched version retains `second.json` (correct). Native WebMCP agrees with the rendered editor in both instrumented runs. The regression checks the visible editor directly, independently of tab-debug.

// Run from the tab-debug repo: node examples/transform/prepare.mjs /path/to/transform
// This instruments a pinned upstream checkout without changing its fetch handler.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { build } from 'esbuild';
import assert from 'node:assert/strict';
const directory = resolve(process.argv[2] || '');
const revision = 'ff7557939be351706f4dc6f71cc375e3bc64c225';
assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { cwd: directory, encoding: 'utf8' }).trim(), revision);
const editorFile = join(directory, 'components/EditorPanel.tsx');
const appFile = join(directory, 'pages/_app.tsx');
let editor = readFileSync(editorFile, 'utf8');
let app = readFileSync(appFile, 'utf8');
assert.ok(!editor.includes('tabDebug'), 'Already instrumented; use a fresh checkout.');
const bundle = join(directory, 'utils/tabDebug.js');
await build({
  stdin: {
    contents: `import { PageScope } from '@dhairya-t/tab-debug';
import { attachBrowserTools } from '@dhairya-t/tab-debug/browser';
export const tabDebug = new PageScope();
export function connectTabDebug(route) {
  tabDebug.enterPage(route);
  return attachBrowserTools(tabDebug);
}`,
    resolveDir: resolve('.'),
  },
  outfile: bundle, bundle: true, format: 'esm', target: 'es2018',
  // Next 10's webpack 4 cannot parse modern package exports/private fields.
  // Bundle the installed SDK for this legacy app; do not change its React version.
});
editor = `import { tabDebug } from "../utils/tabDebug";\n` + editor;
editor = editor.replace('  const options = {', `  useEffect(() => {
    if (process.env.NODE_ENV === "development") {
      tabDebug.setState("Editor" + id, { value, fetchingUrl });
    }
  }, [id, value, fetchingUrl]);

  const options = {`);
app = `import { connectTabDebug } from "../utils/tabDebug";\n` + app;
app = app.replace('  const router = useRouter();', `  const router = useRouter();
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    const connection = connectTabDebug(router.pathname);
    return () => connection.dispose();
  }, [router.pathname]);`);
writeFileSync(editorFile, editor);
writeFileSync(appFile, app);
mkdirSync('docs/verification', { recursive: true });
console.log('Instrumented Transform: fetch handler unchanged; own-tab requests and selected editor state exposed.');

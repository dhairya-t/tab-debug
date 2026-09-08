import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const binary = new URL('../node_modules/.bin/agent-browser', import.meta.url)
  .pathname;
const base = process.env.TEST_BASE_URL || 'http://localhost:3000';
const session = `pagescope-contract-${Date.now()}`;
const transcript = [];
function run(args, second = false, allowError = false) {
  const command = [
    '--session',
    session + (second ? '-other' : ''),
    ...args,
    '--json',
  ];
  const result = spawnSync(binary, command, {
    encoding: 'utf8',
    timeout: 30000,
  });
  if (result.error) throw result.error;
  let data;
  try {
    data = JSON.parse(result.stdout.trim());
  } catch {
    throw new Error(result.stderr || result.stdout);
  }
  if (!allowError && (!data.success || result.status))
    throw new Error(JSON.stringify(data));
  return data;
}
function call(name, input = {}) {
  const result = run([
    'webmcp',
    'invoke',
    name,
    '--params',
    JSON.stringify(input),
  ]);
  transcript.push({ tool: name, input, result: result.data.output });
  return result.data.output;
}
try {
  run(['open', base]);
  run(['wait', '--text', 'WEBMCP LIVE']);
  const tools = run(['webmcp', 'list']).data.tools;
  assert.equal(tools.length, 5);
  assert.ok(
    tools.every(
      (t) => t.annotations.readOnly && t.annotations.untrustedContent,
    ),
  );
  const before = call('get_page_context');
  run(['find', 'role', 'button', 'click', '--name', 'Reproduce bug']);
  run(['wait', '--text', 'The bug is reproduced.']);
  const context = call('get_page_context');
  assert.match(context.latestError.label, /503/);
  const requests = call('inspect_requests');
  assert.ok(requests.events.some((e) => e.data.status === 503));
  assert.equal(call('inspect_errors').total, 1);
  assert.equal(call('inspect_state').state.Archive.resultCount, 0);
  assert.ok(call('inspect_timeline').events.some((e) => e.kind === 'error'));
  const version = call('get_page_context').eventCount;
  for (const tool of tools) {
    const invalid = run(
      ['webmcp', 'invoke', tool.name, '--params', '{"limit":0}'],
      false,
      true,
    );
    assert.ok(
      !invalid.success ||
        invalid.data?.status === 'failed' ||
        invalid.data?.rawStatus === 'Error',
    );
  }
  assert.equal(call('get_page_context').eventCount, version);
  run(['find', 'role', 'button', 'click', '--name', 'Apply fix & verify']);
  run(['wait', '--text', 'Patched run complete.']);
  assert.equal(call('inspect_state').state.Archive.resultCount, 3);
  run(['open', base], true);
  run(['wait', '--text', 'WEBMCP LIVE'], true);
  const other = run(
    ['webmcp', 'invoke', 'get_page_context', '--params', '{}'],
    true,
  ).data.output;
  assert.notEqual(before.pageId, other.pageId);
  assert.equal(other.latestError, null);
  mkdirSync('docs/verification', { recursive: true });
  writeFileSync(
    'docs/verification/native-webmcp.json',
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        transport: 'agent-browser / native Chrome WebMCP',
        baseUrl: base,
        registeredTools: tools.map((t) => ({
          name: t.name,
          annotations: t.annotations,
          inputSchema: t.inputSchema,
        })),
        validCalls: transcript.length,
        invalidInputsRejected: tools.length,
        tabIsolation: true,
        transcript,
      },
      null,
      2,
    ) + '\n',
  );
  console.log(
    'Native WebMCP verified: 5 tools, 5 invalid inputs rejected, 2 isolated tabs, HTTP failure and recovery.',
  );
} finally {
  run(['close'], false, true);
  run(['close'], true, true);
}

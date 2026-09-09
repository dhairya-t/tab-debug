import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const binary = new URL('../node_modules/.bin/agent-browser', import.meta.url)
  .pathname;
const base = new URL('/', process.env.TEST_BASE_URL || 'http://localhost:3001')
  .href;
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
  run(['wait', '--text', '1. Submit staging.json']);
  const tools = run(['webmcp', 'list']).data.tools;
  assert.equal(tools.length, 5);
  assert.ok(
    tools.every(
      (t) => t.annotations.readOnly && t.annotations.untrustedContent,
    ),
  );
  const before = call('get_page_context');
  run(['find', 'role', 'button', 'click', '--name', '1. Submit staging.json']);
  for (const name of [
    '2. Submit production.json',
    '3. Show production response',
    '4. Show staging response',
  ]) {
    run(['wait', '--text', name]);
    run(['find', 'role', 'button', 'click', '--name', name]);
  }
  run(['wait', '--text', 'The editor is showing staging.json.']);
  const context = call('get_page_context');
  assert.equal(context.latestError, null);
  const requests = call('inspect_requests');
  assert.equal(
    requests.events.filter(
      (e) => e.kind === 'response' && e.data.status === 200,
    ).length,
    2,
  );
  assert.equal(call('inspect_errors').total, 0);
  const editor = call('inspect_state').state.FileLoader;
  assert.equal(editor.selectedFile, 'production.json');
  assert.equal(editor.displayedFile, 'staging.json');
  assert.ok(call('inspect_timeline').events.some((e) => e.kind === 'action'));
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
  run(['find', 'role', 'button', 'click', '--name', 'Run with the fix']);
  for (const name of [
    '2. Submit production.json',
    '3. Show production response',
    '4. Show staging response',
  ]) {
    run(['wait', '--text', name]);
    run(['find', 'role', 'button', 'click', '--name', name]);
  }
  run(['wait', '--text', 'The older download was ignored.']);
  assert.equal(
    call('inspect_state').state.FileLoader.displayedFile,
    'production.json',
  );
  run(['open', base], true);
  run(['wait', '--text', '1. Submit staging.json'], true);
  const other = run(
    ['webmcp', 'invoke', 'get_page_context', '--params', '{}'],
    true,
  ).data.output;
  assert.notEqual(before.pageId, other.pageId);
  assert.equal(other.latestError, null);
  run(['open', new URL('/replay', base).href]);
  run(['wait', '--text', 'Capture & compare']);
  run(['find', 'role', 'button', 'click', '--name', 'Capture & compare']);
  run(['wait', '--text', 'Q2 is the first different state update.']);
  const replayState = call('inspect_state').state;
  assert.equal(replayState.Incident.format, 'pagescope.incident.v1');
  assert.equal(replayState.Replay.actual, 'namibia');
  assert.equal(replayState.Replay.expected, 'lena');
  assert.equal(replayState.Comparison.patched.passed, true);
  run(['click', '.schedule-intro button']);
  run(['wait', '--text', '4/6 original failures']);
  assert.equal(call('inspect_state').state.ScheduleCoverage.patchedFailures, 0);
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
        portableIncidentOverNativeTransport: true,
        exhaustiveSchedules: 6,
        transcript,
      },
      null,
      2,
    ) + '\n',
  );
  console.log(
    'Native WebMCP verified: 5 tools, 5 invalid inputs rejected, 2 isolated tabs, real URL race and fixed editor.',
  );
} finally {
  run(['close'], false, true);
  run(['close'], true, true);
}

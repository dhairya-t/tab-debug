'use client';
// Loader adapted from ritz078/transform, MIT, copyright 2019 Ritesh Kumar.
// Full notice: public/THIRD_PARTY_NOTICES.txt. Original app verified separately.
import { useEffect, useRef, useState } from 'react';
import { Terminal, ArrowUpRight, ArrowRight, Check, Play } from 'lucide-react';
import {
  TabDebugProvider,
  useDebug,
  useDebugState,
} from '@dhairya-t/tab-debug/react';
import './race-lab.css';
import './transform-demo.css';

const source =
  'https://github.com/ritz078/transform/blob/ff7557939be351706f4dc6f71cc375e3bc64c225/components/EditorPanel.tsx#L157';
const evidence =
  'https://github.com/dhairya-t/tab-debug/tree/main/examples/transform';
type FileName = 'first.json' | 'second.json';
type Tool = 'inspect_state' | 'inspect_requests';

function FileLoader() {
  const debug = useDebug();
  const [value, setValue] = useState('');
  const [selected, setSelected] = useState<FileName | null>(null);
  const [busy, setBusy] = useState(false);
  const [fixed, setFixed] = useState(false);
  const [error, setError] = useState('');
  const [completed, setCompleted] = useState<FileName[]>([]);
  const [discarded, setDiscarded] = useState(false);
  const [tool, setTool] = useState<Tool>('inspect_state');
  const [toolResult, setToolResult] = useState<string | null>(null);
  const [transport, setTransport] = useState('');
  const [reading, setReading] = useState(false);
  const latest = useRef(0);
  const running = useRef(false);
  const lifecycle = useRef<AbortController | null>(null);
  const displayed = value
    ? (JSON.parse(value) as { file: FileName }).file
    : null;
  useDebugState('FileLoader', {
    selectedFile: selected,
    displayedFile: displayed,
    value,
    loading: busy,
    implementation: fixed ? 'fixed' : 'original',
    discardedOlderResponse: discarded,
  });
  useEffect(
    () => () => {
      latest.current++;
      lifecycle.current?.abort();
    },
    [],
  );

  async function run(guarded: boolean) {
    if (running.current) return;
    running.current = true;
    const controller = new AbortController();
    lifecycle.current = controller;
    setFixed(guarded);
    setBusy(true);
    setValue('');
    setError('');
    setCompleted([]);
    setDiscarded(false);
    setToolResult(null);
    debug?.enterPage('/');
    // Reduced from Transform's fetchFile callback. The full, unmodified app
    // and a patch against its pinned revision are verified separately.
    async function load(file: FileName) {
      setSelected(file);
      const loadId = ++latest.current;
      debug?.record('action', 'Load file', { file });
      const res = await fetch(`/api/transform-file/${file}`, {
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`File request failed (${res.status})`);
      const nextValue = await res.text();
      setCompleted((previous) => [...previous, file]);
      if (guarded && loadId !== latest.current) {
        setDiscarded(true);
        debug?.record('discard', 'Older download ignored', { file });
        return;
      }
      setValue(nextValue);
    }
    try {
      // Both requests start before either finishes; the endpoint delays the first.
      const first = load('first.json');
      const second = load('second.json');
      const results = await Promise.allSettled([first, second]);
      const rejected = results.find((r) => r.status === 'rejected');
      if (rejected?.status === 'rejected') throw rejected.reason;
    } catch (cause) {
      if (!controller.signal.aborted) {
        const message = cause instanceof Error ? cause.message : String(cause);
        setError(message);
        debug?.captureError(cause, 'FileLoader');
      }
    } finally {
      running.current = false;
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  async function inspect(name: Tool) {
    setReading(true);
    setToolResult(null);
    setTool(name);
    const context = (
      document as unknown as {
        modelContext?: {
          getTools?: () => Promise<Array<{ name: string }>>;
          executeTool?: (
            tool: { name: string },
            input: string,
          ) => Promise<string>;
        };
      }
    ).modelContext;
    try {
      if (context?.getTools && context.executeTool) {
        const registered = (await context.getTools()).find(
          (t) => t.name === name,
        );
        if (registered) {
          const result = await context.executeTool(registered, '{}');
          setToolResult(JSON.stringify(JSON.parse(result), null, 2));
          setTransport('Read through native WebMCP');
          return;
        }
      }
      setToolResult(JSON.stringify(debug?.callTool(name, {}), null, 2));
      setTransport('Local preview · browser agents use WebMCP');
    } catch (cause) {
      setToolResult(cause instanceof Error ? cause.message : String(cause));
      setTransport('Tool call failed');
    } finally {
      setReading(false);
    }
  }
  const finished = !busy && completed.length === 2 && !error;
  const wrong = finished && displayed !== selected;
  return (
    <>
      <section className="file-demo" aria-label="Transform file loading demo">
        <div className="file-demo-toolbar">
          <span>
            <span className="file-dot" /> Transform / Load file
          </span>
          <span>{fixed ? 'With the fix' : 'Original behavior'}</span>
        </div>
        <div className="file-demo-body">
          <div className="file-actions">
            <p>
              Load <code>first.json</code>, then <code>second.json</code>. The
              first download finishes last.
            </p>
            <button
              className="file-primary"
              onClick={() => run(false)}
              disabled={busy || reading || !debug}
            >
              <Play size={14} /> {busy ? 'Loading files…' : 'Reproduce bug'}
            </button>
            <button
              className="file-secondary"
              onClick={() => run(true)}
              disabled={busy || reading || !debug}
            >
              <Check size={16} /> Run with fix
            </button>
            <dl className="file-facts">
              <div>
                <dt>Last selected</dt>
                <dd data-testid="selected-file">{selected || '—'}</dd>
              </div>
              <div>
                <dt>Showing</dt>
                <dd
                  data-testid="displayed-file"
                  className={wrong ? 'file-wrong' : ''}
                >
                  {displayed || '—'}
                </dd>
              </div>
              <div>
                <dt>Finished in order</dt>
                <dd data-testid="response-order">
                  {completed.join(' → ') || '—'}
                </dd>
              </div>
            </dl>
          </div>
          <div className="file-editor">
            <div className="file-editor-tab">
              JSON <span>Editor contents</span>
            </div>
            <pre aria-label="Loaded file contents">
              {value || '// The downloaded file appears here.'}
            </pre>
            <div
              className={`file-outcome ${wrong ? 'file-outcome-wrong' : ''}`}
              role="status"
            >
              {error ||
                (busy
                  ? 'Waiting for both responses…'
                  : wrong
                    ? 'The older file replaced your selection.'
                    : finished && discarded
                      ? 'The older response was ignored. Your selection stays.'
                      : finished
                        ? 'Your selection stayed. Run again to try the delayed response.'
                        : 'Two successful requests can still leave the wrong file on screen.')}
            </div>
          </div>
        </div>
      </section>
      <section className="file-inspector" aria-label="Agent tools">
        <div className="file-inspector-heading">
          <h3>What the agent can read</h3>
          <div>
            <button
              disabled={reading}
              onClick={() => inspect('inspect_state')}
              aria-pressed={toolResult !== null && tool === 'inspect_state'}
            >
              Read state
            </button>
            <button
              disabled={reading}
              onClick={() => inspect('inspect_requests')}
              aria-pressed={toolResult !== null && tool === 'inspect_requests'}
            >
              Read requests
            </button>
          </div>
        </div>
        {toolResult ? (
          <>
            <div className="file-tool-label">
              <code>{tool}</code>
              <span>{transport}</span>
            </div>
            <pre className="file-tool-result" data-testid="tool-result">
              {toolResult}
            </pre>
          </>
        ) : (
          <p>
            After a run, inspect the editor value and the two HTTP responses.
            These are the same tools exposed to a WebMCP-capable browser agent.
          </p>
        )}
      </section>
    </>
  );
}

export default function TransformDemo() {
  return (
    <div className="replay-app">
      <header className="lab-header">
        <a className="lab-brand" href="/">
          <Terminal size={21} />
          tab-debug
        </a>
        <nav>
          <a href="/setup">
            Add to your app <ArrowRight size={14} />
          </a>
          <a href="https://github.com/dhairya-t/tab-debug">
            GitHub <ArrowUpRight size={13} />
          </a>
        </nav>
      </header>
      <main className="file-main">
        <section className="file-intro">
          <h1>Debug the page your agent is testing.</h1>
          <p>
            Give your coding agent access to your app’s requests, errors, and
            the state you choose to share. Useful when requests succeed but the
            screen is wrong.
          </p>
          <a href="/setup">
            One component in your Next.js layout <ArrowRight size={15} />
          </a>
        </section>
        <section className="file-case">
          <h2>
            A bug in{' '}
            <a href="https://github.com/ritz078/transform">
              Transform <ArrowUpRight size={16} />
            </a>
          </h2>
          <p>
            Load two files in this open-source code converter, and an older
            download can replace the one you chose last.
          </p>
          <div className="file-case-source">
            <span>Reproduced in the original app. Simplified demo below.</span>
            <a href={evidence}>Reproduction & fix ↗</a>
            <a href={source}>Upstream code ↗</a>
          </div>
        </section>
        <TabDebugProvider enabled route="/">
          <FileLoader />
        </TabDebugProvider>
        <div className="file-notes">
          <p>
            This demo deliberately delays the first response. The bug existed in
            Transform’s code; the delay makes it repeatable. The fix checks that
            a download is still the newest before updating the editor.
          </p>
          <p>
            <a href="/setup">Install in your own app</a> to expose that app’s
            own tab. No account or separate MCP server. No connection to my
            tabs. Native WebMCP requires a compatible browser.
          </p>
        </div>
        <footer className="file-footer">
          <span>
            Built by <a href="https://github.com/dhairya-t">Dhairya Thakkar</a>{' '}
            · MIT
          </span>
          <a href="/replay">Response replay experiments ↗</a>
        </footer>
      </main>
    </div>
  );
}

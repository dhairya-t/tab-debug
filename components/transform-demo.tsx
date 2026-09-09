'use client';
// URL loader adapted from ritz078/transform, MIT, copyright 2019 Ritesh Kumar.
// Full notice: public/THIRD_PARTY_NOTICES.txt. Full upstream app verified separately.
import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Loader2,
  Play,
  Upload,
  X,
} from 'lucide-react';
import { SiteHeader } from './site-header';
import {
  TabDebugProvider,
  useDebug,
  useDebugState,
} from '@dhairya-t/tab-debug/react';
import './transform-demo.css';

const evidence =
  'https://github.com/dhairya-t/tab-debug/tree/main/examples/transform';
const source =
  'https://github.com/ritz078/transform/blob/ff7557939be351706f4dc6f71cc375e3bc64c225/components/EditorPanel.tsx#L157';
type FileName = 'staging.json' | 'production.json';
type Run = {
  controller: AbortController;
  guarded: boolean;
  latest: number;
  pending: number;
};
type Download = {
  id: number;
  file: FileName;
  status?: number;
  ignored?: boolean;
  failed?: boolean;
};
type EditorState = {
  selectedFile: FileName | null;
  displayedFile: FileName | null;
  discardedOlderResponse: boolean;
};
type ToolOutput = {
  state?: { FileLoader?: EditorState };
  events?: {
    kind: string;
    seq: number;
    label: string;
    data: {
      path?: string;
      status?: number;
      requestId?: number;
      durationMs?: number;
    };
  }[];
};
type Evidence = { state: ToolOutput; requests: ToolOutput; transport: string };
const filePath = (file: FileName) => `/api/transform-file/${file}`;
const pause = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', finish);
      resolve();
    };
    const timer = setTimeout(finish, ms);
    signal.addEventListener('abort', finish, { once: true });
    if (signal.aborted) finish();
  });

function CodeView({ text, label }: { text: string; label: string }) {
  return (
    <pre className="tf-code" aria-label={label}>
      {text ? (
        text.split('\n').map((line, i) => (
          <span className="tf-code-line" key={i}>
            <span aria-hidden="true" className="tf-line-number">
              {i + 1}
            </span>
            <code>
              {line.split(/("[^"\n]*"|true|false)/g).map((part, n) => (
                <span
                  key={n}
                  className={
                    part.startsWith('"')
                      ? 'tf-string'
                      : part === 'true' || part === 'false'
                        ? 'tf-boolean'
                        : undefined
                  }
                >
                  {part}
                </span>
              ))}
            </code>
          </span>
        ))
      ) : (
        <span className="tf-code-placeholder">
          {label === 'JSON input'
            ? '// Load a JSON file to begin.'
            : '# Converted YAML appears here.'}
        </span>
      )}
    </pre>
  );
}

function FileLoader() {
  const debug = useDebug();
  const [value, setValue] = useState('');
  const [selected, setSelected] = useState<FileName | null>(null);
  const [pending, setPending] = useState(0);
  const [guided, setGuided] = useState(false);
  const [fixed, setFixed] = useState(false);
  const [error, setError] = useState('');
  const [downloads, setDownloads] = useState<Download[]>([]);
  const [discarded, setDiscarded] = useState(false);
  const [popover, setPopover] = useState(false);
  const [url, setUrl] = useState(filePath('staging.json'));
  const [reading, setReading] = useState(false);
  const [data, setData] = useState<Evidence | null>(null);
  const [readError, setReadError] = useState('');
  const run = useRef<Run | null>(null);
  const walking = useRef(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const loadButton = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const parsed = value
    ? (JSON.parse(value) as Record<string, string | boolean>)
    : null;
  const displayed = (parsed?.file as FileName | undefined) || null;
  const yaml = parsed
    ? Object.entries(parsed)
        .map(([key, v]) => `${key}: ${JSON.stringify(v)}`)
        .join('\n')
    : '';
  const busy = pending > 0 || guided;
  const finished = !busy && !!displayed && !error;
  const wrong = finished && displayed !== selected;
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
      run.current?.controller.abort();
      run.current = null;
    },
    [],
  );
  useEffect(() => {
    if (!popover || guided) return;
    inputRef.current?.focus();
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setPopover(false);
        loadButton.current?.focus();
      }
    };
    const outside = (event: PointerEvent) => {
      if (
        !popoverRef.current?.contains(event.target as Node) &&
        !loadButton.current?.contains(event.target as Node)
      )
        setPopover(false);
    };
    document.addEventListener('keydown', dismiss);
    document.addEventListener('pointerdown', outside);
    return () => {
      document.removeEventListener('keydown', dismiss);
      document.removeEventListener('pointerdown', outside);
    };
  }, [popover, guided]);

  function reset(guarded: boolean) {
    run.current?.controller.abort();
    const next: Run = {
      controller: new AbortController(),
      guarded,
      latest: 0,
      pending: 0,
    };
    run.current = next;
    setValue('');
    setSelected(null);
    setPending(0);
    setFixed(guarded);
    setError('');
    setDownloads([]);
    setDiscarded(false);
    setData(null);
    setReadError('');
    setUrl(filePath('staging.json'));
    debug?.enterPage('/');
    return next;
  }

  async function load(file: FileName, current: Run) {
    if (current.controller.signal.aborted || run.current !== current) return;
    const id = ++current.latest;
    current.pending++;
    setSelected(file);
    setPending(current.pending);
    setData(null);
    setDownloads((previous) => [...previous, { id, file }]);
    debug?.record('action', 'Fetch URL', { file });
    try {
      // Same overlapping URL-load behavior as the upstream callback. The fixed
      // branch adds the request-generation check from examples/transform/fix.patch.
      const res = await fetch(filePath(file), {
        signal: current.controller.signal,
      });
      if (!res.ok) throw new Error(`File request failed (${res.status})`);
      const nextValue = await res.text();
      JSON.parse(nextValue);
      if (run.current !== current || current.controller.signal.aborted) return;
      const ignored = current.guarded && id !== current.latest;
      setDownloads((previous) =>
        previous.map((d) =>
          d.id === id ? { ...d, status: res.status, ignored } : d,
        ),
      );
      if (ignored) {
        setDiscarded(true);
        debug?.record('discard', 'Older download ignored', { file });
        return;
      }
      setValue(nextValue);
      setPopover(false);
    } catch (cause) {
      if (run.current === current && !current.controller.signal.aborted) {
        setError(cause instanceof Error ? cause.message : String(cause));
        setDownloads((previous) =>
          previous.map((d) => (d.id === id ? { ...d, failed: true } : d)),
        );
        debug?.captureError(cause, 'FileLoader');
      }
    } finally {
      current.pending--;
      if (run.current === current && !current.controller.signal.aborted)
        setPending(current.pending);
    }
  }

  async function walkthrough(guarded: boolean) {
    if (walking.current || pending || reading || !debug) return;
    walking.current = true;
    const current = reset(guarded);
    setGuided(true);
    setPopover(true);
    try {
      await pause(350, current.controller.signal);
      const first = load('staging.json', current);
      await pause(850, current.controller.signal);
      if (current.controller.signal.aborted) return;
      setUrl(filePath('production.json'));
      await pause(500, current.controller.signal);
      const second = load('production.json', current);
      await Promise.allSettled([first, second]);
    } finally {
      walking.current = false;
      if (run.current === current) {
        setGuided(false);
        setPopover(false);
      }
    }
  }

  function submitUrl(event: React.FormEvent) {
    event.preventDefault();
    if (guided || reading || !debug) return;
    let chosen: URL;
    try {
      chosen = new URL(url, location.origin);
    } catch {
      setError('Choose one of the two sample URLs below.');
      return;
    }
    const file = (['staging.json', 'production.json'] as const).find(
      (name) =>
        chosen.origin === location.origin && chosen.pathname === filePath(name),
    );
    if (!file) {
      setError('This reproduction loads only the two sample URLs below.');
      return;
    }
    setError('');
    const current = run.current || reset(false);
    void load(file, current);
  }

  async function inspect() {
    if (busy || reading || !debug) return;
    setReading(true);
    setData(null);
    setReadError('');
    const current = run.current;
    const context = (
      document as unknown as {
        modelContext?: {
          getTools?: () => Promise<{ name: string }[]>;
          executeTool?: (
            tool: { name: string },
            input: string,
          ) => Promise<string>;
        };
      }
    ).modelContext;
    try {
      const tools = context?.getTools ? await context.getTools() : [];
      const names = ['inspect_state', 'inspect_requests'] as const;
      const native =
        !!context?.executeTool &&
        names.every((name) => tools.some((tool) => tool.name === name));
      const results = await Promise.all(
        names.map(async (name) =>
          native
            ? (JSON.parse(
                await context!.executeTool!(
                  tools.find((tool) => tool.name === name)!,
                  '{}',
                ),
              ) as ToolOutput)
            : (debug.callTool(name, {}) as ToolOutput),
        ),
      );
      if (run.current !== current) return;
      setData({
        state: results[0],
        requests: results[1],
        transport: native
          ? 'Read through native WebMCP'
          : 'Local preview · browser agents read the same tools through WebMCP',
      });
    } catch (cause) {
      setReadError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setReading(false);
    }
  }
  const observed = data?.state.state?.FileLoader;
  const responses =
    data?.requests.events?.filter((event) => event.kind === 'response') || [];
  const status =
    error ||
    (busy
      ? displayed === 'production.json'
        ? 'production.json is ready. The first download is still running…'
        : selected === 'production.json'
          ? 'You corrected the URL. Waiting for production.json…'
          : selected
            ? 'The staging URL is slow. You meant to load production.json.'
            : 'Opening Load File…'
      : wrong
        ? 'You asked for production.json. The editor is showing staging.json.'
        : finished && discarded
          ? 'production.json stays in the editor. The older download was ignored.'
          : displayed
            ? `${displayed} is in the editor.`
            : 'Watch the URL correction, or use Load File to try it yourself.');

  return (
    <>
      <div className="tf-demo-controls">
        <div className="tf-run-actions">
          <button
            className="tf-primary"
            onClick={() => walkthrough(false)}
            disabled={busy || reading || !debug}
          >
            {busy && !fixed ? (
              <Loader2 size={15} className="tf-spin" />
            ) : (
              <Play size={14} />
            )}
            {busy && !fixed
              ? 'Playing…'
              : downloads.length
                ? 'Watch again'
                : 'Watch the bug'}
          </button>
          {downloads.length > 0 && (
            <button
              className="tf-fix-button"
              onClick={() => walkthrough(true)}
              disabled={busy || reading || !debug}
            >
              {busy && fixed ? (
                <Loader2 size={15} className="tf-spin" />
              ) : (
                <Check size={16} />
              )}{' '}
              Run with the fix
            </button>
          )}
        </div>
        <span>
          {fixed ? 'Patched loader' : 'Original loader'} · Two real HTTP
          requests
        </span>
      </div>
      <section
        className={`tf-window ${wrong ? 'tf-has-bug' : ''}`}
        aria-label="Transform file loading demo"
      >
        <div className="tf-titlebar">
          <span className="tf-wordmark">transform</span>
          <span>
            JSON → YAML{' '}
            <span className="tf-recreation">/ interactive reproduction</span>
          </span>
          <a
            href="https://transform.tools/json-to-yaml"
            target="_blank"
            rel="noreferrer"
          >
            Original app <ArrowUpRight size={13} />
          </a>
        </div>
        <div className="tf-editors">
          <section className="tf-editor">
            <div className="tf-editor-toolbar">
              <span>
                JSON{' '}
                <small data-testid="displayed-file">
                  {displayed || 'No file loaded'}
                </small>
              </span>
              <button
                ref={loadButton}
                onClick={() => setPopover(!popover)}
                disabled={guided || reading || !debug}
                aria-expanded={popover}
                aria-controls="tf-load-file"
              >
                <Upload size={14} /> Load File
              </button>
            </div>
            {popover && (
              <div
                className="tf-load-popover"
                id="tf-load-file"
                ref={popoverRef}
              >
                <div className="tf-popover-heading">
                  <strong>Load from URL</strong>
                  <button
                    aria-label="Close file loader"
                    disabled={guided}
                    onClick={() => {
                      setPopover(false);
                      loadButton.current?.focus();
                    }}
                  >
                    <X size={15} />
                  </button>
                </div>
                <form onSubmit={submitUrl}>
                  <label htmlFor="tf-url">File URL</label>
                  <div className="tf-url-input">
                    <input
                      ref={inputRef}
                      id="tf-url"
                      value={url}
                      onChange={(event) => setUrl(event.target.value)}
                      disabled={guided || reading}
                    />
                    <button type="submit" disabled={guided || reading}>
                      Fetch URL
                    </button>
                  </div>
                </form>
                <div className="tf-sample-urls">
                  <span>Sample files</span>
                  {(['staging.json', 'production.json'] as const).map(
                    (name) => (
                      <button
                        key={name}
                        disabled={guided || reading}
                        onClick={() => {
                          setUrl(filePath(name));
                          inputRef.current?.focus();
                        }}
                      >
                        {name}
                        <small>
                          {name === 'staging.json' ? 'slow' : 'fast'}
                        </small>
                      </button>
                    ),
                  )}
                </div>
              </div>
            )}
            <CodeView text={value} label="JSON input" />
          </section>
          <section className="tf-editor">
            <div className="tf-editor-toolbar">
              <span>YAML</span>
              <span className="tf-output-label">Converted from the editor</span>
            </div>
            <CodeView text={yaml} label="YAML output" />
          </section>
        </div>
        <div className="tf-downloads" aria-label="Downloads">
          {downloads.length ? (
            downloads.map((download) => (
              <div
                className={`tf-download ${download.status ? 'tf-download-done' : ''}`}
                key={download.id}
              >
                {download.failed ? (
                  <X size={14} />
                ) : download.status ? (
                  <Check size={14} />
                ) : (
                  <Loader2 size={14} className="tf-spin" />
                )}
                <code>{download.file}</code>
                <span>
                  {download.failed
                    ? 'Failed'
                    : download.ignored
                      ? '200 · ignored'
                      : download.status
                        ? `${download.status} · loaded`
                        : 'Downloading…'}
                </span>
              </div>
            ))
          ) : (
            <span className="tf-download-placeholder">
              Downloads will appear here.
            </span>
          )}
        </div>
        <div
          className={`tf-status ${wrong ? 'tf-status-wrong' : discarded && finished ? 'tf-status-fixed' : ''}`}
          role="status"
        >
          {wrong ? <span className="tf-status-dot" /> : null}
          {status}
        </div>
      </section>
      <div className="td-evidence" aria-label="What tab-debug adds">
        <div className="td-evidence-intro">
          <div>
            <h3>What your agent can read</h3>
            <p>
              A 200 status doesn’t explain the wrong file. Your agent also needs
              the last URL you chose and the editor’s current value.
            </p>
          </div>
          <button
            className="tf-primary"
            onClick={inspect}
            disabled={busy || reading || !displayed}
          >
            {reading ? (
              <Loader2 size={15} className="tf-spin" />
            ) : (
              <ArrowRight size={16} />
            )}
            {reading ? 'Reading…' : 'Read debugging data'}
          </button>
        </div>
        {readError && <p role="alert">{readError}</p>}
        {data && (
          <div className="td-readout" data-testid="debug-evidence">
            <div className="td-readout-meta">
              <code>inspect_requests + inspect_state</code>
              <span>{data.transport}</span>
            </div>
            <div className="td-readout-grid">
              <div className="td-request-list">
                <span className="td-readout-label">
                  Responses, in completion order
                </span>
                {responses.map((response) => (
                  <div key={response.seq}>
                    <code>
                      {data.requests.events
                        ?.find(
                          (request) =>
                            request.kind === 'request' &&
                            request.seq === response.data.requestId,
                        )
                        ?.data.path?.split('/')
                        .pop() || response.label}
                    </code>
                    <span>
                      {response.data.status}{' '}
                      {response.data.status && response.data.status < 300
                        ? 'OK'
                        : 'failed'}
                    </span>
                  </div>
                ))}
              </div>
              <dl className="td-state-list">
                <div>
                  <dt>Last URL chosen</dt>
                  <dd data-testid="selected-file">
                    {observed?.selectedFile || '—'}
                  </dd>
                </div>
                <div>
                  <dt>File in the editor</dt>
                  <dd>{observed?.displayedFile || '—'}</dd>
                </div>
                <div>
                  <dt>Matches your choice</dt>
                  <dd
                    className={
                      observed?.selectedFile !== observed?.displayedFile
                        ? 'td-mismatch'
                        : 'td-match'
                    }
                  >
                    {observed?.selectedFile === observed?.displayedFile
                      ? 'Yes'
                      : 'No'}
                  </dd>
                </div>
              </dl>
            </div>
            <p className="td-finding">
              {observed?.selectedFile !== observed?.displayedFile
                ? 'The older response finished last and replaced the file you wanted. Your agent can now investigate the loader with this evidence.'
                : observed?.discardedOlderResponse
                  ? 'The same responses arrived, but the loader ignored the older one. The editor still matches your last choice.'
                  : 'The editor matches the last URL chosen.'}
            </p>
            <details>
              <summary>Raw tool output</summary>
              <pre data-testid="tool-result">
                {JSON.stringify(
                  {
                    inspect_requests: data.requests,
                    inspect_state: data.state,
                  },
                  null,
                  2,
                )}
              </pre>
            </details>
            <p className="td-honest-note">
              Live tool results, with a readable summary. No AI diagnosis is
              running in this demo.
            </p>
          </div>
        )}
      </div>
    </>
  );
}

export default function TransformDemo() {
  return (
    <div className="transform-page">
      <SiteHeader current="transform" />
      <main className="transform-main">
        <section className="td-intro">
          <h1>
            Browser debugging
            <br />
            for coding agents.
          </h1>
          <div>
            <p>
              tab-debug gives your coding agent the requests, errors, and app
              state from the browser page it’s testing, through WebMCP.
            </p>
            <a href="/setup">
              Add it to your app <ArrowRight size={15} />
            </a>
          </div>
        </section>
        <section className="td-case-intro" aria-labelledby="case-title">
          <div className="td-case-heading">
            <h2 id="case-title">A file-loading bug in Transform</h2>
            <a href={evidence}>
              Reproduced in Transform <ArrowUpRight size={14} />
            </a>
          </div>
          <p>
            For example: you’re{' '}
            <a href="https://transform.tools/json-to-yaml">
              converting JSON to YAML
            </a>{' '}
            and paste a staging URL by mistake. While it’s downloading, you
            correct it to production. The right file loads, then the slower
            staging download replaces it.
          </p>
        </section>
        <TabDebugProvider enabled route="/">
          <FileLoader />
        </TabDebugProvider>
        <div className="td-method">
          <details>
            <summary>Source & reproduction notes</summary>
            <p>
              I reproduced the overlapping URL loads in{' '}
              <a href={source}>Transform’s original code</a>. This smaller
              version uses two sample files and delays the first response by
              five seconds. The staging/production example illustrates how
              someone could encounter it.
            </p>
            <a href={evidence}>Full app verification and source ↗</a>
          </details>
          <details>
            <summary>What changes in the fix?</summary>
            <p>
              Number each URL load. Before updating the editor, check that its
              number still belongs to the latest load. An older response can
              finish successfully without replacing the current file.
            </p>
            <pre>
              <span>const loadId = ++latest.current;</span>
              {'\n'}const response = await fetch(url);{'\n'}const text = await
              response.text();{'\n'}
              <strong>if (loadId !== latest.current) return;</strong>
              {'\n'}setValue(text);
            </pre>
            <a href={evidence}>Full reproduction, patch, and tests ↗</a>
          </details>
        </div>
        <footer className="td-footer">
          <span>
            <a href="https://github.com/dhairya-t">Dhairya Thakkar</a> · MIT
          </span>
          <a href="/replay">
            One more example: a search race <ArrowRight size={14} />
          </a>
        </footer>
      </main>
    </div>
  );
}

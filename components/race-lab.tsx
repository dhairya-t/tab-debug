'use client';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  ArrowUpRight,
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Crosshair,
  Download,
  FileCode2,
  Loader2,
  Play,
  Radio,
  RotateCcw,
  Upload,
  X,
  Package,
  Terminal,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  PageScope,
  toolNames,
  type ToolName,
} from '@/packages/tab-debug/src/core';
import { useWebMCP } from '@/packages/tab-debug/src/react';
import {
  generatePlaywright,
  installReplayTarget,
  parseIncident,
  permutations,
  readPath,
  replay,
  type Checkpoint,
  type Incident,
  type Json,
  type ReplayResult,
} from '@/packages/tab-debug/src/replay';
import { captureIncident } from '@/lib/lab/capture';
import {
  appIds,
  createModel,
  destinations,
  type AppKind,
  type Variant,
} from '@/lib/lab/models';
import { photos } from '@/lib/demo/data';
import './race-lab.css';

type Pair = { original: ReplayResult; patched: ReplayResult };
type ScheduleResult = { order: string[]; original: boolean; patched: boolean };
const repo = 'https://github.com/dhairya-t/tab-debug';
const pause = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));
const pretty = (value: unknown) =>
  value === undefined
    ? '—'
    : typeof value === 'string'
      ? value || '—'
      : JSON.stringify(value);
function save(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function ResultView({
  app,
  frame,
  initial,
}: {
  app: AppKind;
  frame?: Checkpoint;
  initial: boolean;
}) {
  const state = (frame?.state ?? {}) as Record<string, Json>;
  if (app === 'shipping')
    return (
      <div className="shipping-preview">
        <div className="parcel-icon">
          <Package size={42} strokeWidth={1} />
        </div>
        <div className="parcel-name">
          <span>Order #1042</span>
          <strong>Shipping</strong>
        </div>
        <dl>
          <div>
            <dt>Deliver to</dt>
            <dd>{String(state.destination || 'France')}</dd>
          </div>
          <div>
            <dt>Quote for</dt>
            <dd>{String(state.quotedDestination || 'Awaiting quote')}</dd>
          </div>
          <div>
            <dt>Delivery</dt>
            <dd>{state.days ? `${state.days} business days` : '—'}</dd>
          </div>
          <div className="shipping-total">
            <dt>Shipping</dt>
            <dd>
              {state.cents ? `$${(Number(state.cents) / 100).toFixed(2)}` : '—'}
            </dd>
          </div>
        </dl>
      </div>
    );
  const ids = Array.isArray(state.ids) ? state.ids : [];
  const chosen = initial
    ? photos.slice(0, 2)
    : photos.filter((p) => ids.includes(p.id));
  return (
    <div className="atlas-preview">
      <div className="mini-atlas-head">
        <span>Archive</span>
        <span>Satellite images</span>
      </div>
      <div className="mini-query">
        <span>
          Search <strong>{String(state.query || 'all observations')}</strong>
        </span>
        <span>
          Showing{' '}
          <strong>
            {String(state.appliedQuery || (initial ? 'all' : '…'))}
          </strong>
        </span>
      </div>
      <div className={`lab-images ${chosen.length === 1 ? 'single' : ''}`}>
        {chosen.length ? (
          chosen.map((photo) => (
            <figure key={photo.id}>
              <img src={photo.image} alt={photo.alt} />
              <figcaption>{photo.title}</figcaption>
            </figure>
          ))
        ) : (
          <div className="lab-empty">
            {Number(state.pending)
              ? 'Waiting for responses…'
              : 'No observations for this query.'}
          </div>
        )}
      </div>
    </div>
  );
}

export default function RaceLab({ app = 'atlas' }: { app?: AppKind }) {
  const [scope] = useState(() => new PageScope({ capacity: 240 }));
  useSyncExternalStore(scope.subscribe, scope.getVersion, () => 0);
  const native = useWebMCP(scope);
  const [ready, setReady] = useState(false);
  const [inputs, setInputs] = useState<string[]>(
    app === 'atlas'
      ? ['namibia', 'atlantic', 'lena']
      : ['Canada', 'Japan', 'France'],
  );
  const [order, setOrder] = useState(['Q3', 'Q2', 'Q1']);
  const [incident, setIncident] = useState<Incident | null>(null);
  const [pair, setPair] = useState<Pair | null>(null);
  const [live, setLive] = useState<{
    original?: Checkpoint;
    patched?: Checkpoint;
  }>({});
  const [cursor, setCursor] = useState(3);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [matrix, setMatrix] = useState<ScheduleResult[]>([]);
  const [matrixMs, setMatrixMs] = useState(0);
  const [tool, setTool] = useState<ToolName>('get_page_context');
  const [toolResult, setToolResult] = useState<unknown>(null);
  const [variant, setVariant] = useState<Variant>('original');
  const [origin, setOrigin] = useState('https://tab-debug-dhairya.vercel.app');
  const abort = useRef<AbortController | null>(null);
  const occupied = useRef(false);
  const importRef = useRef<HTMLInputElement>(null);
  const variantRef = useRef<Variant>('original');

  const report = useCallback(
    (recording: Incident, result: ReplayResult, implementation: Variant) => {
      scope.setState('Incident', recording);
      scope.setState('Replay', {
        app: recording.appId,
        implementation,
        completionOrder: recording.order,
        passed: result.passed,
        expected: result.expected,
        actual: result.actual,
        finalState: result.finalState,
      });
      if (!result.passed)
        scope.captureError(
          new Error(
            `Invariant failed: expected ${pretty(result.expected)}, observed ${pretty(result.actual)}`,
          ),
          'Replay assertion',
        );
      scope.record('action', 'Regression assertion evaluated', {
        implementation,
        passed: result.passed,
      });
    },
    [scope],
  );

  useEffect(() => {
    scope.enterPage(app === 'atlas' ? '/' : '/shipping');
    setOrigin(location.origin);
    const selected =
      new URL(location.href).searchParams.get('implementation') === 'patched'
        ? 'patched'
        : 'original';
    variantRef.current = selected;
    setVariant(selected);
    scope.setState('Application', { id: appIds[app], replayTarget: selected });
    const dispose = installReplayTarget({
      appId: appIds[app],
      replay: async (recording) => {
        if (occupied.current) throw new Error('The workbench is busy');
        occupied.current = true;
        setBusy('Running exported regression');
        try {
          setIncident(recording);
          setOrder(recording.order);
          const current = variantRef.current;
          const result = await replay(recording, createModel(app, current), {
            onCheckpoint: (frame) => {
              setLive((previous) => ({ ...previous, [current]: frame }));
            },
          });
          setPair(null);
          report(recording, result, current);
          setCursor(recording.order.length);
          return result;
        } finally {
          occupied.current = false;
          setBusy('');
        }
      },
    });
    setReady(true);
    return () => {
      abort.current?.abort();
      dispose();
    };
  }, [app, report, scope]);

  const compare = async (recording: Incident, animate = true) => {
    setPair(null);
    setLive({});
    setCursor(recording.order.length);
    const controller = abort.current ?? new AbortController();
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    // This delay only makes state transitions legible. The completion gate establishes ordering.
    const pace = async () => {
      if (animate && !reduced) await pause(380);
    };
    const original = await replay(recording, createModel(app, 'original'), {
      signal: controller.signal,
      onCheckpoint: async (frame) => {
        setLive((previous) => ({ ...previous, original: frame }));
        scope.record('state', `Original / ${frame.step}`, frame.state);
        await pace();
      },
    });
    const patched = await replay(recording, createModel(app, 'patched'), {
      signal: controller.signal,
      onCheckpoint: async (frame) => {
        setLive((previous) => ({ ...previous, patched: frame }));
        scope.record('state', `Patched / ${frame.step}`, frame.state);
        await pace();
      },
    });
    report(recording, original, 'original');
    scope.setState('Comparison', {
      order: recording.order,
      original: { passed: original.passed, actual: original.actual },
      patched: { passed: patched.passed, actual: patched.actual },
      expected: original.expected,
    });
    setPair({ original, patched });
    setLive({});
  };
  const operation = async (label: string, task: () => Promise<void>) => {
    if (occupied.current) return;
    occupied.current = true;
    abort.current = new AbortController();
    setBusy(label);
    setNotice('');
    try {
      await task();
    } catch (error) {
      abort.current?.abort();
      setNotice(error instanceof Error ? error.message : String(error));
    } finally {
      occupied.current = false;
      abort.current = null;
      setBusy('');
    }
  };
  const capture = () =>
    operation('Capturing 3 API responses', async () => {
      scope.enterPage(app === 'atlas' ? '/' : '/shipping');
      setPair(null);
      setLive({});
      setMatrix([]);
      const values = inputs.map((s) => s.trim().toLowerCase());
      if (values.some((s) => !s || s.length > 40))
        throw new Error('Use a nonempty query of up to 40 characters.');
      const recording = await captureIncident(
        app,
        app === 'atlas' ? values : inputs,
        order,
        scope,
        abort.current!.signal,
      );
      setIncident(recording);
      setBusy('Replaying captured responses');
      await compare(recording);
    });
  const rerun = () =>
    incident &&
    operation('Replaying · no API calls', async () => {
      const recording = parseIncident({ ...incident, order });
      setIncident(recording);
      await compare(recording);
    });
  const explore = () =>
    incident &&
    operation('Checking every completion order', async () => {
      setMatrix([]);
      const results: ScheduleResult[] = [];
      const started = performance.now();
      for (const schedule of permutations(
        incident.operations.map((op) => op.id),
      )) {
        if (abort.current?.signal.aborted) throw new Error('Replay cancelled');
        const recording = parseIncident({ ...incident, order: schedule });
        const before = await replay(recording, createModel(app, 'original'));
        const after = await replay(recording, createModel(app, 'patched'));
        results.push({
          order: schedule,
          original: before.passed,
          patched: after.passed,
        });
      }
      setMatrixMs(performance.now() - started);
      setMatrix(results);
      scope.setState('ScheduleCoverage', {
        schedules: results.length,
        originalFailures: results.filter((r) => !r.original).length,
        patchedFailures: results.filter((r) => !r.patched).length,
      });
    });
  const openFile = async (file?: File) => {
    if (!file) return;
    await operation('Opening incident · no API calls', async () => {
      if (file.size > 200_000)
        throw new Error('Incident exceeds the 200KB limit.');
      const recording = parseIncident(await file.text());
      if (recording.appId !== appIds[app])
        throw new Error(
          `This recording belongs to ${recording.appId}. Open the matching example first.`,
        );
      if (recording.operations.length !== 3)
        throw new Error('This example expects three recorded actions.');
      setMatrix([]);
      setIncident(recording);
      setOrder(recording.order);
      setInputs(recording.operations.map((op) => op.label));
      await compare(recording);
      setNotice('Incident reopened locally. No API requests were made.');
    });
    if (importRef.current) importRef.current.value = '';
  };
  const reorder = (i: number, offset: number) => {
    const next = [...order];
    [next[i], next[i + offset]] = [next[i + offset], next[i]];
    setOrder(next);
  };
  const original = pair?.original.checkpoints[cursor] ?? live.original;
  const patched = pair?.patched.checkpoints[cursor] ?? live.patched;
  const actualFrame = (frame?: Checkpoint) =>
    incident && frame ? readPath(frame.state, incident.rule.actual) : undefined;
  const expectedFrame = (frame?: Checkpoint) =>
    incident && frame
      ? readPath(frame.state, incident.rule.expected)
      : undefined;
  const divergence =
    pair && incident
      ? pair.original.checkpoints.findIndex(
          (frame, i) =>
            i > 0 &&
            JSON.stringify(readPath(frame.state, incident.rule.actual)) !==
              JSON.stringify(
                readPath(
                  pair.patched.checkpoints[i].state,
                  incident.rule.actual,
                ),
              ),
        )
      : -1;
  const script = incident ? generatePlaywright(incident) : '';
  const fileName = `tab-debug-${app}.spec.ts`;

  return (
    <div className="replay-app">
      <header className="lab-header">
        <a href="/" className="lab-brand">
          <Terminal size={21} strokeWidth={1.6} />
          tab-debug
        </a>
        <nav>
          <a href="/setup" className="setup-link">
            Add to your app
          </a>
          <a href={repo} target="_blank" rel="noreferrer">
            Source <ArrowUpRight size={13} />
          </a>
          <Dialog>
            <DialogTrigger className="native-pill">
              <i className={native === 'native' ? 'connected' : ''} />
              {native === 'native' ? '5 tools live' : 'Agent tools'}
            </DialogTrigger>
            <DialogContent className="lab-dialog">
              <DialogHeader>
                <DialogTitle>Browser tools</DialogTitle>
                <DialogDescription>
                  {native === 'native'
                    ? 'Native WebMCP is registered. These are the same tools a browser agent can call.'
                    : 'This browser uses the local executor. Native WebMCP is available in compatible browsers.'}
                </DialogDescription>
              </DialogHeader>
              <div className="tool-chooser">
                {toolNames.map((name) => (
                  <button
                    key={name}
                    className={tool === name ? 'active' : ''}
                    onClick={() => {
                      setTool(name);
                      setToolResult(scope.callTool(name));
                    }}
                  >
                    {name}
                    <ArrowUpRight size={12} />
                  </button>
                ))}
              </div>
              <pre data-testid="lab-tool-result">
                {toolResult
                  ? JSON.stringify(toolResult, null, 2)
                  : 'Select a tool to see its output.'}
              </pre>
              <code>agent-browser webmcp invoke inspect_state</code>
            </DialogContent>
          </Dialog>
        </nav>
      </header>
      <main className="lab-main" data-testid="replay-ready" data-ready={ready}>
        <section className="lab-intro">
          <h1>{app === 'atlas' ? 'Search race' : 'Shipping quote race'}</h1>
          <p>
            {app === 'atlas'
              ? 'An old response replaces the latest search results.'
              : 'An old shipping quote replaces the price for the current address.'}
          </p>
        </section>

        <div className="lab-example-tabs">
          <div>
            <a href="/" aria-current={app === 'atlas' ? 'page' : undefined}>
              01 <span>Archive search</span>
            </a>
            <a
              href="/shipping"
              aria-current={app === 'shipping' ? 'page' : undefined}
            >
              02 <span>Shipping quote</span>
            </a>
          </div>
          <button
            onClick={() => importRef.current?.click()}
            disabled={!!busy || !ready}
          >
            <Upload size={13} />
            Open incident
          </button>
          <input
            ref={importRef}
            type="file"
            accept="application/json,.json"
            aria-label="Open incident file"
            className="visually-hidden"
            onChange={(e) => openFile(e.target.files?.[0])}
          />
        </div>
        <section className="capture-controls" aria-label="Configure recording">
          <div className="capture-label">
            Requests <ArrowRight size={14} />
          </div>
          <div className="query-fields">
            {inputs.map((value, i) => (
              <label key={i}>
                <span>
                  Q{i + 1}
                  {i === inputs.length - 1 && <small>latest</small>}
                </span>
                {app === 'atlas' ? (
                  <input
                    aria-label={`Search ${i + 1}`}
                    value={value}
                    disabled={!!busy}
                    maxLength={40}
                    onChange={(e) =>
                      setInputs(
                        inputs.map((v, n) => (n === i ? e.target.value : v)),
                      )
                    }
                  />
                ) : (
                  <select
                    aria-label={`Destination ${i + 1}`}
                    value={value}
                    disabled={!!busy}
                    onChange={(e) =>
                      setInputs(
                        inputs.map((v, n) => (n === i ? e.target.value : v)),
                      )
                    }
                  >
                    {destinations.map((d) => (
                      <option key={d}>{d}</option>
                    ))}
                  </select>
                )}
              </label>
            ))}
          </div>
          <button
            className="lab-primary capture-button"
            disabled={!!busy || !ready}
            onClick={capture}
          >
            {busy ? (
              <Loader2 size={15} className="spin" />
            ) : (
              <Radio size={15} />
            )}
            {busy
              ? 'Working…'
              : incident
                ? 'Capture new run'
                : 'Capture & compare'}
          </button>
        </section>

        <section
          className="delivery-strip"
          aria-label="Control completion order"
        >
          <div>
            <span className="lab-kicker">Response order</span>
          </div>
          <div className="order-controls">
            {order.map((id, i) => (
              <div className="order-step" key={id}>
                <button
                  disabled={!!busy || i === 0}
                  aria-label={`Move ${id} earlier`}
                  onClick={() => reorder(i, -1)}
                >
                  <ChevronLeft size={12} />
                </button>
                <strong>{id}</strong>
                <button
                  disabled={!!busy || i === order.length - 1}
                  aria-label={`Move ${id} later`}
                  onClick={() => reorder(i, 1)}
                >
                  <ChevronRight size={12} />
                </button>
                {i !== order.length - 1 && (
                  <ArrowRight className="between" size={12} />
                )}
              </div>
            ))}
          </div>
          <button
            className="lab-secondary"
            disabled={!!busy || !incident}
            onClick={rerun}
          >
            <Play size={12} />
            Replay recording
          </button>
        </section>

        <div className="comparison-heading">
          <span>
            {incident
              ? 'Recorded responses'
              : 'Same responses, two implementations'}
          </span>
          <span>
            {busy ||
              (incident
                ? `${new TextEncoder().encode(JSON.stringify(incident)).length.toLocaleString()} bytes`
                : '')}
          </span>
          {busy && (
            <button
              className="cancel-run"
              onClick={() => abort.current?.abort()}
            >
              Cancel <X size={11} />
            </button>
          )}
        </div>
        <section
          className="comparison-grid"
          aria-label="Original and patched application"
        >
          {(['original', 'patched'] as const).map((implementation) => {
            const frame = implementation === 'original' ? original : patched;
            const complete = pair?.[implementation];
            return (
              <article
                className={`implementation ${implementation}`}
                key={implementation}
                data-testid={`preview-${implementation}`}
              >
                <header>
                  <div>
                    <span className="implementation-index">
                      {implementation === 'original' ? 'A' : 'B'}
                    </span>
                    <div>
                      <h2>
                        {implementation === 'original' ? 'Original' : 'Fixed'}
                      </h2>
                      <p>
                        {implementation === 'original'
                          ? 'Applies every response.'
                          : 'Ignores outdated responses.'}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`result-badge ${complete ? (complete.passed ? 'pass' : 'fail') : ''}`}
                  >
                    {complete ? (
                      complete.passed ? (
                        <>
                          <Check size={12} />
                          PASS
                        </>
                      ) : (
                        <>
                          <X size={12} />
                          FAIL
                        </>
                      )
                    ) : (
                      'Not run'
                    )}
                  </span>
                </header>
                <ResultView app={app} frame={frame} initial={!frame} />
                <div
                  className={`invariant-line ${frame && actualFrame(frame) !== expectedFrame(frame) ? 'mismatch' : ''}`}
                >
                  <span>
                    {app === 'atlas'
                      ? 'results.query === input.query'
                      : 'quote.country === address.country'}
                  </span>
                  <strong>
                    {frame ? (
                      <>
                        {pretty(actualFrame(frame))}{' '}
                        <span>
                          {actualFrame(frame) === expectedFrame(frame)
                            ? '='
                            : '≠'}
                        </span>{' '}
                        {pretty(expectedFrame(frame))}
                      </>
                    ) : (
                      '—'
                    )}
                  </strong>
                </div>
              </article>
            );
          })}
        </section>

        {incident && (
          <>
            <section className="evidence-section">
              <div className="section-heading">
                <div>
                  <h2>State</h2>
                </div>
              </div>
              <div className="evidence-grid">
                <div className="state-history">
                  <div className="history-heading">
                    <span className="lab-kicker">After</span>
                    <div className="frame-controls">
                      {['intent', ...(incident?.order ?? order)].map(
                        (step, i) => (
                          <button
                            key={step}
                            aria-label={`Inspect state after ${step}`}
                            aria-pressed={cursor === i && !!pair}
                            disabled={!pair || !!busy}
                            onClick={() => setCursor(i)}
                          >
                            {step === 'intent' ? 'All inputs' : step}
                          </button>
                        ),
                      )}
                    </div>
                  </div>
                  {pair && original ? (
                    <>
                      <div className="state-table">
                        <div className="state-table-heading">
                          <span>FIELD</span>
                          <span>ORIGINAL</span>
                          <span>PATCHED</span>
                        </div>
                        {Object.keys(original.state as object)
                          .filter((key) => key !== 'ids')
                          .map((key) => (
                            <div
                              key={key}
                              className={
                                JSON.stringify(
                                  (original.state as Record<string, Json>)[key],
                                ) !==
                                JSON.stringify(
                                  (patched?.state as Record<string, Json>)?.[
                                    key
                                  ],
                                )
                                  ? 'different'
                                  : ''
                              }
                            >
                              <span>{key}</span>
                              <code>
                                {pretty(
                                  (original.state as Record<string, Json>)[key],
                                )}
                              </code>
                              <code>
                                {pretty(
                                  (patched?.state as Record<string, Json>)?.[
                                    key
                                  ],
                                )}
                              </code>
                            </div>
                          ))}
                      </div>
                      <div className="causal-note">
                        {divergence > 0 ? (
                          <>
                            <Crosshair size={15} />
                            <p>
                              <strong>
                                {pair.original.checkpoints[divergence].step} is
                                the first different state update.
                              </strong>{' '}
                              The fixed version ignored this outdated response.
                            </p>
                            <button onClick={() => setCursor(divergence)}>
                              Jump to it <ArrowRight size={12} />
                            </button>
                          </>
                        ) : (
                          <>
                            <Check size={15} />
                            <p>
                              This completion order left both implementations
                              consistent. Try delivering the latest request
                              first.
                            </p>
                          </>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="evidence-empty">
                      <p>Run the comparison to inspect state changes.</p>
                    </div>
                  )}
                </div>
                <div className="transport-panel">
                  <span className="lab-kicker">Request duration</span>
                  <p>Measured before replay changes the response order.</p>
                  <div className="transport-rows">
                    {(
                      incident?.operations ??
                      order.map((_, i) => ({
                        id: `Q${i + 1}`,
                        label: inputs[i],
                        transportMs: 0,
                      }))
                    ).map((op) => (
                      <div className="transport-row" key={op.id}>
                        <span>{op.id}</span>
                        <div>
                          <div>
                            <span>{op.label}</span>
                            <code>
                              {incident
                                ? `${op.transportMs}ms`
                                : 'Not captured'}
                            </code>
                          </div>
                          <div className="transport-track">
                            <i
                              style={{
                                width: incident
                                  ? `${Math.max(3, (op.transportMs / Math.max(...incident.operations.map((item) => item.transportMs), 1)) * 100)}%`
                                  : '0%',
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="gate-note">
                    <span>Replay order</span>
                    <strong>{(incident?.order ?? order).join(' → ')}</strong>
                    <p></p>
                  </div>
                </div>
              </div>
            </section>

            <section className="schedule-section">
              <div className="schedule-intro">
                <h2>Other response orders</h2>
                <button
                  className="lab-secondary"
                  disabled={!incident || !!busy}
                  onClick={explore}
                >
                  <RotateCcw size={13} />
                  {`Check all ${incident ? permutations(incident.order).length : 6} orders`}
                </button>
              </div>
              <div className="schedule-results">
                <div className="schedule-table-head">
                  <span>RESPONSE ORDER</span>
                  <span>ORIGINAL</span>
                  <span>GUARDED</span>
                </div>
                {(matrix.length
                  ? matrix
                  : permutations(['Q1', 'Q2', 'Q3']).map((sequence) => ({
                      order: sequence,
                      original: null,
                      patched: null,
                    }))
                ).map((row) => (
                  <button
                    key={row.order.join('')}
                    className="schedule-row"
                    disabled={!matrix.length || !!busy}
                    onClick={() =>
                      incident &&
                      operation('Replaying selected order', async () => {
                        const recording = parseIncident({
                          ...incident,
                          order: row.order,
                        });
                        setOrder(row.order);
                        setIncident(recording);
                        await compare(recording);
                      })
                    }
                  >
                    <code>{row.order.join(' → ')}</code>
                    {[row.original, row.patched].map((pass, i) => (
                      <span
                        key={i}
                        className={
                          pass === null
                            ? ''
                            : pass
                              ? 'schedule-pass'
                              : 'schedule-fail'
                        }
                      >
                        {pass === null ? (
                          '—'
                        ) : pass ? (
                          <>
                            <Check size={12} />
                            PASS
                          </>
                        ) : (
                          <>
                            <X size={12} />
                            FAIL
                          </>
                        )}
                      </span>
                    ))}
                  </button>
                ))}
                <div className="schedule-summary" role="status">
                  {matrix.length ? (
                    <>
                      <strong>
                        {matrix.filter((row) => !row.original).length}/
                        {matrix.length} original failures →{' '}
                        {matrix.filter((row) => !row.patched).length}/
                        {matrix.length} guarded failures
                      </strong>
                      <span>
                        {matrixMs.toFixed(1)}ms measured execution · 0 API calls
                      </span>
                    </>
                  ) : (
                    <span>Run a comparison first.</span>
                  )}
                </div>
              </div>
            </section>

            <section className="takeaway-section">
              <div className="section-heading">
                <div>
                  <h2>Export</h2>
                </div>
                <p></p>
              </div>
              <div className="takeaway-body">
                <div>
                  <p>
                    Save the recording to replay it elsewhere, or download a
                    Playwright test.
                  </p>
                  <div className="export-buttons">
                    <button
                      className="lab-primary"
                      disabled={!incident || !!busy}
                      onClick={() => {
                        if (incident)
                          save(
                            `tab-debug-${app}.incident.json`,
                            JSON.stringify(incident, null, 2),
                            'application/json',
                          );
                      }}
                    >
                      <Download size={14} />
                      Save incident
                    </button>
                    <button
                      className="lab-secondary"
                      disabled={
                        !incident || !!busy || !pair || pair.original.passed
                      }
                      onClick={() => save(fileName, script, 'text/plain')}
                    >
                      <FileCode2 size={14} />
                      Export regression test
                    </button>
                  </div>
                  <p className="export-note">
                    {pair?.original.passed
                      ? 'Select an order that fails to export a regression test.'
                      : 'The test fails on the original code and passes with the prewritten fix.'}
                  </p>
                </div>
                <div className="test-command">
                  <div>
                    <Terminal size={14} />
                    <span>RUN THE EXPORTED TEST</span>
                    <span className="target-variant">
                      TARGET: {variant.toUpperCase()}
                    </span>
                  </div>
                  <pre>
                    <span className="command-comment">
                      # Against the original: assertion fails
                    </span>
                    {'\n'}PAGESCOPE_BASE_URL='{origin}
                    {app === 'atlas' ? '/' : '/shipping'}' \{'\n'} npx
                    playwright test {fileName}
                    {'\n\n'}
                    <span className="command-comment">
                      # Same recording, patched application: passes
                    </span>
                    {'\n'}PAGESCOPE_BASE_URL='{origin}
                    {app === 'atlas' ? '/' : '/shipping'}
                    ?implementation=patched' \{'\n'} npx playwright test{' '}
                    {fileName}
                  </pre>
                </div>
              </div>
            </section>
          </>
        )}
        {notice && (
          <div className="lab-notice" role="alert">
            <span>{notice}</span>
            <button aria-label="Dismiss message" onClick={() => setNotice('')}>
              <X size={14} />
            </button>
          </div>
        )}
        <div className="lab-footnote">
          <span>These examples contain deliberate bugs.</span>
          <a href="/setup" target="_blank" rel="noreferrer">
            Integrate into your app <ArrowUpRight size={12} />
          </a>
        </div>
      </main>
      <footer className="lab-footer">
        <span>
          <Crosshair size={14} />
          Built by <a href="https://github.com/dhairya-t">Dhairya Thakkar</a>
        </span>
        <a href="https://x.com/rauchg/status/2096065378598441431">
          Inspired by @rauchg’s WebMCP post
        </a>
        <a href="/images/CREDITS.md">
          NASA / USGS imagery <ArrowUpRight size={11} />
        </a>
      </footer>
    </div>
  );
}

'use client';
import { useEffect, useState, useSyncExternalStore } from 'react';
import {
  ArrowUpRight,
  ArrowRight,
  Crosshair,
  Play,
  Terminal,
  Braces,
  Circle,
  Radio,
  RotateCcw,
  Check,
  Download,
  X,
  FileCode2,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Search,
  Copy,
  ChevronRight,
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
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
  type TraceEvent,
} from '@/packages/pagescope/src/core';
import {
  PageScopeProvider,
  PageScopeBoundary,
  useWebMCP,
} from '@/packages/pagescope/src/react';
import { DemoController, type ArchivePhoto } from '@/lib/demo/controller';
import { scenarios, type Scenario } from '@/lib/demo/data';
const REPO = 'https://github.com/dhairya-t/pagescope';
const evidenceTool: Record<Scenario, ToolName> = {
  network: 'inspect_requests',
  race: 'inspect_state',
  render: 'inspect_errors',
};
function PhotoGrid({
  items,
  fixed,
  scenario,
}: {
  items: ArchivePhoto[];
  fixed: boolean;
  scenario: Scenario;
}) {
  if (items.length === 0)
    return (
      <div className="archive-empty">
        <Search size={25} />
        <p>No observations found.</p>
        <span>
          The collection looks empty. The request tells another story.
        </span>
      </div>
    );
  return (
    <div className={`photo-grid ${items.length === 1 ? 'one-photo' : ''}`}>
      {items.map((photo, i) => {
        // This intentionally unsafe branch is the render-error fixture, isolated by an ErrorBoundary.
        const title =
          scenario === 'render'
            ? fixed
              ? (photo.title ?? 'Untitled observation').toUpperCase()
              : photo.title!.toUpperCase()
            : (photo.title ?? 'Untitled observation');
        return (
          <figure
            className={`photo ${i === 0 ? 'main-photo' : ''}`}
            key={photo.id}
          >
            <a
              href={photo.source}
              target="_blank"
              rel="noreferrer"
              aria-label={`View NASA source for ${title}`}
            >
              <img src={photo.image} alt={photo.alt} />
            </a>
            <figcaption>
              <span>
                0{i + 1} / {title}
              </span>
              <ArrowUpRight size={13} />
            </figcaption>
          </figure>
        );
      })}
    </div>
  );
}
function TraceRow({ event, start }: { event: TraceEvent; start: number }) {
  const data = event.data as Record<string, unknown>;
  return (
    <div className={`trace-row trace-${event.kind}`}>
      <span className="trace-time">
        +{((event.time - start) / 1000).toFixed(2)}s
      </span>
      <div>
        <span className="trace-kind">
          {event.kind} <span>#{event.seq}</span>
        </span>
        <p>{event.label}</p>
        {event.kind === 'response' && (
          <small>
            {String(data.durationMs)} ms · request #{String(data.requestId)}
          </small>
        )}
      </div>
    </div>
  );
}
export default function Home() {
  const [scope] = useState(() => new PageScope());
  const [controller] = useState(() => new DemoController(scope));
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  useSyncExternalStore(scope.subscribe, scope.getVersion, () => 0);
  const snapshot = scope.snapshot();
  const native = useWebMCP(scope);
  const [tab, setTab] = useState('tools');
  const [tool, setTool] = useState<ToolName | null>(null);
  const [result, setResult] = useState<unknown>(null);
  const [copied, setCopied] = useState(false);
  const [view, setView] = useState<'archive' | 'about'>('archive');
  const [notice, setNotice] = useState('');
  useEffect(() => {
    controller.reset();
  }, [controller]);
  const callTool = (name: ToolName) => {
    setTool(name);
    setResult(scope.callTool(name, {}));
    setTab('tools');
  };
  async function run(fixed: boolean) {
    setResult(null);
    setTool(null);
    setNotice('');
    await controller.run(fixed);
  }
  function changeView(next: 'archive' | 'about') {
    if (state.busy) return;
    setView(next);
    scope.enterPage(next === 'archive' ? '/examples' : '/examples?view=about');
    scope.setState('View', { active: next });
    setResult(null);
    setTool(null);
  }
  function reset() {
    controller.reset();
    setView('archive');
    setResult(null);
    setTool(null);
    setNotice('');
  }
  function download() {
    const report = {
      format: 'pagescope.trace.v1',
      exportedAt: new Date().toISOString(),
      experiment: {
        scenario: state.scenario,
        fixed: state.fixed,
        phase: state.phase,
      },
      ...scope.snapshot(),
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }),
    );
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `pagescope-${state.scenario}-${state.fixed ? 'fixed' : 'broken'}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setNotice('Trace exported. All retained records are included.');
  }
  async function copyCommand() {
    try {
      await navigator.clipboard.writeText(
        "agent-browser webmcp invoke get_page_context --params '{}'",
      );
      setCopied(true);
    } catch {
      setNotice(
        "Copy unavailable. Command: agent-browser webmcp invoke get_page_context --params '{}'",
      );
    }
  }
  const events = snapshot.events;
  const errors = events.filter((e) => e.kind === 'error').length;
  const current = scenarios[state.scenario];
  return (
    <PageScopeProvider scope={scope}>
      <div className="app-shell">
        <header className="topbar">
          <a href="/" className="brand">
            <Crosshair size={22} strokeWidth={1.5} />
            PageScope<span>DEVELOPER PREVIEW</span>
          </a>
          <nav>
            <Dialog>
              <DialogTrigger className="text-button">
                How it works
              </DialogTrigger>
              <DialogContent className="about-dialog">
                <DialogHeader>
                  <DialogTitle>The debugger travels with the page.</DialogTitle>
                  <DialogDescription>
                    PageScope turns explicitly registered state and diagnostics
                    into five read-only WebMCP tools.
                  </DialogDescription>
                </DialogHeader>
                <ol className="how-list">
                  <li>
                    <strong>Instrument what matters.</strong>
                    <p>
                      Wrap selected requests with scope.fetch, register state,
                      and add an error boundary. No global monkey-patching.
                    </p>
                  </li>
                  <li>
                    <strong>Give the agent this tab.</strong>
                    <p>
                      Native WebMCP exposes the tool registry to compatible
                      browser agents. This inspector calls the same validated
                      executors.
                    </p>
                  </li>
                  <li>
                    <strong>Reproduce, inspect, verify.</strong>
                    <p>
                      The experiments use real HTTP responses and a real React
                      error boundary. “Apply fix” selects a documented,
                      prewritten implementation; it does not generate code.
                    </p>
                  </li>
                </ol>
                <p className="dialog-note">
                  Next.js already provides server MCP tools. PageScope
                  complements them with opt-in browser context. The SDK defaults
                  to no network transport. Treat redaction as a backstop, not
                  permission to register secrets.
                </p>
                <a
                  className="dialog-link"
                  href={`${REPO}#quick-start`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Read the integration guide <ArrowUpRight size={14} />
                </a>
              </DialogContent>
            </Dialog>
            <a href={REPO} target="_blank" rel="noreferrer">
              Source <ArrowUpRight size={14} />
            </a>
          </nav>
        </header>
        <main>
          <section className="heading">
            <div>
              <p className="eyebrow">BROWSER-NATIVE OBSERVABILITY</p>
              <h1>The page is the context.</h1>
            </div>
            <p>
              Give your agent the evidence.{' '}
              <br />
              Right here, in the tab it’s testing.
            </p>
          </section>
          <div className="experiment-bar">
            <span className="experiment-label">
              <span className="number">01</span> The experiment
            </span>
            <Select
              value={state.scenario}
              onValueChange={(value) => {
                if (value) {
                  controller.select(value as Scenario);
                  setResult(null);
                  setTool(null);
                  setView('archive');
                }
              }}
              disabled={state.busy || !snapshot.pageId}
            >
              <SelectTrigger
                className="scenario-picker"
                aria-label="Failure scenario"
              >
                <SelectValue>{current.label}</SelectValue>
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false}>
                {Object.entries(scenarios).map(([key, value]) => (
                  <SelectItem value={key} key={key}>
                    {value.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="experiment-actions">
              <button
                className="reset-button"
                onClick={reset}
                disabled={state.busy || !snapshot.pageId}
                aria-label="Reset experiment"
              >
                <RotateCcw size={15} />
              </button>
              {state.phase === 'broken' && (
                <button
                  className="fix-button"
                  onClick={() => run(true)}
                  disabled={state.busy || !snapshot.pageId}
                >
                  <Check size={14} />
                  Apply fix & verify
                </button>
              )}
              <button
                className="run-button"
                onClick={() => {
                  setView('archive');
                  run(false);
                }}
                disabled={state.busy || !snapshot.pageId}
              >
                {state.busy ? (
                  <Loader2 size={14} className="spin" />
                ) : (
                  <Play size={14} fill="currentColor" />
                )}
                {state.busy
                  ? 'Running…'
                  : state.phase === 'ready'
                    ? 'Reproduce bug'
                    : 'Run original'}
              </button>
            </div>
          </div>
          <div className="workbench">
            <section className="gallery-pane">
              <div className="browser-chrome">
                <span className="window-dots">
                  <i />
                  <i />
                  <i />
                </span>
                <span className="address">atlas.local / {view}</span>
                <span className="preview-label">LIVE APP</span>
              </div>
              <div className="atlas">
                <div className="atlas-nav">
                  <button
                    className="atlas-brand"
                    onClick={() => changeView('archive')}
                    disabled={state.busy || !snapshot.pageId}
                  >
                    atlas<span>®</span>
                  </button>
                  <span>FIELD NOTES FROM ABOVE</span>
                  <button
                    className="about-toggle"
                    onClick={() =>
                      changeView(view === 'archive' ? 'about' : 'archive')
                    }
                    disabled={state.busy || !snapshot.pageId}
                  >
                    {view === 'archive'
                      ? 'About the archive'
                      : 'Back to archive'}{' '}
                    <ArrowUpRight size={11} />
                  </button>
                </div>
                {view === 'about' ? (
                  <div className="atlas-about">
                    <p className="eyebrow">THE COLLECTION</p>
                    <h2>
                      Distance reveals
                      <br />
                      <em>new patterns.</em>
                    </h2>
                    <p>
                      Three observations from NASA Earth Observatory. Landsat
                      false-color views reveal dune ridges and river deltas; a
                      natural-color MODIS frame follows the Namibian coast.
                    </p>
                    <p>
                      This is a deliberately small app with real failure cases.
                      Its transient diagnostics live only in this tab.
                    </p>
                    <button onClick={() => changeView('archive')}>
                      Return to observations <ArrowRight size={14} />
                    </button>
                    <div className="page-reset-note">
                      <Crosshair size={14} />
                      Page context reset. The previous view’s diagnostics have
                      been cleared.
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="atlas-title">
                      <h2>
                        A different
                        <br />
                        <em>perspective.</em>
                      </h2>
                      <p>
                        Earth, seen from a little further away.
                        <br />A collection of satellite observations.
                      </p>
                    </div>
                    {state.scenario === 'race' && (
                      <div className="search-display">
                        <Search size={14} />
                        <span>
                          Search:{' '}
                          <strong>{state.query || 'all observations'}</strong>
                        </span>
                        {state.appliedQuery && (
                          <small>Showing: {state.appliedQuery}</small>
                        )}
                      </div>
                    )}
                    <PageScopeBoundary
                      key={state.runId}
                      scope={scope}
                      fallback={
                        <div className="render-fallback">
                          <AlertTriangle size={24} />
                          <h3>The archive couldn’t render.</h3>
                          <p>
                            The error boundary caught an exception.
                            <br />
                            The rest of the page is still working.
                          </p>
                        </div>
                      }
                    >
                      <PhotoGrid
                        items={state.items}
                        fixed={state.fixed}
                        scenario={state.scenario}
                      />
                    </PageScopeBoundary>
                    <div className="atlas-bottom">
                      <a
                        href="/images/CREDITS.md"
                        target="_blank"
                        rel="noreferrer"
                      >
                        NASA EARTH OBSERVATORY / USGS ↗
                      </a>
                      <span>
                        {String(state.items.length).padStart(2, '0')}{' '}
                        OBSERVATIONS <ArrowRight size={13} />
                      </span>
                    </div>
                  </>
                )}
              </div>
              {state.phase !== 'ready' && (
                <div className={`outcome ${state.phase}`} role="status">
                  {state.phase === 'verified' ? (
                    <CheckCircle2 size={17} />
                  ) : (
                    <AlertTriangle size={17} />
                  )}
                  <div>
                    <strong>
                      {state.issue
                        ? 'Experiment interrupted.'
                        : state.phase === 'verified'
                          ? 'Patched run complete.'
                          : 'The bug is reproduced.'}
                    </strong>
                    <p>
                      {state.issue
                        ? state.issue
                        : state.phase === 'verified'
                          ? state.scenario === 'network'
                            ? `Recovered after ${state.failedAttempts} failed attempt. All observations restored.`
                            : state.scenario === 'race'
                              ? `${state.discarded} stale response rejected. Results match “${state.query}”.`
                              : 'Nullable metadata rendered with a safe fallback.'
                          : current.description}
                    </p>
                  </div>
                  {state.phase === 'broken' && (
                    <button
                      onClick={() => callTool(evidenceTool[state.scenario])}
                    >
                      Inspect <ArrowRight size={13} />
                    </button>
                  )}
                </div>
              )}
            </section>
            <aside className="inspector">
              <div className="inspector-head">
                <span>
                  <Crosshair size={17} /> PageScope
                </span>
                <span className={`mode ${native === 'native' ? 'native' : ''}`}>
                  <i />
                  {native === 'native' ? 'WEBMCP LIVE' : 'LOCAL INSPECTOR'}
                </span>
              </div>
              <div className="context-summary">
                <span className="eyebrow">
                  AGENT CONTEXT{' '}
                  <span className="context-id">
                    {snapshot.pageId
                      ? snapshot.pageId.slice(0, 8)
                      : 'connecting'}
                  </span>
                </span>
                <h3>
                  {state.phase === 'broken'
                    ? 'The evidence is right here.'
                    : state.phase === 'verified'
                      ? 'A fix you can verify.'
                      : 'Nothing lost in translation.'}
                </h3>
                <p>
                  {events.length} events{' '}
                  <span className="count-separator">/</span> {errors} captured
                  errors <span className="count-separator">/</span>{' '}
                  {Object.keys(snapshot.state).length} state sources
                </p>
              </div>
              <Tabs value={tab} onValueChange={setTab}>
                <TabsList variant="line" className="inspector-tabs">
                  <TabsTrigger value="tools">
                    <Terminal size={13} />
                    Tools
                  </TabsTrigger>
                  <TabsTrigger value="trace">
                    <Radio size={13} />
                    Timeline
                  </TabsTrigger>
                  <TabsTrigger value="state">
                    <Braces size={13} />
                    State
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="tools">
                  <div className="tool-list">
                    {toolNames.map((name) => (
                      <button
                        className={`tool-row ${tool === name ? 'active-tool' : ''}`}
                        onClick={() => callTool(name)}
                        key={name}
                      >
                        <Circle size={7} />
                        <code>{name}</code>
                        <ArrowUpRight size={14} />
                      </button>
                    ))}
                  </div>
                  {result !== null ? (
                    <div className="tool-result">
                      <div className="result-label">
                        <span>RESULT / {tool}</span>
                        <button
                          aria-label="Close tool result"
                          onClick={() => {
                            setResult(null);
                            setTool(null);
                          }}
                        >
                          <X size={13} />
                        </button>
                      </div>
                      <pre data-testid="tool-result">
                        {JSON.stringify(result, null, 2)}
                      </pre>
                    </div>
                  ) : (
                    <div className="inspector-empty">
                      <Terminal size={24} />
                      <p>
                        Start with a question.
                        <small>
                          Reproduce a bug, then call a tool
                          <br />
                          to inspect its actual runtime evidence.
                        </small>
                      </p>
                    </div>
                  )}
                </TabsContent>
                <TabsContent value="trace">
                  <div className="trace-list" data-testid="timeline">
                    {events.map((event) => (
                      <TraceRow
                        key={event.seq}
                        event={event}
                        start={events[0]?.time ?? 0}
                      />
                    ))}
                    {snapshot.dropped > 0 && (
                      <p className="retention-note">
                        {snapshot.dropped} older events evicted from the bounded
                        buffer.
                      </p>
                    )}
                  </div>
                </TabsContent>
                <TabsContent value="state">
                  <pre className="code-output" data-testid="live-state">
                    {JSON.stringify(snapshot.state, null, 2)}
                  </pre>
                </TabsContent>
              </Tabs>
              <div className="inspector-foot">
                <span>
                  {native === 'native'
                    ? '5 read-only tools registered'
                    : native === 'error'
                      ? 'Registration failed · local tools available'
                      : 'Native WebMCP unavailable in this browser'}
                </span>
                <button onClick={download} aria-label="Export trace">
                  <Download size={13} />
                </button>
              </div>
            </aside>
          </div>
          <section className="diagnosis">
            <div className="diagnosis-copy">
              <p className="eyebrow">
                <span className="number">02</span> UNDER THE SURFACE
              </p>
              <h3>{current.label}</h3>
              <p>{current.cause}</p>
              <p className="fix-explanation">
                <CheckCircle2 size={14} />
                <span>{current.fix}</span>
              </p>
            </div>
            <div className="patch-panel">
              <Tabs defaultValue="before">
                <div className="patch-heading">
                  <TabsList variant="line">
                    <TabsTrigger value="before">Original</TabsTrigger>
                    <TabsTrigger value="after">Patch</TabsTrigger>
                  </TabsList>
                  <span>
                    <FileCode2 size={12} />{' '}
                    {state.scenario === 'render'
                      ? 'PhotoGrid.tsx'
                      : 'controller.ts'}{' '}
                    · excerpt
                  </span>
                </div>
                <TabsContent value="before">
                  <pre>{current.before}</pre>
                </TabsContent>
                <TabsContent value="after">
                  <pre>{current.after}</pre>
                </TabsContent>
              </Tabs>
            </div>
          </section>
          <section className="bottom-note">
            <button className="copy-command" onClick={copyCommand}>
              <Terminal size={14} />
              <code>agent-browser webmcp invoke get_page_context</code>
              {copied ? <Check size={13} /> : <Copy size={13} />}
            </button>
            <a
              href="https://x.com/rauchg/status/2096065378598441431"
              target="_blank"
              rel="noreferrer"
            >
              From a September 5 idea by @rauchg <ArrowUpRight size={13} />
            </a>
          </section>
          {notice && (
            <p className="notice" role="status">
              {notice}
            </p>
          )}
        </main>
        <footer>
          <a
            href="https://github.com/dhairya-t"
            target="_blank"
            rel="noreferrer"
          >
            A project by Dhairya Thakkar
          </a>
          <span>Built for humans. Legible to agents.</span>
          <a
            href={`${REPO}/tree/main/packages/pagescope`}
            target="_blank"
            rel="noreferrer"
          >
            SDK + DOCUMENTATION <ChevronRight size={11} />
          </a>
        </footer>
      </div>
    </PageScopeProvider>
  );
}

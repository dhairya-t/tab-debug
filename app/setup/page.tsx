import type { Metadata } from 'next';
import { Terminal, ArrowUpRight } from 'lucide-react';
import { CopyCode } from '@/components/copy-code';
import { SetupExample } from '@/components/setup-example';
import '@/components/race-lab.css';
import './setup.css';

export const metadata: Metadata = {
  title: 'Add tab-debug to your app',
  alternates: { canonical: '/setup' },
};
const install =
  'npm install https://tab-debug-dhairya.vercel.app/downloads/dhairya-t-tab-debug-0.3.0.tgz';
const layout = `import { TabDebug } from '@dhairya-t/tab-debug/next';

export default function RootLayout({ children }: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body><TabDebug>{children}</TabDebug></body>
    </html>
  );
}`;
const state = `import { useDebugState } from '@dhairya-t/tab-debug/react';

// Inside your existing client component:
useDebugState('Search', {
  query,
  resultCount: results.length,
  loading,
});`;
const agent = `npx agent-browser open http://localhost:3000
npx agent-browser webmcp list
npx agent-browser webmcp invoke inspect_state --params '{}'`;

export default function Setup() {
  return (
    <div className="replay-app">
      <header className="lab-header">
        <a className="lab-brand" href="/">
          <Terminal size={21} />
          tab-debug
        </a>
        <nav>
          <a href="/">File loading demo</a>
          <a href="/examples">Errors & requests</a>
          <a href="https://github.com/dhairya-t/tab-debug">
            Source <ArrowUpRight size={13} />
          </a>
        </nav>
      </header>
      <main className="setup-main">
        <aside aria-label="Setup sections">
          <span>Next.js App Router</span>
          <a href="#install">Install</a>
          <a href="#layout">Layout</a>
          <a href="#state">Application state</a>
          <a href="#agent">Browser agent</a>
          <a href="#example">Working example</a>
          <a href="#replay">Optional replay</a>
        </aside>
        <article>
          <h1>Add to your app</h1>
          <p>
            Expose this tab’s requests, errors, and selected state to a browser
            agent. No separate MCP server.
          </p>
          <p>
            Your installation observes your own app, in your own tab. It has no
            connection to this demo’s tabs and sends no telemetry.
          </p>
          <section id="install">
            <h2>1. Install</h2>
            <CopyCode label="Terminal">{install}</CopyCode>
            <p className="setup-note">
              v0.3.0 · MIT · Installs the release archive directly. It isn’t on
              the npm registry yet.
            </p>
          </section>
          <section id="layout">
            <h2>2. Wrap your layout</h2>
            <CopyCode label="app/layout.tsx">{layout}</CopyCode>
            <p>
              Keep your existing styles and providers. <code>TabDebug</code>{' '}
              adds no visible UI and only activates in development.
            </p>
            <p className="setup-note">
              It records subsequent browser fetches, uncaught errors, and
              unhandled rejections. Moving to another pathname clears the
              previous page’s debugging context.
            </p>
          </section>
          <section id="state">
            <h2>3. Choose the state to share</h2>
            <CopyCode label="Your client component">{state}</CopyCode>
            <p>
              The hook uses your existing variables. Share only fields useful
              for debugging. Request bodies, headers, and query strings aren’t
              recorded.
            </p>
          </section>
          <section id="agent">
            <h2>4. Connect an agent</h2>
            <p>
              Start your development server, then open the app in a
              WebMCP-capable browser agent. Replace the URL below with your
              local address.
            </p>
            <CopyCode label="Agent terminal">{agent}</CopyCode>
            <p className="setup-note">
              Native WebMCP is experimental. Use an agent-browser browser build
              with WebMCP enabled.{' '}
              <a href="https://github.com/vercel-labs/agent-browser">
                Browser setup ↗
              </a>
            </p>
            <table className="setup-tools">
              <thead>
                <tr>
                  <th>Tool</th>
                  <th>Reads</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <code>get_page_context</code>
                  </td>
                  <td>Current page and error counts</td>
                </tr>
                <tr>
                  <td>
                    <code>inspect_requests</code>
                  </td>
                  <td>Request paths, statuses, duration</td>
                </tr>
                <tr>
                  <td>
                    <code>inspect_errors</code>
                  </td>
                  <td>Captured errors</td>
                </tr>
                <tr>
                  <td>
                    <code>inspect_state</code>
                  </td>
                  <td>The values you chose above</td>
                </tr>
                <tr>
                  <td>
                    <code>inspect_timeline</code>
                  </td>
                  <td>Events in order</td>
                </tr>
              </tbody>
            </table>
          </section>
          <section id="example">
            <h2>Working example</h2>
            <p>
              This form imports the package from the same archive as the install
              command. Fetch a quote, then inspect its state or requests.
            </p>
            <SetupExample />
          </section>
          <section id="replay">
            <h2>Optional: reproduce a race</h2>
            <p>
              The debugging tools work with the setup above. Replaying responses
              and generating a test also require an adapter around your
              application’s async handler.
            </p>
            <a
              className="setup-doc-link"
              href="https://github.com/dhairya-t/tab-debug/blob/main/docs/replay.md"
            >
              Replay integration example <ArrowUpRight size={14} />
            </a>
            <p className="setup-note">
              Browser requests only: this component doesn’t capture server logs,
              XMLHttpRequest, or errors already handled by a React boundary.{' '}
              <a href="https://github.com/dhairya-t/tab-debug/tree/main/packages/tab-debug">
                Full API and React-only setup ↗
              </a>
            </p>
          </section>
        </article>
      </main>
    </div>
  );
}

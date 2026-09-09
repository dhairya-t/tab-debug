import { ArrowUpRight, Terminal } from 'lucide-react';
import './site-header.css';

export function SiteHeader({
  current,
}: {
  current: 'transform' | 'atlas' | 'shipping' | 'setup';
}) {
  return (
    <header className="site-header">
      <a className="site-brand" href="/" aria-label="tab-debug home">
        <Terminal size={21} strokeWidth={1.6} />
        tab-debug
      </a>
      <nav className="site-demos" aria-label="Demos">
        <span>Demos</span>
        <a href="/" aria-current={current === 'transform' ? 'page' : undefined}>
          Transform
        </a>
        <a
          href="/examples"
          aria-current={current === 'atlas' ? 'page' : undefined}
        >
          Atlas
        </a>
        <a
          href="/shipping"
          aria-current={current === 'shipping' ? 'page' : undefined}
        >
          Shipping
        </a>
      </nav>
      <nav className="site-links" aria-label="Project">
        <a
          href="/setup"
          aria-current={current === 'setup' ? 'page' : undefined}
        >
          Add to your app
        </a>
        <a href="https://github.com/dhairya-t/tab-debug" aria-label="GitHub">
          <span>GitHub</span>
          <ArrowUpRight className="site-external-icon" size={13} />
        </a>
      </nav>
    </header>
  );
}

export function AtlasViews({ current }: { current: 'live' | 'replay' }) {
  return (
    <nav className="atlas-views" aria-label="Atlas views">
      <a
        href="/examples"
        aria-current={current === 'live' ? 'page' : undefined}
      >
        Live debugging
      </a>
      <a
        href="/replay"
        aria-current={current === 'replay' ? 'page' : undefined}
      >
        Response replay
      </a>
    </nav>
  );
}

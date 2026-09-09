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
      <nav className="site-demos" aria-label="Examples">
        <a href="/" aria-current={current === 'transform' ? 'page' : undefined}>
          Demo
        </a>
        <a
          href="/replay"
          aria-current={current === 'atlas' ? 'page' : undefined}
        >
          Search example
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

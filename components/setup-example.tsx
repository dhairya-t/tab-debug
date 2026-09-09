'use client';
import { useState } from 'react';
// This example consumes the exact .tgz served by the install command.
import { TabDebug } from '@dhairya-t/tab-debug/next';
import { useDebug, useDebugState } from '@dhairya-t/tab-debug/react';

function Quote() {
  const [country, setCountry] = useState('France');
  const [quote, setQuote] = useState<{
    destination: string;
    cents: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [output, setOutput] = useState('');
  const debug = useDebug();
  useDebugState('Shipping', { country, quote, loading });
  async function loadQuote() {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(
        `/api/shipping?country=${encodeURIComponent(country)}`,
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setQuote(await response.json());
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Request failed');
    } finally {
      setLoading(false);
    }
  }
  return (
    <>
      <div className="setup-example-controls">
        <label>
          Country
          <select
            aria-label="Example country"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
          >
            <option>France</option>
            <option>Canada</option>
            <option>Japan</option>
          </select>
        </label>
        <button className="lab-primary" disabled={loading} onClick={loadQuote}>
          {loading ? 'Loading…' : 'Get shipping quote'}
        </button>
        <output aria-live="polite">
          {quote
            ? `${quote.destination}: $${(quote.cents / 100).toFixed(2)}`
            : 'No quote yet'}
        </output>
      </div>
      {error && <p role="alert">{error}</p>}
      <div className="setup-tool-buttons">
        <button
          disabled={!debug}
          onClick={() =>
            setOutput(JSON.stringify(debug?.callTool('inspect_state'), null, 2))
          }
        >
          Read state
        </button>
        <button
          disabled={!debug}
          onClick={() =>
            setOutput(
              JSON.stringify(debug?.callTool('inspect_requests'), null, 2),
            )
          }
        >
          Read requests
        </button>
      </div>
      {output && <pre data-testid="setup-output">{output}</pre>}
    </>
  );
}

export function SetupExample() {
  const [enabled, setEnabled] = useState(true);
  return (
    <div className="setup-example">
      <div className="setup-example-heading">
        <strong>Try the installed package</strong>
        <label>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          Enable tools
        </label>
      </div>
      <TabDebug enabled={enabled}>
        <Quote />
      </TabDebug>
      <p>
        This public example explicitly enables the tools. Your production build
        leaves them off by default.
      </p>
    </div>
  );
}

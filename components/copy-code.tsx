'use client';
import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
export function CopyCode({
  children,
  label,
}: {
  children: string;
  label: string;
}) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(children);
      setCopied(true);
      setFailed(false);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setFailed(true);
    }
  }
  return (
    <div className="setup-code">
      <div>
        <span>{label}</span>
        <Button
          variant="ghost"
          size="sm"
          aria-label={`Copy ${label}`}
          onClick={copy}
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}{' '}
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
      <pre>
        <code>{children}</code>
      </pre>
      {failed && (
        <p role="status">
          Clipboard unavailable. Select and copy the code above.
        </p>
      )}
    </div>
  );
}

'use client';
import Link from 'next/link';
import { useDebugState } from '@dhairya-t/tab-debug/react';
export default function Page() {
  useDebugState('Home', { visible: true });
  return (
    <main>
      <h1>Integration example</h1>
      <Link href="/other">Other page</Link>
    </main>
  );
}

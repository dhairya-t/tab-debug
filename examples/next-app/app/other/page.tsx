'use client';
import Link from 'next/link';
import { useDebugState } from '@dhairya-t/tab-debug/react';
export default function Page() {
  useDebugState('Other', { visible: true });
  return (
    <main>
      <h1>Other page</h1>
      <Link href="/">Home</Link>
    </main>
  );
}

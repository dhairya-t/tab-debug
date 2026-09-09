'use client';
import { usePathname } from 'next/navigation.js';
import type { ReactNode } from 'react';
import { TabDebugProvider } from './react.tsx';

/** Development-only by default. Does not alter the rendered DOM. */
export function TabDebug({
  children,
  enabled = process.env.NODE_ENV === 'development',
}: {
  children: ReactNode;
  enabled?: boolean;
}) {
  const pathname = usePathname();
  return (
    <TabDebugProvider route={pathname ?? '/'} enabled={enabled}>
      {children}
    </TabDebugProvider>
  );
}

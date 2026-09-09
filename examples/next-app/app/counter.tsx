'use client';
import { useState } from 'react';
import { useDebugState } from '@dhairya-t/tab-debug/react';
export function Counter() {
  const [count, setCount] = useState(0);
  useDebugState('Counter', { count });
  return <button onClick={() => setCount(count + 1)}>Count: {count}</button>;
}

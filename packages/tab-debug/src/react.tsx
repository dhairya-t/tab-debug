'use client';
import {
  Component,
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { PageScope } from './core.ts';
import { registerPageTools, type ModelContext } from './webmcp.ts';
import { attachBrowserTools } from './browser.ts';

const DebugContext = createContext<{ scope: PageScope | null; route: string }>({
  scope: null,
  route: '/',
});

/** React integration; Next.js users can use TabDebug from /next. */
export function TabDebugProvider({
  children,
  route,
  enabled = false,
}: {
  children: ReactNode;
  route: string;
  enabled?: boolean;
}) {
  const [scope] = useState(() => new PageScope());
  useLayoutEffect(() => {
    if (enabled) scope.enterPage(route);
  }, [enabled, route, scope]);
  useLayoutEffect(() => {
    if (!enabled) return;
    const connection = attachBrowserTools(scope);
    return () => connection.dispose();
  }, [enabled, scope]);
  const value = useMemo(
    () => ({ scope: enabled ? scope : null, route }),
    [enabled, route, scope],
  );
  return (
    <DebugContext.Provider value={value}>{children}</DebugContext.Provider>
  );
}

/** Only explicitly supplied values are exposed; a no-op when disabled. */
export function useDebugState(name: string, value: unknown) {
  const { scope, route } = useContext(DebugContext);
  useEffect(() => {
    scope?.setState(name, value);
  }, [scope, route, name, value]);
  useEffect(() => () => scope?.removeState(name), [scope, route, name]);
}

/** For handled errors and explicit diagnostic events. Null when disabled. */
export function useDebug() {
  return useContext(DebugContext).scope;
}
const Context = createContext<PageScope | null>(null);
export function PageScopeProvider({
  scope,
  children,
}: {
  scope: PageScope;
  children: ReactNode;
}) {
  return <Context.Provider value={scope}>{children}</Context.Provider>;
}
export function usePageScope() {
  const scope = useContext(Context);
  if (!scope) throw new Error('PageScopeProvider is required');
  return scope;
}
export function usePageSnapshot() {
  const scope = usePageScope();
  useSyncExternalStore(scope.subscribe, scope.getVersion, () => 0);
  return scope.snapshot();
}
export function useInspectState(name: string, value: unknown) {
  const scope = usePageScope();
  useEffect(() => {
    scope.setState(name, value);
  }, [scope, name, value]);
  useEffect(() => () => scope.removeState(name), [scope, name]);
}
export function useWebMCP(scope: PageScope) {
  const [status, setStatus] = useState<
    'connecting' | 'native' | 'unsupported' | 'error'
  >('connecting');
  useEffect(() => {
    const lifecycle = new AbortController();
    const context = (document as Document & { modelContext?: ModelContext })
      .modelContext;
    registerPageTools(scope, context, lifecycle.signal)
      .then((available) => {
        if (!lifecycle.signal.aborted)
          setStatus(available ? 'native' : 'unsupported');
      })
      .catch(() => {
        if (!lifecycle.signal.aborted) {
          lifecycle.abort();
          setStatus('error');
        }
      });
    return () => lifecycle.abort();
  }, [scope]);
  return status;
}
export class PageScopeBoundary extends Component<
  { scope: PageScope; children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error) {
    this.props.scope.captureError(error, 'React ErrorBoundary');
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

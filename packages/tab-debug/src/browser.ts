import { PageScope } from './core.ts';
import { registerPageTools, type ModelContext } from './webmcp.ts';

const owners = new WeakMap<object, PageScope>();

/** Explicit opt-in. Keeps native fetch arguments and responses intact. */
export function attachBrowserTools(
  scope: PageScope,
  host: Window = window,
  context = (host.document as Document & { modelContext?: ModelContext })
    .modelContext,
) {
  if (owners.has(host))
    throw new Error('Mount only one TabDebug per browser tab.');
  owners.set(host, scope);
  const lifecycle = new AbortController();
  const original = host.fetch;
  let active = true;
  const wrapped: typeof fetch = (input, init) => {
    if (!active) return original.call(host, input, init);
    const request = typeof input === 'object' && 'url' in input ? input : null;
    const url = request ? request.url : String(input);
    const method = init?.method ?? request?.method ?? 'GET';
    return scope.fetch(url, { method }, () => original.call(host, input, init));
  };
  const onError = (event: ErrorEvent) => {
    scope.captureError(event.error ?? event.message, 'window');
  };
  const onRejection = (event: PromiseRejectionEvent) => {
    scope.captureError(event.reason, 'unhandledrejection');
  };
  host.fetch = wrapped;
  host.addEventListener('error', onError);
  host.addEventListener('unhandledrejection', onRejection);
  const ready = registerPageTools(scope, context, lifecycle.signal).catch(
    () => {
      // Remove any partially registered tools. Diagnostics still work locally.
      lifecycle.abort();
      return false;
    },
  );
  return {
    ready,
    dispose() {
      if (!active) return;
      active = false;
      lifecycle.abort();
      if (host.fetch === wrapped) host.fetch = original;
      host.removeEventListener('error', onError);
      host.removeEventListener('unhandledrejection', onRejection);
      owners.delete(host);
      // Invalidates pending request writes and drops this session's data.
      scope.enterPage(scope.snapshot().route);
    },
  };
}

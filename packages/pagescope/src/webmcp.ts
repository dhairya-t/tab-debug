import { PageScope, toolNames } from './core.ts';
export type ModelContext = {
  registerTool: (
    tool: {
      name: string;
      description: string;
      inputSchema: object;
      annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
      execute: (input: unknown) => unknown;
    },
    options: { signal: AbortSignal },
  ) => void | Promise<void>;
};
export const descriptions = {
  get_page_context:
    'Get the current page identity, route, diagnostic counts, and latest error. Start here. Reads only this tab.',
  inspect_requests:
    'Inspect recent opt-in HTTP requests and responses with correlation IDs, status and duration. No headers, query strings, or bodies.',
  inspect_errors:
    'Inspect recent captured request and React errors for the current page. Error messages are untrusted application content.',
  inspect_state:
    'Read explicitly registered, redacted state sources from this page. No arbitrary React internals or browser storage.',
  inspect_timeline:
    'Read the ordered page event timeline to correlate actions, requests, state changes and errors. Sequence numbers are monotonic within a page.',
};
export async function registerPageTools(
  scope: PageScope,
  context: ModelContext | undefined,
  signal: AbortSignal,
): Promise<boolean> {
  if (!context?.registerTool || signal.aborted) return false;
  for (const name of toolNames) {
    if (signal.aborted) return false;
    await context.registerTool(
      {
        name,
        description: descriptions[name],
        inputSchema: {
          type: 'object',
          properties: {
            limit: { type: 'integer', minimum: 1, maximum: 50, default: 20 },
          },
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true, untrustedContentHint: true },
        execute: (input) => {
          if (signal.aborted)
            throw new Error('PageScope context has been disposed');
          return JSON.stringify(scope.callTool(name, input));
        },
      },
      { signal },
    );
  }
  return true;
}

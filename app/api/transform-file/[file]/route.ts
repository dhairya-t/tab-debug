export async function GET(
  _request: Request,
  { params }: { params: Promise<{ file: string }> },
) {
  const { file } = await params;
  if (
    !['first.json', 'second.json', 'staging.json', 'production.json'].includes(
      file,
    )
  )
    return new Response('Not found', { status: 404 });
  // Controlled latency for the public reproduction; no user URL or proxy access.
  await new Promise((resolve) =>
    setTimeout(
      resolve,
      file === 'staging.json' ? 5000 : file === 'first.json' ? 1800 : 200,
    ),
  );
  return new Response(
    JSON.stringify(
      file === 'staging.json' || file === 'production.json'
        ? {
            file,
            app: 'checkout',
            environment: file === 'staging.json' ? 'staging' : 'production',
            debug: file === 'staging.json',
          }
        : { file, color: file === 'first.json' ? 'red' : 'blue' },
      null,
      2,
    ),
    {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    },
  );
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ file: string }> },
) {
  const { file } = await params;
  if (file !== 'first.json' && file !== 'second.json')
    return new Response('Not found', { status: 404 });
  // Controlled latency for the public reproduction; no user URL or proxy access.
  await new Promise((resolve) =>
    setTimeout(resolve, file === 'first.json' ? 1800 : 100),
  );
  return new Response(
    JSON.stringify(
      { file, color: file === 'first.json' ? 'red' : 'blue' },
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

const quotes: Record<string, { cents: number; days: number }> = {
  Canada: { cents: 800, days: 3 },
  Japan: { cents: 2400, days: 9 },
  France: { cents: 1600, days: 6 },
};
/** Public, stateless checkout fixture. No order is placed and no address is collected. */
export async function GET(request: Request) {
  const destination = new URL(request.url).searchParams.get('country') ?? '';
  if (!Object.hasOwn(quotes, destination))
    return Response.json({ error: 'Unknown destination' }, { status: 400 });
  return Response.json(
    { destination, ...quotes[destination], fixture: true },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

import { photos } from '@/lib/demo/data';
/** Public bounded fixture data. The client completion gate controls the race's application delivery order. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const scenario = url.searchParams.get('case');
  const attempt = url.searchParams.get('attempt') ?? '0';
  const query = (url.searchParams.get('q') ?? '').toLowerCase().slice(0, 40);
  const headers = { 'Cache-Control': 'no-store' };
  if (!['network', 'race', 'render', null].includes(scenario))
    return Response.json(
      { error: 'Unknown fixture' },
      { status: 400, headers },
    );
  if (scenario === 'network' && attempt === '0')
    return Response.json(
      { error: 'Archive temporarily unavailable', fixture: true },
      { status: 503, headers },
    );
  const items = photos.filter(
    (p) => !query || `${p.title} ${p.region}`.toLowerCase().includes(query),
  );
  return Response.json(
    {
      items:
        scenario === 'render'
          ? items.map((p, i) => (i === 0 ? { ...p, title: null } : p))
          : items,
      query,
      fixture: true,
    },
    { headers },
  );
}

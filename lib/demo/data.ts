export type Photo = {
  id: string;
  title: string;
  region: string;
  image: string;
  alt: string;
  year: number;
  credit: string;
  source: string;
};
export const photos: Photo[] = [
  {
    id: 'namib',
    title: 'Namib sand sea',
    region: 'Namibia',
    image: '/images/namib-dunes.jpg',
    alt: 'Rust red dune ridges and a pale dry channel in Namibia, Landsat false color',
    year: 2000,
    credit: 'USGS / NASA Earth Observatory',
    source:
      'https://science.nasa.gov/earth/earth-observatory/namib-naukluft-national-park-namibia-2804/',
  },
  {
    id: 'lena',
    title: 'Lena River Delta',
    region: 'Siberia',
    image: '/images/lena-delta.jpg',
    alt: 'Deep blue branching waterways across the Lena River Delta, Landsat false color',
    year: 2000,
    credit: 'USGS / NASA Earth Observatory',
    source:
      'https://science.nasa.gov/earth/earth-observatory/lena-river-delta-2704/',
  },
  {
    id: 'coast',
    title: 'An edge of the Atlantic',
    region: 'Namibia',
    image: '/images/namib-coast.jpg',
    alt: 'The Atlantic Ocean meeting the ochre Namibian coast, natural-color Terra MODIS',
    year: 2011,
    credit: 'NASA MODIS Rapid Response Team',
    source:
      'https://science.nasa.gov/earth/earth-observatory/namibias-protected-coast-76140/',
  },
];
export const scenarios = {
  network: {
    label: 'Silent request failure',
    description:
      'The archive vanishes after an HTTP 503. The UI swallows the error.',
    cause:
      'The error path returns an empty collection, making a failed request look like a successful empty result.',
    fix: 'Check response.ok, retry once, and preserve an explicit error state if recovery fails.',
    before:
      'const res = await fetch(url);\nif (!res.ok) return [];\nreturn (await res.json()).items;',
    after:
      'for (let attempt = 0; attempt < 2; attempt++) {\n  const res = await fetch(urlFor(attempt));\n  if (res.ok) return (await res.json()).items;\n}\nthrow new Error("Archive unavailable");',
  },
  race: {
    label: 'Out-of-order search',
    description:
      'An older search arrives last and overwrites the newer results.',
    cause:
      'Both requests update the same state. Response order is mistaken for user intent.',
    fix: 'Assign a generation to each search and commit a response only if its generation is current.',
    before: 'const data = await search(query);\nsetResults(data.items);',
    after:
      'const request = ++latest.current;\nconst data = await search(query);\nif (request !== latest.current) return;\nsetResults(data.items);',
  },
  render: {
    label: 'Nullable metadata crash',
    description:
      'One missing title crashes a React component during rendering.',
    cause:
      'The API allows a null title, but the component calls toUpperCase() without narrowing the value.',
    fix: 'Normalize nullable display data at the rendering boundary. Keep the original record intact.',
    before: 'return photo.title.toUpperCase();',
    after: 'return (photo.title ?? "Untitled observation")\n  .toUpperCase();',
  },
} as const;
export type Scenario = keyof typeof scenarios;

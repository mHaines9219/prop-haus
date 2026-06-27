import { NextResponse } from 'next/server';
import { loadCatalog } from '@/lib/catalog';
import { keywordSearch } from '@/lib/keyword-search';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LIMIT = 60;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const query = (url.searchParams.get('q') ?? '').slice(0, 200).trim();
  if (!query) {
    return NextResponse.json({ query, matches: [], total: 0 });
  }

  const catalog = await loadCatalog();
  const all = keywordSearch(catalog, query);
  return NextResponse.json({
    query,
    matches: all.slice(0, LIMIT),
    total: all.length,
  });
}

import { NextResponse } from 'next/server';
import { browseCards } from '@/lib/catalog-db';

const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 60;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const category = searchParams.get('category');
  const vendor = searchParams.get('vendor');
  const offset = Math.max(0, Number.parseInt(searchParams.get('offset') ?? '0', 10) || 0);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number.parseInt(searchParams.get('limit') ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT),
  );

  // Filtering, paging and counting all happen in Postgres now. The has-images
  // filter in particular has to: it is a boolean column with a matching index,
  // and comparing the underlying array instead sequential-scans 890 MB.
  const { items, total } = await browseCards({ category, vendor, offset, limit });

  // The catalog only changes on a pipeline load, so let the CDN serve repeat
  // filter/page requests. Each unique URL (category/vendor/offset) caches
  // independently; stale-while-revalidate keeps responses instant after a bump.
  return NextResponse.json(
    { items, total },
    { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' } },
  );
}

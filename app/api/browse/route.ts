import { NextResponse } from 'next/server';
import { loadCatalog } from '@/lib/catalog';

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

  const all = await loadCatalog();
  let filtered = all.filter((i) => i.images.length > 0);
  if (category) filtered = filtered.filter((i) => i.category === category);
  if (vendor) filtered = filtered.filter((i) => i.source === vendor);

  const total = filtered.length;
  const items = filtered.slice(offset, offset + limit);

  return NextResponse.json({ items, total });
}

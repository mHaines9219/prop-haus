// The category layout is the 404 gate for unknown slugs (see layout.tsx).
import { describe, expect, it } from 'vitest';
import { CATEGORIES } from '@/lib/categories';
import CategoryLayout from './layout';

const render = (slug: string) =>
  CategoryLayout({ params: Promise.resolve({ slug }), children: <p>page</p> });

describe('CategoryLayout', () => {
  it('404s on an unknown slug', async () => {
    await expect(render('not-a-category')).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('passes a known slug through to the page', async () => {
    await expect(render(CATEGORIES[0].slug)).resolves.toEqual(<p>page</p>);
  });
});

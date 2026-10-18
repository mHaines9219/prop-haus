import { notFound } from 'next/navigation';
import { CATEGORIES } from '@/lib/categories';

/**
 * Unknown slugs 404 here, not in page.tsx. The page reads searchParams, so it
 * renders per request, and loading.tsx wraps it in a Suspense boundary: by the
 * time the page's own notFound() runs, a 200 shell has already been streamed
 * and the 404 is only a body. A layout renders outside that boundary, so the
 * status is still open when this check throws. The page keeps its own guard
 * for direct renders in tests.
 */
export default async function CategoryLayout({
  params,
  children,
}: {
  params: Promise<{ slug: string }>;
  children: React.ReactNode;
}) {
  const { slug } = await params;
  if (!CATEGORIES.some((c) => c.slug === slug)) notFound();
  return children;
}

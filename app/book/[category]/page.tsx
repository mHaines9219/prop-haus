import { notFound, redirect } from 'next/navigation';
import { CategoryDirectoryPage } from '@/components/vendors/category-directory';
import { VENDOR_CATEGORIES } from '@/lib/vendor-categories';

export async function generateMetadata({ params }: { params: Promise<{ category: string }> }) {
  const { category } = await params;
  const cfg = VENDOR_CATEGORIES[category];
  if (!cfg) return {};
  return {
    title: `${cfg.label} — Prop Haus`,
    description: cfg.blurb,
  };
}

export default async function VendorCategoryPage({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  const { category } = await params;
  const cfg = VENDOR_CATEGORIES[category];
  if (!cfg) notFound();
  // Crew keeps its original home; catering has its own page under /book/catering.
  if (cfg.href !== `/book/${cfg.slug}`) redirect(cfg.href);
  return <CategoryDirectoryPage category={cfg} />;
}

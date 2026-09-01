import { CategoryDirectoryPage } from '@/components/vendors/category-directory';
import { VENDOR_CATEGORIES } from '@/lib/vendor-categories';

export const metadata = {
  title: 'Crew — Prop Haus',
  description: 'Hire extra hands for set, delivery runs, load-in and load-out.',
};

export default function CrewPage() {
  return <CategoryDirectoryPage category={VENDOR_CATEGORIES.crew} />;
}

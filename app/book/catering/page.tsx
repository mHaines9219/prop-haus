import { CategoryDirectoryPage } from '@/components/vendors/category-directory';
import { VENDOR_CATEGORIES } from '@/lib/vendor-categories';

// SCAFFOLD (FUT-1): catering currently works like the other directories —
// partner vendor cards with a request-to-book flow. Menu-level browsing and
// programmatic ordering are the planned upgrade; integration options
// (ezCater Menus/Orders APIs, MealMe ordering API, Uber Direct / DoorDash
// Drive for delivery-only) are written up in TASKS.md · FUT-1.

export const metadata = {
  title: 'Catering — Prop Haus',
  description: 'Craft services and full catering from vetted partner vendors.',
};

const ROADMAP = [
  {
    title: 'Partner vendors',
    body: 'Vetted craft services and catering companies that know call sheets, company moves, and last-minute head-count changes.',
    status: 'Now',
  },
  {
    title: 'Menu browsing',
    body: 'Browse partner menus and build an order per shoot day instead of writing a request note.',
    status: 'Planned',
  },
  {
    title: 'One-click ordering',
    body: 'Catering joins the cart: order food for set the same way you order props, billed through the platform.',
    status: 'Planned',
  },
];

export default function CateringPage() {
  return (
    <CategoryDirectoryPage category={VENDOR_CATEGORIES.catering}>
      {/* Roadmap strip — catering is the one category headed past request-to-book */}
      <section className="border-t border-border">
        <div className="mx-auto w-full max-w-[1600px] px-4 py-12 sm:px-6">
          <p className="font-mono text-[11px] font-medium uppercase leading-[14px] tracking-[0.08em] text-text-tertiary">
            Where catering is headed
          </p>
          <div className="mt-6 grid gap-px bg-border sm:grid-cols-3">
            {ROADMAP.map((r) => (
              <div key={r.title} className="bg-background p-5">
                <div className="flex items-center justify-between">
                  <p className="font-display text-[16px] font-bold leading-[22px]">{r.title}</p>
                  <span className="rounded-md border border-border px-1.5 py-0.5 font-mono text-[10px] uppercase leading-none tracking-[0.06em] text-text-tertiary">
                    {r.status}
                  </span>
                </div>
                <p className="mt-2 text-[13px] leading-[20px] text-text-secondary">{r.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </CategoryDirectoryPage>
  );
}

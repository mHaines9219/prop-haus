import { redirect } from 'next/navigation';

// Cart page has moved to app/cart/page.tsx (Answer Print).
export default function LegacyCartRedirect() {
  redirect('/cart');
}

import { permanentRedirect } from 'next/navigation';

/** Insurance on file now lives on the order profile. */
export default function InsurancePage() {
  permanentRedirect('/account/profile');
}

-- Catalog fixture for the end-to-end run. Applied to the local Supabase stack
-- after migrations (see .github/workflows/ci.yml). Idempotent.
--
-- The app reads the catalog through PostgREST as `prop_items` on the public
-- schema, which no migration defines (the hosted project carries it as drift).
-- The view below mirrors public.catalog_items so the built app runs against a
-- fresh database. Remove it once a migration owns public.prop_items.

begin;

drop view if exists public.prop_items;
create view public.prop_items with (security_invoker = true) as
  select * from public.catalog_items;
grant select on public.prop_items to anon, authenticated, service_role;

delete from catalog.prop_items where id like 'e2e-%';

insert into catalog.prop_items (
  id, source, source_id, name, description, category, subcategory,
  source_category_path, style, era, materials, colors, vibes, setting_type,
  genre_fit, tags, dimensions, vendor, images, source_url, scraped_at,
  price_amount, price_currency, price_unit, plate_mode
) values
(
  'e2e-omega-1', 'omega', 'e2e-1',
  'E2E Walnut Credenza', 'Six-foot mid-century walnut credenza with brass pulls.',
  'storage-credenzas', 'credenzas', array['Furniture', 'Storage'],
  array['mid-century'], '1960s', array['walnut', 'brass'], array['brown'], array['warm'],
  array['office'], array['drama'], array['credenza', 'walnut'],
  '{"width": 72, "depth": 18, "height": 30, "unit": "in"}'::jsonb,
  '{"id": "omega", "name": "Omega Cinema Props", "city": "LA", "sourceUrl": "https://omegacinemaprops.com"}'::jsonb,
  array['https://images.example.com/e2e/credenza.jpg'],
  'https://omegacinemaprops.com/item/e2e-1', now(),
  120, 'USD', 'week', 'cutout'
),
(
  'e2e-omega-2', 'omega', 'e2e-2',
  'E2E Brass Floor Lamp', 'Arc floor lamp, brushed brass, linen shade.',
  'lighting', 'floor lamps', array['Lighting'],
  array['mid-century'], '1970s', array['brass', 'linen'], array['gold'], array['glow'],
  array['living room'], array['comedy'], array['lamp', 'brass'],
  '{"height": 66, "unit": "in"}'::jsonb,
  '{"id": "omega", "name": "Omega Cinema Props", "city": "LA", "sourceUrl": "https://omegacinemaprops.com"}'::jsonb,
  array['https://images.example.com/e2e/lamp.jpg'],
  'https://omegacinemaprops.com/item/e2e-2', now(),
  45, 'USD', 'day', 'cutout'
),
(
  'e2e-hpr-1', 'hpr', 'e2e-1',
  'E2E Leather Club Chair', 'Oxblood leather club chair, nailhead trim.',
  'seating', 'armchairs', array['Furniture', 'Seating'],
  array['art deco'], '1930s', array['leather'], array['red'], array['moody'],
  array['study'], array['noir'], array['chair', 'leather'],
  '{"width": 34, "depth": 36, "height": 32, "unit": "in"}'::jsonb,
  '{"id": "hpr", "name": "Hand Prop Room", "city": "LA", "sourceUrl": "https://www.hpr.com"}'::jsonb,
  array['https://images.example.com/e2e/club-chair.jpg'],
  'https://www.hpr.com/item/e2e-1', now(),
  null, null, null, 'photo'
),
(
  'e2e-hpr-2', 'hpr', 'e2e-2',
  'E2E Bentwood Cafe Chair', 'Thonet-style bentwood chair, caned seat.',
  'seating', 'dining chairs', array['Furniture', 'Seating'],
  array['bistro'], '1920s', array['beech', 'cane'], array['brown'], array['casual'],
  array['cafe'], array['period'], array['chair', 'bentwood'],
  null,
  '{"id": "hpr", "name": "Hand Prop Room", "city": "LA", "sourceUrl": "https://www.hpr.com"}'::jsonb,
  array['https://images.example.com/e2e/cafe-chair.jpg'],
  'https://www.hpr.com/item/e2e-2', now(),
  18, 'USD', 'day', 'cutout'
),
(
  'e2e-hpr-3', 'hpr', 'e2e-3',
  'E2E Unphotographed Stool', 'No photo on the vendor site; must not appear in browse.',
  'seating', 'stools', array['Furniture', 'Seating'],
  null, null, null, null, null, null, null, array['stool'],
  null,
  '{"id": "hpr", "name": "Hand Prop Room", "city": "LA", "sourceUrl": "https://www.hpr.com"}'::jsonb,
  array[]::text[],
  'https://www.hpr.com/item/e2e-3', now(),
  null, null, null, null
);

select catalog.refresh_facets();

commit;

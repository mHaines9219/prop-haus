-- Sep 2026: the /book per-category directories (hair-makeup, styling,
-- lighting-rigging, catering) were removed. /crew is the only directory and
-- filters by role (production assistants, delivery) over contractors.skills.
--
-- Retire the FUT-1 PLACEHOLDER rows seeded by 20260901120000 so the public
-- contractors list stays consistent with the product. Rows already referenced
-- by a crew_request are deactivated rather than deleted (crew_requests has no
-- cascade on contractor_id). The `category` column stays: FUT-1 may still
-- generalize this table later without a schema change.

update public.contractors
   set active = false, updated_at = now()
 where category <> 'crew';

delete from public.contractors c
 where c.category <> 'crew'
   and not exists (
     select 1 from public.crew_requests r where r.contractor_id = c.id
   );

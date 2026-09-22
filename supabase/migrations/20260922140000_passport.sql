-- ============================================================================
-- Passport: the documents a production hands over again and again — driver's
-- license for pickups, W-9, business license, resale certificate, voided
-- check — kept once on the org so checkout, vendor account applications, and
-- outreach can attach them without asking.
--
-- organizations.passport is typed as Passport in lib/passport.ts:
--   documents  { [kind]: { storagePath, name, mime, uploadedAt,
--                          uploadedByUserId?, expiresAt?, reference? } }
--
-- The COI is NOT stored here. It stays at order_profile.insurance.coiDocument
-- and the passport reads through to it, so there is one certificate on file.
-- Tax IDs are never stored as fields; a W-9 is kept only as the PDF the user
-- uploaded, in the private paperwork bucket under <org_id>/passport/.
-- ============================================================================

alter table public.organizations
  add column if not exists passport jsonb not null default '{}';

comment on column public.organizations.passport is
  'Documents kept on file for checkout and vendor paperwork, typed as Passport in '
  'lib/passport.ts: { documents: { drivers_license?, w9?, business_license?, '
  'resale_certificate?, voided_check? } }. Bytes live in the private paperwork '
  'bucket at <org_id>/passport/<uuid>.<ext>. The COI lives on order_profile.';

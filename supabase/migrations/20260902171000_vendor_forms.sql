-- ============================================================================
-- MVP-12: vendor paperwork filled from the order profile via Anvil.
--
-- vendor_forms      what each vendor makes a new customer sign: the Anvil PDF
--                   template for it and a field map from template aliases to
--                   order-profile paths (lib/forms/map.ts).
-- order_documents   one row per filled form on an order: where the PDF lives,
--                   whether the user still has to sign it, and what Anvil
--                   knows it as.
--
-- Prop Haus fills DATA fields the production supplied and authorized. It never
-- applies a signature, initial, or date-of-signature. Signature fields are
-- mapped to `$signer.*` and left for the user inside the Anvil e-sign session.
-- Tax IDs are never stored on the org; an EIN a credit application needs is
-- also `$signer.ein`, collected by Anvil from the signer.
-- ============================================================================

create table public.vendor_forms (
  id                  uuid        primary key default gen_random_uuid(),
  vendor_id           text        not null,
  kind                text        not null
                        check (kind in ('rental_agreement','credit_application','new_account','coi_request','w9_request','other')),
  label               text        not null,
  anvil_template_eid  text,
  field_map           jsonb       not null default '{}',
  requires_signature  boolean     not null default false,
  mode                text        not null default 'auto' check (mode in ('auto','manual')),
  notes               text,
  updated_at          timestamptz not null default now()
);

create index vendor_forms_vendor_idx on public.vendor_forms (vendor_id);

alter table public.vendor_forms enable row level security;

create policy "anyone signed in reads vendor forms" on public.vendor_forms
  for select to authenticated using (true);

revoke insert, update, delete on public.vendor_forms from authenticated, anon;

comment on table public.vendor_forms is
  'A form a vendor requires from new customers. field_map: { <anvil alias>: "<path>" } '
  'where path is an order-profile path (company.legalName), $order.<x>, $vendor.<x>, '
  '$form.<x>, or $signer.<x> (left blank; the signer completes it in Anvil). '
  'mode=manual: the vendor needs a wet signature or notary; we pre-fill and hand over. '
  'anvil_template_eid is null until the template is uploaded to Anvil.';

-- The exact additional-insured wording a vendor wants on the COI, read by
-- coi_request forms as $vendor.additionalInsuredWording.
alter table public.vendor_insurance_minimums
  add column if not exists additional_insured_wording text;

-- ---------------------------------------------------------------------------
-- order_documents
-- ---------------------------------------------------------------------------
create table public.order_documents (
  id                         uuid        primary key default gen_random_uuid(),
  org_id                     uuid        not null references public.organizations(id) on delete cascade,
  order_id                   uuid        not null references public.orders(id) on delete cascade,
  vendor_id                  text        not null,
  vendor_form_id             uuid        references public.vendor_forms(id) on delete set null,
  kind                       text        not null,
  label                      text        not null,
  status                     text        not null default 'filled'
                               check (status in ('filled','awaiting_signature','signed','manual','failed','skipped')),
  storage_path               text,
  signed_storage_path        text,
  anvil_packet_eid           text,
  anvil_document_group_eid   text,
  sign_url                   text,
  error                      text,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);

create index order_documents_order_idx on public.order_documents (order_id);
create index order_documents_org_status_idx on public.order_documents (org_id, status);
create index order_documents_packet_idx on public.order_documents (anvil_packet_eid);

alter table public.order_documents enable row level security;

create policy "members read org order documents" on public.order_documents
  for select to authenticated
  using (org_id in (select private.current_user_org_ids()));

revoke insert, update, delete on public.order_documents from authenticated, anon;

comment on table public.order_documents is
  'A vendor form filled for an order from the org''s order profile. Bytes live in '
  'the private paperwork bucket at storage_path (signed copy at signed_storage_path); '
  'downloads go through short-lived signed URLs. Written only by the service role. '
  'error holds the labels of fields left blank, or the failure reason.';

-- ---------------------------------------------------------------------------
-- Seed: PLACEHOLDER form requirements. anvil_template_eid stays null until
-- Matthew uploads each vendor's PDF to Anvil and pastes the eid here; the mock
-- filler ignores it. Field maps use the alias names the Anvil template should
-- be given.
-- ---------------------------------------------------------------------------
insert into public.vendor_forms (vendor_id, kind, label, field_map, requires_signature, mode, notes) values
  -- PLACEHOLDER: replace with real data
  ('omega', 'rental_agreement', 'Rental agreement',
   '{"companyName":"company.legalName","dba":"company.dba","companyAddress":"company.address","contactName":"contacts.ordering.name","contactEmail":"contacts.ordering.email","contactPhone":"contacts.ordering.phone","rentalStart":"$order.rentalStart","rentalEnd":"$order.rentalEnd","deliveryAddress":"$order.deliveryAddress","orderRef":"$order.ref","signature":"$signer.signature","dateSigned":"$signer.dateSigned"}',
   true, 'auto', 'Standard rental terms. The user signs in Anvil.'),
  -- PLACEHOLDER: replace with real data
  ('omega', 'credit_application', 'New account and credit application',
   '{"legalName":"company.legalName","entityType":"company.entityType","billingAddress":"company.billingAddress","apName":"contacts.accountsPayable.name","apEmail":"contacts.accountsPayable.email","apPhone":"contacts.accountsPayable.phone","website":"company.website","ein":"$signer.ein","signature":"$signer.signature","dateSigned":"$signer.dateSigned"}',
   true, 'auto', 'The EIN is never stored on the org: Anvil collects it from the signer inside the e-sign session ($signer.ein).'),
  -- PLACEHOLDER: replace with real data
  ('hpr', 'rental_agreement', 'Rental agreement',
   '{"productionCompany":"company.legalName","contact":"contacts.ordering.name","email":"contacts.ordering.email","phone":"contacts.ordering.phone","pickupDate":"$order.rentalStart","returnDate":"$order.rentalEnd","items":"$order.itemList","signature":"$signer.signature","dateSigned":"$signer.dateSigned"}',
   true, 'auto', null),
  -- PLACEHOLDER: replace with real data
  ('hpr', 'coi_request', 'Certificate of insurance request',
   '{"namedInsured":"company.legalName","carrier":"insurance.carrier","policyNumber":"insurance.policyNumber","glLimit":"insurance.glLimit","aggregateLimit":"insurance.aggregateLimit","expiresAt":"insurance.expiresAt","brokerName":"insurance.broker.name","brokerEmail":"insurance.broker.email","additionalInsured":"$vendor.additionalInsuredWording","rentalStart":"$order.rentalStart","rentalEnd":"$order.rentalEnd"}',
   false, 'auto', 'Forwarded to the production''s broker; the broker issues the certificate. The additional-insured wording comes from vendor_insurance_minimums.additional_insured_wording.'),
  -- PLACEHOLDER: replace with real data
  ('ec', 'new_account', 'New customer account form',
   '{"companyName":"company.legalName","dba":"company.dba","address":"company.address","orderingContact":"contacts.ordering.name","orderingEmail":"contacts.ordering.email","apContact":"contacts.accountsPayable.name","apEmail":"contacts.accountsPayable.email","signature":"$signer.signature","dateSigned":"$signer.dateSigned"}',
   true, 'auto', null),
  -- PLACEHOLDER: replace with real data
  ('heritage', 'rental_agreement', 'Rental agreement (notarized)',
   '{"companyName":"company.legalName","companyAddress":"company.address","contactName":"contacts.ordering.name","contactPhone":"contacts.ordering.phone","rentalStart":"$order.rentalStart","rentalEnd":"$order.rentalEnd"}',
   true, 'manual', 'Needs a wet signature and a notary. Pre-filled where the template allows; the user prints, signs, and returns it.'),
  -- PLACEHOLDER: replace with real data
  ('propheaven', 'w9_request', 'W-9 request',
   '{"companyName":"company.legalName","contactName":"contacts.ordering.name","contactEmail":"contacts.ordering.email","orderRef":"$order.ref"}',
   false, 'auto', 'A request for the production''s own W-9. The user attaches their W-9 from Paperwork.'),
  -- PLACEHOLDER: replace with real data
  ('universal', 'coi_request', 'Certificate of insurance request',
   '{"namedInsured":"company.legalName","carrier":"insurance.carrier","policyNumber":"insurance.policyNumber","glLimit":"insurance.glLimit","aggregateLimit":"insurance.aggregateLimit","workersComp":"insurance.workersCompLimit","expiresAt":"insurance.expiresAt|date:YYYY-MM-DD","brokerEmail":"insurance.broker.email","additionalInsured":"$vendor.additionalInsuredWording"}',
   false, 'auto', 'Forwarded to the production''s broker.');

-- PLACEHOLDER: replace with real data
update public.vendor_insurance_minimums
set additional_insured_wording = vendor_name || ', its parent, subsidiaries, officers, employees and agents are named as additional insured with respect to the rental of equipment and property.'
where vendor_id in ('hpr', 'universal') and additional_insured_wording is null;

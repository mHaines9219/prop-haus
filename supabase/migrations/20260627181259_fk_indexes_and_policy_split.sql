-- Performance advisor follow-ups.

-- 1) Covering indexes for foreign keys (RLS filters heavily on org_id).
create index on public.documents (org_id);
create index on public.documents (uploaded_by);
create index on public.events (user_id);
create index on public.memberships (user_id);
create index on public.profiles (org_id);

-- 2) Remove SELECT overlap from the FOR ALL write policies by splitting them into
--    explicit insert/update/delete policies (the member read policies already exist).

-- memberships: admins manage writes only.
drop policy "admins manage memberships" on public.memberships;
create policy "admins insert memberships" on public.memberships
  for insert to authenticated with check (private.is_org_admin(org_id));
create policy "admins update memberships" on public.memberships
  for update to authenticated using (private.is_org_admin(org_id)) with check (private.is_org_admin(org_id));
create policy "admins delete memberships" on public.memberships
  for delete to authenticated using (private.is_org_admin(org_id));

-- org_vendor_accounts: members write only.
drop policy "members write vendor accounts" on public.org_vendor_accounts;
create policy "members insert vendor accounts" on public.org_vendor_accounts
  for insert to authenticated with check (org_id in (select private.current_user_org_ids()));
create policy "members update vendor accounts" on public.org_vendor_accounts
  for update to authenticated using (org_id in (select private.current_user_org_ids())) with check (org_id in (select private.current_user_org_ids()));
create policy "members delete vendor accounts" on public.org_vendor_accounts
  for delete to authenticated using (org_id in (select private.current_user_org_ids()));

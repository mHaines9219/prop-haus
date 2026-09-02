-- ============================================================================
-- MVP-11: outbound_messages — the vendor request emails an order sends.
--
-- One row per vendor per order, written by the checkout after() hook: the
-- message as it went out (subject, both bodies, attachments by storage path),
-- the provider's id, and sent/failed with the error. `edited` marks a body the
-- user changed on the cart before the click.
--
-- Nothing is scheduled here: the click sends. Retry re-sends the stored body.
-- ============================================================================

create table public.outbound_messages (
  id                  uuid        primary key default gen_random_uuid(),
  org_id              uuid        not null references public.organizations(id) on delete cascade,
  order_id            uuid        not null references public.orders(id) on delete cascade,
  vendor_id           text        not null,
  vendor_name         text        not null,
  to_email            text        not null,
  cc_emails           text[]      not null default '{}',
  reply_to            text        not null,
  subject             text        not null,
  body_text           text        not null,
  body_html           text        not null,
  attachments         jsonb       not null default '[]',  -- [{ name, storagePath, contentType }]
  status              text        not null default 'sending'
                                    check (status in ('sending','sent','failed')),
  sent_at             timestamptz,
  provider_message_id text,
  error               text,
  edited              boolean     not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index outbound_messages_org_idx   on public.outbound_messages (org_id);
create index outbound_messages_order_idx on public.outbound_messages (order_id);

alter table public.outbound_messages enable row level security;

create policy "members read org outbound messages" on public.outbound_messages
  for select to authenticated
  using (org_id in (select private.current_user_org_ids()));

revoke insert, update, delete on public.outbound_messages from authenticated, anon;

comment on table public.outbound_messages is
  'A vendor request email sent for an order, as it went out. Written only by
   the service role from the checkout hook and the retry route.';

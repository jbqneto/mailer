-- Internal persistence for the Email Gateway.
-- Keep this schema private: the gateway accesses it server-side with a
-- Supabase service key. It must never be used from a browser.
create schema if not exists email_gateway;

create table if not exists email_gateway.email_deliveries (
  id text primary key,
  project_id text not null,
  template text not null,
  recipients jsonb not null,
  subject text not null,
  status text not null check (status in ('processing', 'accepted', 'failed')),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  failed_at timestamptz,
  provider_message_id text,
  error_code text,
  idempotency_key text,
  payload_hash text,
  constraint email_deliveries_recipients_array check (jsonb_typeof(recipients) = 'array')
);

create unique index if not exists email_deliveries_project_idempotency_key_uq
  on email_gateway.email_deliveries (project_id, idempotency_key)
  where idempotency_key is not null;

create index if not exists email_deliveries_project_created_at_idx
  on email_gateway.email_deliveries (project_id, created_at desc);

create index if not exists email_deliveries_status_created_at_idx
  on email_gateway.email_deliveries (status, created_at desc);

alter table email_gateway.email_deliveries enable row level security;

-- The table is intentionally not exposed to anon/authenticated clients.
revoke all on schema email_gateway from anon, authenticated;
revoke all on email_gateway.email_deliveries from anon, authenticated;
grant usage on schema email_gateway to service_role;
grant select, insert, update, delete on email_gateway.email_deliveries to service_role;

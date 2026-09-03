-- Mailer-owned email accounts and project authorization.
-- SMTP provider connection details remain in code through SmtpProvider/SmtpAdapter.
-- The email_gateway schema is the gateway's private persistence boundary.
create schema if not exists email_gateway;

create table if not exists email_gateway.email_accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  email text not null unique,
  provider text not null,
  encrypted_credentials jsonb not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint email_accounts_credentials_object_check
    check (jsonb_typeof(encrypted_credentials) = 'object')
);

create table if not exists email_gateway.project_email_accounts (
  project_id text not null,
  email_account_id uuid not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (project_id, email_account_id),
  constraint project_email_accounts_email_account_fk
    foreign key (email_account_id)
    references email_gateway.email_accounts(id)
    on delete cascade
);

create unique index if not exists project_email_accounts_one_default_uq
  on email_gateway.project_email_accounts (project_id)
  where is_default;

create index if not exists project_email_accounts_email_account_idx
  on email_gateway.project_email_accounts (email_account_id);

alter table email_gateway.email_accounts enable row level security;
alter table email_gateway.project_email_accounts enable row level security;

revoke all on schema email_gateway from anon, authenticated;
revoke all on email_gateway.email_accounts from anon, authenticated;
revoke all on email_gateway.project_email_accounts from anon, authenticated;

grant usage on schema email_gateway to service_role;
grant select, insert, update, delete on email_gateway.email_accounts to service_role;
grant select, insert, update, delete on email_gateway.project_email_accounts to service_role;

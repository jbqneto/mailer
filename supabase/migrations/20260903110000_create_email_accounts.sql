-- Mailer-owned email accounts and project authorization.
-- SMTP provider connection details remain in code through SmtpProvider/SmtpAdapter.
create schema if not exists mailer;

create table if not exists mailer.email_accounts (
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

create table if not exists mailer.project_email_accounts (
  project_id text not null,
  email_account_id uuid not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (project_id, email_account_id),
  constraint project_email_accounts_email_account_fk
    foreign key (email_account_id)
    references mailer.email_accounts(id)
    on delete cascade
);

create unique index if not exists project_email_accounts_one_default_uq
  on mailer.project_email_accounts (project_id)
  where is_default;

create index if not exists project_email_accounts_email_account_idx
  on mailer.project_email_accounts (email_account_id);

alter table mailer.email_accounts enable row level security;
alter table mailer.project_email_accounts enable row level security;

revoke all on schema mailer from anon, authenticated;
revoke all on mailer.email_accounts from anon, authenticated;
revoke all on mailer.project_email_accounts from anon, authenticated;

grant usage on schema mailer to service_role;
grant select, insert, update, delete on mailer.email_accounts to service_role;
grant select, insert, update, delete on mailer.project_email_accounts to service_role;

-- Pin each delivery/job to the account selected at request time.
-- This prevents a later default-account change from changing an already queued email.
alter table email_gateway.email_deliveries
  add column if not exists email_account_id uuid;

alter table email_gateway.email_deliveries
  add constraint email_deliveries_email_account_fk
  foreign key (email_account_id)
  references email_gateway.email_accounts(id)
  on delete restrict;

create index if not exists email_deliveries_email_account_idx
  on email_gateway.email_deliveries (email_account_id);

alter table email_gateway.email_jobs
  add column if not exists email_account_id uuid;

alter table email_gateway.email_jobs
  add constraint email_jobs_email_account_fk
  foreign key (email_account_id)
  references email_gateway.email_accounts(id)
  on delete restrict;

create index if not exists email_jobs_email_account_idx
  on email_gateway.email_jobs (email_account_id);

-- These columns remain nullable for compatibility with any rows created by
-- the legacy SMTP configuration. New gateway writes always provide the id.

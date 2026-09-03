-- Pin each delivery/job to the account selected at request time.
-- This prevents a later default-account change from changing an already queued email.
alter table email_gateway.email_deliveries
  add column if not exists email_account_id uuid;

alter table email_gateway.email_deliveries
  add constraint email_deliveries_email_account_fk
  foreign key (email_account_id)
  references mailer.email_accounts(id)
  on delete restrict;

create index if not exists email_deliveries_email_account_idx
  on email_gateway.email_deliveries (email_account_id);

alter table email_gateway.email_jobs
  add column if not exists email_account_id uuid;

alter table email_gateway.email_jobs
  add constraint email_jobs_email_account_fk
  foreign key (email_account_id)
  references mailer.email_accounts(id)
  on delete restrict;

create index if not exists email_jobs_email_account_idx
  on email_gateway.email_jobs (email_account_id);

-- Existing rows cannot be safely assigned to an account because the previous
-- implementation selected SMTP credentials from project configuration.
-- The gateway therefore requires the new column for all future records.
alter table email_gateway.email_deliveries
  alter column email_account_id set not null;

alter table email_gateway.email_jobs
  alter column email_account_id set not null;

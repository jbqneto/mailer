-- Make email_account_id NOT NULL in deliveries and jobs.
-- The database is empty (no legacy rows), so this is safe to apply directly.

alter table email_gateway.email_deliveries
  alter column email_account_id set not null;

alter table email_gateway.email_jobs
  alter column email_account_id set not null;
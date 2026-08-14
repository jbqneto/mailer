-- Durable queue for the email worker. The service-role-only grants below keep
-- rendered message content outside browser/client access.
create table if not exists email_gateway.email_jobs (
  id text primary key,
  delivery_id text not null unique references email_gateway.email_deliveries(id) on delete cascade,
  project_id text not null,
  template text not null,
  message jsonb not null,
  status text not null check (status in ('queued', 'processing', 'completed', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 3 check (max_attempts >= 1),
  available_at timestamptz not null default now(),
  locked_until timestamptz,
  locked_by text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists email_jobs_claim_idx
  on email_gateway.email_jobs (status, available_at, created_at);

create index if not exists email_jobs_delivery_idx
  on email_gateway.email_jobs (delivery_id);

alter table email_gateway.email_jobs enable row level security;
revoke all on email_gateway.email_jobs from anon, authenticated;
grant select, insert, update, delete on email_gateway.email_jobs to service_role;

create or replace function email_gateway.claim_email_jobs(
  p_worker_id text,
  p_limit integer,
  p_lease_seconds integer
)
returns setof email_gateway.email_jobs
language plpgsql
set search_path = email_gateway, public
as $$
begin
  update email_gateway.email_jobs
  set status = 'failed',
      locked_until = null,
      locked_by = null,
      last_error = 'LEASE_EXPIRED_MAX_ATTEMPTS',
      updated_at = now()
  where status = 'processing'
    and locked_until < now()
    and attempts >= max_attempts;

  return query
  with candidates as (
    select id
    from email_gateway.email_jobs
    where (
      (status = 'queued' and available_at <= now())
      or (status = 'processing' and locked_until < now())
    )
    and attempts < max_attempts
    order by available_at asc, created_at asc
    for update skip locked
    limit greatest(p_limit, 1)
  )
  update email_gateway.email_jobs as jobs
  set status = 'processing',
      attempts = jobs.attempts + 1,
      locked_until = now() + make_interval(secs => greatest(p_lease_seconds, 1)),
      locked_by = p_worker_id,
      updated_at = now()
  from candidates
  where jobs.id = candidates.id
  returning jobs.*;
end;
$$;

revoke all on function email_gateway.claim_email_jobs(text, integer, integer) from public;
grant execute on function email_gateway.claim_email_jobs(text, integer, integer) to service_role;

create extension if not exists pgcrypto;

create table if not exists audit_events (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  actor text not null,
  action text not null check (action in ('CREATE', 'UPDATE', 'DELETE')),
  queue_name text not null,
  cluster_name text not null,
  outcome text not null check (outcome in ('SUCCESS', 'FAILED')),
  summary text not null,
  request_id uuid not null,
  source_ip inet,
  before_state jsonb,
  after_state jsonb,
  error_code text,
  created_at timestamptz not null default now()
);

create index if not exists audit_events_queue_time_idx on audit_events (queue_name, occurred_at desc);
create index if not exists audit_events_actor_time_idx on audit_events (actor, occurred_at desc);
create index if not exists audit_events_time_idx on audit_events (occurred_at desc);

create or replace function deny_audit_mutation() returns trigger as $$
begin
  raise exception 'audit_events is append-only';
end;
$$ language plpgsql;

drop trigger if exists audit_events_immutable on audit_events;
create trigger audit_events_immutable
before update or delete on audit_events
for each row execute function deny_audit_mutation();

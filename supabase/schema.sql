-- OpenClaw Agent Command Center schema
create extension if not exists pgcrypto;

create table if not exists public.agent_buckets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  color text,
  endpoint_key text not null unique,
  created_by uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.bucket_items (
  id uuid primary key default gen_random_uuid(),
  bucket_id uuid not null references public.agent_buckets(id) on delete cascade,
  title text,
  source text not null default 'manual',
  shared_url text,
  raw_text text,
  normalized_text text not null,
  status text not null default 'queued', -- queued | in_progress | done | failed
  last_agent_id text,
  last_update_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.agent_logs (
  id uuid primary key default gen_random_uuid(),
  bucket_id uuid not null references public.agent_buckets(id) on delete cascade,
  bucket_item_id uuid references public.bucket_items(id) on delete set null,
  agent_id text not null,
  status text not null default 'working', -- started | working | complete | failed
  summary text,
  output text not null,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_bucket_items_bucket_status_created
  on public.bucket_items(bucket_id, status, created_at);

create index if not exists idx_agent_logs_bucket_created
  on public.agent_logs(bucket_id, created_at desc);

alter table public.agent_buckets enable row level security;
alter table public.bucket_items enable row level security;
alter table public.agent_logs enable row level security;

-- Team model: all authenticated users can read/write everything.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'agent_buckets'
      and policyname = 'agent_buckets_authenticated_full'
  ) then
    create policy "agent_buckets_authenticated_full"
      on public.agent_buckets
      for all
      to authenticated
      using (true)
      with check (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'bucket_items'
      and policyname = 'bucket_items_authenticated_full'
  ) then
    create policy "bucket_items_authenticated_full"
      on public.bucket_items
      for all
      to authenticated
      using (true)
      with check (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'agent_logs'
      and policyname = 'agent_logs_authenticated_full'
  ) then
    create policy "agent_logs_authenticated_full"
      on public.agent_logs
      for all
      to authenticated
      using (true)
      with check (true);
  end if;
end $$;

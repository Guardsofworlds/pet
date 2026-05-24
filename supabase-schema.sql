-- PawTrail Supabase schema
-- Run in Supabase SQL editor, then deploy supabase/functions/listing-guard.

create extension if not exists pgcrypto;

create table if not exists public.listings (
  id uuid primary key default gen_random_uuid(),
  client_id text unique,
  source text not null default 'public',
  type text not null check (type in ('lost', 'found')),
  species text not null,
  name text,
  breed text,
  color text,
  size text,
  age text,
  photo text,
  photos jsonb not null default '[]'::jsonb,
  location text,
  zip text,
  happened_at timestamptz,
  contact text,
  poster jsonb not null default '{}'::jsonb,
  features text,
  reward numeric,
  condition text,
  custody text,
  status text not null default 'active',
  posted_at timestamptz not null default now(),
  verified_source boolean not null default false,
  stay_deadline timestamptz,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.listing_submissions (
  id uuid primary key default gen_random_uuid(),
  ip_hash text not null,
  contact_hash text,
  listing_id text,
  kind text,
  created_at timestamptz not null default now()
);

create index if not exists listing_submissions_ip_created_idx
  on public.listing_submissions (ip_hash, created_at desc);

create table if not exists public.moderation_subjects (
  id uuid primary key default gen_random_uuid(),
  subject text not null unique,
  status text not null default 'clear' check (status in ('clear', 'suspended', 'banned')),
  reason text,
  updated_at timestamptz not null default now()
);

create table if not exists public.moderation_actions (
  id uuid primary key default gen_random_uuid(),
  subject text not null,
  action text not null check (action in ('clear', 'suspend', 'ban', 'auto_limit')),
  reason text,
  created_at timestamptz not null default now()
);

alter table public.listings enable row level security;
alter table public.listing_submissions enable row level security;
alter table public.moderation_subjects enable row level security;
alter table public.moderation_actions enable row level security;

create policy "Public can read active listings"
  on public.listings for select
  using (status = 'active');

create policy "Public can submit listings"
  on public.listings for insert
  with check (status = 'active');

create policy "Public can record moderation actions"
  on public.moderation_actions for insert
  with check (true);

create or replace function public.apply_moderation_action()
returns trigger
language plpgsql
security definer
as $$
declare
  next_status text;
begin
  next_status := case new.action
    when 'ban' then 'banned'
    when 'suspend' then 'suspended'
    when 'auto_limit' then 'suspended'
    else 'clear'
  end;

  insert into public.moderation_subjects (subject, status, reason, updated_at)
  values (new.subject, next_status, new.reason, now())
  on conflict (subject) do update
    set status = excluded.status,
        reason = excluded.reason,
        updated_at = now();

  return new;
end;
$$;

drop trigger if exists moderation_actions_apply on public.moderation_actions;
create trigger moderation_actions_apply
after insert on public.moderation_actions
for each row execute function public.apply_moderation_action();

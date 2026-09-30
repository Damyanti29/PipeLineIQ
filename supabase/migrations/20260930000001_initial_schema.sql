-- RepoSentinel initial schema
-- Users come from Supabase Auth (auth.users). Every user-owned row links back to auth.users.

create extension if not exists pgcrypto;

-- ─── updated_at helper ────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ─── github_installations ─────────────────────────────────────────
create table public.github_installations (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  installation_id  bigint not null,
  account_login    text not null,
  account_type     text not null,
  created_at       timestamptz not null default now(),
  unique (user_id, installation_id)
);
create index github_installations_installation_id_idx on public.github_installations (installation_id);

-- ─── repositories ─────────────────────────────────────────────────
create table public.repositories (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users (id) on delete cascade,
  installation_id     bigint not null,
  github_repo_id      bigint not null,
  name                text not null,
  full_name           text not null,
  owner               text not null,
  default_branch      text not null default 'main',
  html_url            text not null,
  monitoring_enabled  boolean not null default true,
  -- Secret used by the SDK (inside the DSN) to authenticate error ingestion.
  ingest_key          text not null default encode(gen_random_bytes(24), 'hex'),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (user_id, github_repo_id)
);
create index repositories_github_repo_id_idx on public.repositories (github_repo_id);
create trigger repositories_updated_at before update on public.repositories
  for each row execute function public.set_updated_at();

-- ─── errors (one row per fingerprint group) ───────────────────────
create table public.errors (
  id             uuid primary key default gen_random_uuid(),
  repository_id  uuid not null references public.repositories (id) on delete cascade,
  fingerprint    text not null,
  error_type     text not null,
  message        text not null,
  stack_trace    text,
  file_name      text,
  line_number    integer,
  column_number  integer,
  severity       text not null default 'medium' check (severity in ('critical', 'high', 'medium', 'low')),
  environment    text not null default 'production',
  occurrences    integer not null default 1,
  status         text not null default 'open' check (status in ('open', 'resolved', 'ignored')),
  ai_analysis    jsonb,
  first_seen     timestamptz not null default now(),
  last_seen      timestamptz not null default now(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (repository_id, fingerprint)
);
create index errors_repository_last_seen_idx on public.errors (repository_id, last_seen desc);
create index errors_status_idx on public.errors (status);
create index errors_severity_idx on public.errors (severity);
create trigger errors_updated_at before update on public.errors
  for each row execute function public.set_updated_at();

-- ─── error_events (one row per occurrence) ────────────────────────
create table public.error_events (
  id             uuid primary key default gen_random_uuid(),
  error_id       uuid not null references public.errors (id) on delete cascade,
  repository_id  uuid not null references public.repositories (id) on delete cascade,
  "timestamp"    timestamptz not null default now(),
  request_url    text,
  user_agent     text,
  environment    text,
  metadata       jsonb not null default '{}'::jsonb
);
create index error_events_error_timestamp_idx on public.error_events (error_id, "timestamp" desc);
create index error_events_repository_timestamp_idx on public.error_events (repository_id, "timestamp" desc);

-- ─── incidents ────────────────────────────────────────────────────
create table public.incidents (
  id                    uuid primary key default gen_random_uuid(),
  repository_id         uuid not null references public.repositories (id) on delete cascade,
  error_id              uuid not null references public.errors (id) on delete cascade,
  title                 text not null,
  severity              text not null check (severity in ('critical', 'high', 'medium', 'low')),
  status                text not null default 'open' check (status in ('open', 'investigating', 'resolved', 'ignored')),
  slack_channel_id      text,
  slack_message_ts      text,
  github_issue_number   integer,
  github_issue_url      text,
  -- Short-lived lock that prevents two concurrent requests creating duplicate GitHub issues.
  github_issue_lock_at  timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  resolved_at           timestamptz
);
create index incidents_repository_created_idx on public.incidents (repository_id, created_at desc);
create index incidents_status_idx on public.incidents (status);
-- At most one active incident per error group.
create unique index incidents_one_active_per_error_idx on public.incidents (error_id)
  where status in ('open', 'investigating');
create trigger incidents_updated_at before update on public.incidents
  for each row execute function public.set_updated_at();

-- ─── slack_integrations ───────────────────────────────────────────
create table public.slack_integrations (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null unique references auth.users (id) on delete cascade,
  workspace_id    text not null,
  workspace_name  text not null,
  channel_id      text not null,
  channel_name    text,
  -- AES-256-GCM encrypted by the backend. Never readable by clients (no RLS policies).
  access_token    text not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index slack_integrations_workspace_idx on public.slack_integrations (workspace_id);
create trigger slack_integrations_updated_at before update on public.slack_integrations
  for each row execute function public.set_updated_at();

-- ─── github_events (verified webhook deliveries for monitored repos) ─
create table public.github_events (
  id             uuid primary key default gen_random_uuid(),
  repository_id  uuid not null references public.repositories (id) on delete cascade,
  delivery_id    text not null,
  event_type     text not null,
  action         text,
  title          text,
  status         text,
  ref            text,
  sha            text,
  actor          text,
  url            text,
  created_at     timestamptz not null default now(),
  unique (repository_id, delivery_id)
);
create index github_events_repository_created_idx on public.github_events (repository_id, created_at desc);

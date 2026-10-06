-- PipelineIQ initial schema
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
-- Row Level Security.
-- The backend uses the service role for privileged writes (ingestion, webhooks, integrations).
-- Authenticated users may only read their own data, and may only change a few status columns.

alter table public.github_installations enable row level security;
alter table public.repositories         enable row level security;
alter table public.errors               enable row level security;
alter table public.error_events         enable row level security;
alter table public.incidents            enable row level security;
alter table public.slack_integrations   enable row level security;
alter table public.github_events        enable row level security;

-- Helper: does the current user own this repository?
create or replace function public.owns_repository(p_repository_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.repositories r
    where r.id = p_repository_id and r.user_id = auth.uid()
  );
$$;

-- github_installations: read own, writes via backend only.
create policy "installations_select_own" on public.github_installations
  for select to authenticated using (user_id = auth.uid());

-- repositories: read own; only monitoring_enabled is user-writable.
-- Inserts happen in the backend after GitHub access is verified.
create policy "repositories_select_own" on public.repositories
  for select to authenticated using (user_id = auth.uid());
create policy "repositories_update_own" on public.repositories
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- errors
create policy "errors_select_own" on public.errors
  for select to authenticated using (public.owns_repository(repository_id));
create policy "errors_update_own" on public.errors
  for update to authenticated using (public.owns_repository(repository_id))
  with check (public.owns_repository(repository_id));

-- error_events
create policy "error_events_select_own" on public.error_events
  for select to authenticated using (public.owns_repository(repository_id));

-- incidents
create policy "incidents_select_own" on public.incidents
  for select to authenticated using (public.owns_repository(repository_id));
create policy "incidents_update_own" on public.incidents
  for update to authenticated using (public.owns_repository(repository_id))
  with check (public.owns_repository(repository_id));

-- github_events
create policy "github_events_select_own" on public.github_events
  for select to authenticated using (public.owns_repository(repository_id));

-- slack_integrations: RLS on, no policies => only the service role can touch it.

-- Column-level privileges: authenticated users can only change status-like columns.
revoke insert, update, delete on public.github_installations from anon, authenticated;
revoke insert, update, delete on public.repositories         from anon, authenticated;
revoke insert, update, delete on public.errors               from anon, authenticated;
revoke insert, update, delete on public.error_events         from anon, authenticated;
revoke insert, update, delete on public.incidents            from anon, authenticated;
revoke all                    on public.slack_integrations   from anon, authenticated;
revoke insert, update, delete on public.github_events        from anon, authenticated;

grant update (monitoring_enabled)    on public.repositories to authenticated;
grant update (status)                on public.errors       to authenticated;
grant update (status, resolved_at)   on public.incidents    to authenticated;
-- ─── ingest_error ─────────────────────────────────────────────────
-- Atomically groups an occurrence into its fingerprint group and records the event.
-- Returns whether the group is new, or a regression (a resolved group that re-occurred),
-- so the caller only triggers AI analysis / Slack alerts once per group instead of per event.
create or replace function public.ingest_error(
  p_repository_id  uuid,
  p_fingerprint    text,
  p_error_type     text,
  p_message        text,
  p_stack_trace    text,
  p_file_name      text,
  p_line_number    integer,
  p_column_number  integer,
  p_severity       text,
  p_environment    text,
  p_request_url    text,
  p_user_agent     text,
  p_metadata       jsonb,
  p_timestamp      timestamptz
)
returns table (error_id uuid, is_new boolean, is_regression boolean, occurrences integer)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_ts         timestamptz := coalesce(p_timestamp, now());
  v_prev_status text;
  v_error_id    uuid;
  v_is_new      boolean := false;
  v_occurrences integer;
begin
  select e.status into v_prev_status
  from public.errors e
  where e.repository_id = p_repository_id and e.fingerprint = p_fingerprint
  for update;

  if found then
    update public.errors e
       set occurrences = e.occurrences + 1,
           last_seen   = greatest(e.last_seen, v_ts),
           status      = case when e.status = 'resolved' then 'open' else e.status end
     where e.repository_id = p_repository_id and e.fingerprint = p_fingerprint
    returning e.id, e.occurrences into v_error_id, v_occurrences;
  else
    -- ON CONFLICT covers the race where two first occurrences arrive concurrently.
    insert into public.errors as e (
      repository_id, fingerprint, error_type, message, stack_trace, file_name,
      line_number, column_number, severity, environment, first_seen, last_seen,
      ai_analysis
    ) values (
      p_repository_id, p_fingerprint, p_error_type, p_message, p_stack_trace, p_file_name,
      p_line_number, p_column_number, p_severity, p_environment, v_ts, v_ts,
      jsonb_build_object('status', 'pending')
    )
    on conflict (repository_id, fingerprint) do update
      set occurrences = e.occurrences + 1,
          last_seen   = greatest(e.last_seen, excluded.last_seen)
    returning e.id, e.occurrences, (xmax = 0) into v_error_id, v_occurrences, v_is_new;
  end if;

  insert into public.error_events (
    error_id, repository_id, "timestamp", request_url, user_agent, environment, metadata
  ) values (
    v_error_id, p_repository_id, v_ts, p_request_url, p_user_agent, p_environment,
    coalesce(p_metadata, '{}'::jsonb)
  );

  return query select v_error_id, v_is_new, coalesce(v_prev_status = 'resolved', false), v_occurrences;
end;
$$;

revoke execute on function public.ingest_error(uuid, text, text, text, text, text, integer, integer, text, text, text, text, jsonb, timestamptz)
  from public, anon, authenticated;
grant execute on function public.ingest_error(uuid, text, text, text, text, text, integer, integer, text, text, text, text, jsonb, timestamptz)
  to service_role;

-- ─── error_trend ──────────────────────────────────────────────────
-- Daily event counts for the calling user's repositories (RLS applies: security invoker).
create or replace function public.error_trend(p_days integer default 14, p_repository_id uuid default null)
returns table (day date, events bigint, critical bigint)
language sql
stable
security invoker
set search_path = public
as $$
  with days as (
    select generate_series(current_date - (greatest(p_days, 1) - 1), current_date, interval '1 day')::date as day
  ),
  counts as (
    select ev."timestamp"::date as day,
           count(*) as events,
           count(*) filter (where er.severity = 'critical') as critical
    from public.error_events ev
    join public.errors er on er.id = ev.error_id
    where ev."timestamp" >= current_date - (greatest(p_days, 1) - 1)
      and (p_repository_id is null or ev.repository_id = p_repository_id)
    group by 1
  )
  select d.day, coalesce(c.events, 0), coalesce(c.critical, 0)
  from days d left join counts c on c.day = d.day
  order by d.day;
$$;

grant execute on function public.error_trend(integer, uuid) to authenticated;

-- ─── repository_error_stats ───────────────────────────────────────
create or replace view public.repository_error_stats
with (security_invoker = true) as
select
  e.repository_id,
  count(*)                                                              as total_errors,
  count(*) filter (where e.status = 'open')                             as open_errors,
  count(*) filter (where e.status = 'open' and e.severity = 'critical') as open_critical,
  coalesce(sum(e.occurrences), 0)                                       as total_occurrences,
  max(e.last_seen)                                                      as last_error_at
from public.errors e
group by e.repository_id;

grant select on public.repository_error_stats to authenticated;


-- Push-time monitoring: failed CI runs and Gemini diff reviews, with the auto-generated fix PR.

create table public.pipeline_alerts (
  id                uuid primary key default gen_random_uuid(),
  repository_id     uuid not null references public.repositories (id) on delete cascade,
  -- Makes webhook redeliveries idempotent: "ci:<run id>:<attempt>" or "push:<sha>".
  dedupe_key        text not null,
  source            text not null check (source in ('ci_failure', 'diff_review')),
  status            text not null default 'analyzing'
                    check (status in ('analyzing', 'no_issue', 'alerted', 'fix_proposed', 'resolved', 'dismissed', 'failed')),
  severity          text check (severity in ('critical', 'high', 'medium', 'low')),
  title             text,
  branch            text,
  commit_sha        text not null,
  commit_message    text,
  commit_url        text,
  actor             text,
  workflow_name     text,
  workflow_run_id   bigint,
  run_url           text,
  analysis          jsonb,
  fix_branch        text,
  fix_pr_number     integer,
  fix_pr_url        text,
  -- Why no fix PR was opened (no safe edit, disabled, GitHub error, ...).
  fix_note          text,
  slack_channel_id  text,
  slack_message_ts  text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  resolved_at       timestamptz,
  unique (repository_id, dedupe_key)
);
create index pipeline_alerts_repository_created_idx on public.pipeline_alerts (repository_id, created_at desc);
create index pipeline_alerts_fix_branch_idx on public.pipeline_alerts (fix_branch) where fix_branch is not null;
create trigger pipeline_alerts_updated_at before update on public.pipeline_alerts
  for each row execute function public.set_updated_at();

alter table public.pipeline_alerts enable row level security;
create policy "pipeline_alerts_select_own" on public.pipeline_alerts
  for select to authenticated using (public.owns_repository(repository_id));
create policy "pipeline_alerts_update_own" on public.pipeline_alerts
  for update to authenticated using (public.owns_repository(repository_id))
  with check (public.owns_repository(repository_id));
revoke insert, update, delete on public.pipeline_alerts from anon, authenticated;
grant update (status, resolved_at) on public.pipeline_alerts to authenticated;


-- PipelineIQ Helpline: the editable knowledge base behind the in-app help assistant.
-- Additive only: creates one new table and touches no existing table. Safe to run twice.
--
-- Teaching the bot something new is a plain insert:
--   insert into public.helpline_knowledge (category, question, answer, keywords)
--   values ('pipeline', 'How do I ...?', '...', array['keyword', 'another']);
-- Set is_active = false to hide an entry without deleting it.

create table if not exists public.helpline_knowledge (
  id          uuid primary key default gen_random_uuid(),
  -- Matches an intent label in lowercase (general, pipeline, troubleshooting, ...).
  category    text not null,
  question    text not null unique,
  answer      text not null,
  keywords    text[] not null default '{}',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists helpline_knowledge_category_idx on public.helpline_knowledge (category) where is_active;
create or replace trigger helpline_knowledge_updated_at before update on public.helpline_knowledge
  for each row execute function public.set_updated_at();

-- Signed-in users may read active entries. Writes happen in the SQL editor or with the
-- service role (`npm run helpline:seed`), never from the browser.
alter table public.helpline_knowledge enable row level security;
do $$
begin
  create policy "helpline_knowledge_select_active" on public.helpline_knowledge
    for select to authenticated using (is_active);
exception when duplicate_object then null;
end $$;
revoke insert, update, delete on public.helpline_knowledge from anon, authenticated;
grant select on public.helpline_knowledge to authenticated;

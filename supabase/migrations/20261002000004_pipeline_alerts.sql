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

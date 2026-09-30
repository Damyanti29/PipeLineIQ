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

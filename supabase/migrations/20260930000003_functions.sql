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

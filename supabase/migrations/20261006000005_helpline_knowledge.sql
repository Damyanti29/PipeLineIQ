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

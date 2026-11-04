-- GDG Vizag: event registration, teams and admin review (Prompt to Product + Local2Global).
-- Run this once in Supabase: SQL Editor > New query > paste > Run.
-- Safe to re-run: tables use "if not exists", columns are added only if missing, and functions/policies are replaced.

-- ---------------------------------------------------------------- tables
create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 100),
  college text not null check (char_length(college) between 2 and 150),
  phone text not null check (phone ~ '^[0-9+() -]{7,20}$'),
  email text not null check (char_length(email) between 5 and 200),
  best_project_url text not null check (best_project_url ~* '^https?://' and char_length(best_project_url) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Added later: GitHub, LinkedIn and self-rated coding level (0 to 5 stars). Safe on a database that already has profiles.
alter table public.profiles add column if not exists github_url text;
alter table public.profiles add column if not exists linkedin_url text;
alter table public.profiles add column if not exists coding_level smallint;
-- Added later: does this person want to turn their idea into a startup? (true = yes, false = no)
alter table public.profiles add column if not exists wants_startup boolean;
-- The best-project link is optional: empty is stored as null.
alter table public.profiles alter column best_project_url drop not null;
alter table public.profiles drop constraint if exists profiles_best_project_url_check;
alter table public.profiles add constraint profiles_best_project_url_check
  check (best_project_url is null or (best_project_url ~* '^https?://' and char_length(best_project_url) <= 500));
alter table public.profiles drop constraint if exists profiles_github_url_check;
alter table public.profiles add constraint profiles_github_url_check
  check (github_url is null or (github_url ~* '^https?://(www\.)?github\.com/.+' and char_length(github_url) <= 300));
alter table public.profiles drop constraint if exists profiles_linkedin_url_check;
alter table public.profiles add constraint profiles_linkedin_url_check
  check (linkedin_url is null or (linkedin_url ~* '^https?://([a-z]{2,3}\.)?linkedin\.com/.+' and char_length(linkedin_url) <= 300));
alter table public.profiles drop constraint if exists profiles_coding_level_check;
alter table public.profiles add constraint profiles_coding_level_check
  check (coding_level is null or coding_level between 0 and 5);

-- Events. Edit this table (Table Editor) to change a deadline or an event's college rule.
--   submissions_close : the lead can no longer submit or update the project after this moment (null = never closes)
--   college_pattern   : people whose college does not match this regex cannot register (null = open to everyone)
--   needs_demo        : the submission must include a demo link
--   max_team          : most members a team may have (a team can be any size from 1 up to this)
--   confirm_team      : the lead must tick "My team is final" (locks the team) before submitting
--   flow              : 'simple' = one project form, 'staged' = team lock > problem+idea > image+slides > GitHub+live site
--   current_stage     : staged events only: the stage the admin has opened for all teams (admin moves it forward)
create table if not exists public.events (
  key text primary key,
  name text not null,
  submissions_close timestamptz,
  college_pattern text,
  college_label text,
  needs_demo boolean not null default false
);
alter table public.events add column if not exists max_team int not null default 6;
alter table public.events add column if not exists confirm_team boolean not null default false;
alter table public.events add column if not exists flow text not null default 'simple';
-- Staged events: the stage the admin has opened for every team (1 to 4; 5 = the event has ended). Only an admin changes it.
alter table public.events add column if not exists current_stage smallint not null default 1;
alter table public.events drop constraint if exists events_current_stage_check;
alter table public.events add constraint events_current_stage_check check (current_stage between 1 and 5);
insert into public.events (key, name, submissions_close, college_pattern, college_label, needs_demo) values
  ('p2p', 'Prompt to Product', null, null, null, false),
  ('l2g', 'Local2Global Hack', '2026-11-06 09:00:00+05:30', 'gayatri|gvp', 'Gayatri Vidya Parishad (GVP)', true)
on conflict (key) do nothing;
-- Local2Global: teams of 1 to 5, confirmed by the lead. (Runs once; later edits in the Table Editor are kept.)
update public.events set max_team = 5, confirm_team = true where key = 'l2g' and confirm_team = false;
update public.events set flow = 'staged' where key = 'l2g' and flow = 'simple';

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null check (char_length(name) between 2 and 60),
  lead_id uuid not null references public.profiles (user_id) on delete cascade,
  problem_statement text check (char_length(problem_statement) <= 2000),
  idea text check (char_length(idea) <= 3000),
  project_url text check (project_url ~* '^https?://' and char_length(project_url) <= 500),
  submitted_at timestamptz,
  created_at timestamptz not null default now()
);
-- Added later: which event the team belongs to, and a demo link. Existing teams belong to Prompt to Product.
alter table public.teams add column if not exists event text not null default 'p2p' references public.events (key);
alter table public.teams add column if not exists demo_url text;
-- Set when the lead confirms the team is final. A confirmed team cannot gain or lose members.
alter table public.teams add column if not exists locked_at timestamptz;
-- Staged flow (Local2Global): stage 2 problem + idea confirmed, stage 3 jury image + links locked, stage 4 repo + live site.
alter table public.teams add column if not exists idea_confirmed_at timestamptz;
alter table public.teams add column if not exists jury_image_path text;
alter table public.teams add column if not exists gemini_chat_url text;
alter table public.teams add column if not exists slides_url text;
alter table public.teams add column if not exists assets_locked_at timestamptz;
alter table public.teams add column if not exists github_url text;
alter table public.teams add column if not exists live_url text;
-- A stage the admin reopened for just this team, so it can still work on it after the event moved on.
alter table public.teams add column if not exists reopened_stage smallint;
-- Set only when the LEAD ticks the team lock box. (The admin's "Move to next stage" also locks teams, but does not set this.)
-- Teams that were already locked when this column was added count as locked by their lead.
do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'teams' and column_name = 'lead_locked_at') then
    alter table public.teams add column lead_locked_at timestamptz;
    update public.teams set lead_locked_at = locked_at where locked_at is not null;
  end if;
end $$;
alter table public.teams drop constraint if exists teams_slides_url_check;
alter table public.teams add constraint teams_slides_url_check
  check (slides_url is null or (slides_url ~* '^https://docs\.google\.com/presentation/d/[A-Za-z0-9_-]+' and char_length(slides_url) <= 500));
alter table public.teams drop constraint if exists teams_gemini_chat_url_check;
alter table public.teams add constraint teams_gemini_chat_url_check
  check (gemini_chat_url is null or (gemini_chat_url ~* '^https://(gemini\.google\.com|g\.co)/.+' and char_length(gemini_chat_url) <= 500));
alter table public.teams drop constraint if exists teams_github_url_check;
alter table public.teams add constraint teams_github_url_check
  check (github_url is null or (github_url ~* '^https://(www\.)?github\.com/[^/]+/[^/]+' and char_length(github_url) <= 500));
alter table public.teams drop constraint if exists teams_live_url_check;
alter table public.teams add constraint teams_live_url_check
  check (live_url is null or (live_url ~* '^https?://' and char_length(live_url) <= 500));
alter table public.teams drop constraint if exists teams_demo_url_check;
alter table public.teams add constraint teams_demo_url_check
  check (demo_url is null or (demo_url ~* '^https?://' and char_length(demo_url) <= 500));

-- One row per person per event, so nobody can be in two teams of the same event.
create table if not exists public.team_members (
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete cascade,
  joined_at timestamptz not null default now()
);
alter table public.team_members add column if not exists event text not null default 'p2p' references public.events (key);
update public.team_members tm set event = t.event from public.teams t where t.id = tm.team_id and tm.event is distinct from t.event;
alter table public.team_members drop constraint if exists team_members_pkey;
alter table public.team_members add primary key (user_id, event);
create index if not exists team_members_team_idx on public.team_members (team_id);

-- Who registered for which event (saving details inside an event's form registers you for it).
create table if not exists public.registrations (
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  event text not null references public.events (key),
  created_at timestamptz not null default now(),
  primary key (user_id, event)
);
-- Everyone who registered before events existed was registering for Prompt to Product.
insert into public.registrations (user_id, event)
  select p.user_id, 'p2p' from public.profiles p
  where not exists (select 1 from public.registrations r where r.user_id = p.user_id)
on conflict do nothing;

-- Admins are identified by their (confirmed) login email.
create table if not exists public.admins (
  email text primary key
);
alter table public.admins add column if not exists added_at timestamptz not null default now();
alter table public.admins add column if not exists added_by uuid;

create table if not exists public.evaluations (
  user_id uuid primary key references public.profiles (user_id) on delete cascade,
  idea_good boolean not null default false,
  talks_well boolean not null default false,
  gdg_fit boolean not null default false,
  notes text check (char_length(notes) <= 2000),
  updated_by uuid,
  updated_at timestamptz not null default now()
);

-- Review fields: idea and presentation are 1 to 5 stars, volunteering interest is yes/no.
-- (The older idea_good / talks_well / gdg_fit columns are no longer used by the site and can be dropped.)
alter table public.evaluations add column if not exists idea_rating smallint;
alter table public.evaluations add column if not exists presentation_rating smallint;
alter table public.evaluations add column if not exists volunteer_interest boolean not null default false;
-- Local2Global scores each person on: presentation skills (presentation_rating), deep knowledge of the idea and role play.
alter table public.evaluations add column if not exists knowledge_rating smallint;
alter table public.evaluations add column if not exists roleplay_rating smallint;
alter table public.evaluations drop constraint if exists evaluations_knowledge_rating_check;
alter table public.evaluations add constraint evaluations_knowledge_rating_check check (knowledge_rating is null or knowledge_rating between 1 and 5);
alter table public.evaluations drop constraint if exists evaluations_roleplay_rating_check;
alter table public.evaluations add constraint evaluations_roleplay_rating_check check (roleplay_rating is null or roleplay_rating between 1 and 5);
alter table public.evaluations drop constraint if exists evaluations_idea_rating_check;
alter table public.evaluations add constraint evaluations_idea_rating_check check (idea_rating is null or idea_rating between 1 and 5);
alter table public.evaluations drop constraint if exists evaluations_presentation_rating_check;
alter table public.evaluations add constraint evaluations_presentation_rating_check check (presentation_rating is null or presentation_rating between 1 and 5);
-- Reviews are per event now (one row per person per event).
alter table public.evaluations add column if not exists event text not null default 'p2p' references public.events (key);
alter table public.evaluations drop constraint if exists evaluations_pkey;
alter table public.evaluations add primary key (user_id, event);

-- Normal admins. The super admin adds and removes more from the Admins panel on the admin page (no SQL needed).
-- (saiakhil1629@gmail.com is the super admin and does not need a row here.)
insert into public.admins (email) values ('karanamkarthik2004@gmail.com') on conflict do nothing;

-- ---------------------------------------------------------------- helpers
-- (Older versions of these helpers are dropped first; the teams policy that used my_team_id() is dropped before it.)
drop policy if exists teams_select on public.teams;
drop function if exists public.my_team_id();

-- The super admin. To change it, change this email and run the file again.
create or replace function public.is_super() returns boolean
language sql stable security definer set search_path = public as $$
  select lower(coalesce(auth.jwt() ->> 'email', '')) = 'saiakhil1629@gmail.com';
$$;

-- Any admin: the super admin, or an email in the admins table (added by the super admin on the admin page).
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_super() or exists (
    select 1 from public.admins a
    where lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

-- Every team the signed-in person belongs to (one per event at most).
create or replace function public.my_team_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select team_id from public.team_members where user_id = auth.uid();
$$;

-- ---------------------------------------------------------------- row level security
alter table public.profiles enable row level security;
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.admins enable row level security;
alter table public.evaluations enable row level security;
alter table public.events enable row level security;
alter table public.registrations enable row level security;

-- profiles: you see and edit your own; admins see all. (Teammates only see names via my_team_roster.)
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles for insert to authenticated
  with check (user_id = auth.uid());
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- events: anyone signed in can read the list (deadlines are not secret).
drop policy if exists events_select on public.events;
create policy events_select on public.events for select to authenticated using (true);

-- registrations: read your own (admins read all). Rows are only created by register_for_event / create_team / join_team.
drop policy if exists registrations_select on public.registrations;
create policy registrations_select on public.registrations for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- teams and team_members: read-only from the browser. All changes go through the functions below.
create policy teams_select on public.teams for select to authenticated
  using (id in (select public.my_team_ids()) or public.is_admin());
drop policy if exists team_members_select on public.team_members;
create policy team_members_select on public.team_members for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- admins table: no policies, so it cannot be read from the browser at all.

-- evaluations: admins only.
drop policy if exists evaluations_all on public.evaluations;
create policy evaluations_all on public.evaluations for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------- registration and team actions
-- Old function versions have different arguments; drop them so the new ones are the only ones.
drop function if exists public.create_team(text);
drop function if exists public.submit_project(text, text, text);
drop function if exists public.leave_team();
drop function if exists public.my_team_roster();

-- Internal: checks the event exists and the person's college is allowed, then records the registration.
create or replace function public.ensure_registered(uid uuid, ev text) returns void
language plpgsql security definer set search_path = public as $$
declare
  e public.events;
  c text;
begin
  select * into e from events where key = ev;
  if not found then raise exception 'That event does not exist.'; end if;
  select college into c from profiles where user_id = uid;
  if c is null then raise exception 'Save your details first.'; end if;
  if e.college_pattern is not null and c !~* e.college_pattern then
    raise exception '% is for % students only. Check the college in your details.', e.name, coalesce(e.college_label, 'selected college');
  end if;
  insert into registrations (user_id, event) values (uid, ev) on conflict do nothing;
end $$;

create or replace function public.register_for_event(p_event text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Please log in first.'; end if;
  perform ensure_registered(auth.uid(), p_event);
end $$;

create or replace function public.create_team(p_name text, p_event text default 'p2p') returns public.teams
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  c text;
  t public.teams;
begin
  if uid is null then raise exception 'Please log in first.'; end if;
  if not exists (select 1 from profiles where user_id = uid) then raise exception 'Save your details first.'; end if;
  perform ensure_registered(uid, p_event);
  if exists (select 1 from events where key = p_event and flow = 'staged' and current_stage <> 1) then
    raise exception 'Team building is closed. The hackathon has moved on to the next step.';
  end if;
  if exists (select 1 from team_members where user_id = uid and event = p_event) then raise exception 'You are already in a team.'; end if;
  p_name := btrim(coalesce(p_name, ''));
  if char_length(p_name) < 2 or char_length(p_name) > 60 then raise exception 'Enter a team name (2 to 60 characters).'; end if;
  loop
    c := 'GDG-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    exit when not exists (select 1 from teams where code = c);
  end loop;
  insert into teams (code, name, lead_id, event) values (c, p_name, uid, p_event) returning * into t;
  insert into team_members (user_id, team_id, event) values (uid, t.id, p_event);
  return t;
end $$;

create or replace function public.join_team(p_code text) returns public.teams
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  t public.teams;
  e public.events;
  n int;
begin
  if uid is null then raise exception 'Please log in first.'; end if;
  if not exists (select 1 from profiles where user_id = uid) then raise exception 'Save your details first.'; end if;
  select * into t from teams where code = upper(btrim(coalesce(p_code, ''))) for update;
  if not found then raise exception 'That team code was not found. Check it with your team lead.'; end if;
  perform ensure_registered(uid, t.event);
  if exists (select 1 from events where key = t.event and flow = 'staged' and current_stage <> 1) then
    raise exception 'Team building is closed. The hackathon has moved on to the next step.';
  end if;
  if exists (select 1 from team_members where user_id = uid and event = t.event) then raise exception 'You are already in a team.'; end if;
  if t.locked_at is not null then raise exception 'This team has been confirmed by its lead and is not taking new members.'; end if;
  select * into e from events where key = t.event;
  select count(*) into n from team_members where team_id = t.id;
  if n >= e.max_team then raise exception 'This team is full (% members).', e.max_team; end if;
  insert into team_members (user_id, team_id, event) values (uid, t.id, t.event);
  return t;
end $$;

create or replace function public.submit_project(p_problem text, p_idea text, p_url text, p_event text default 'p2p', p_demo text default null) returns public.teams
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  t public.teams;
  e public.events;
begin
  select * into t from teams where lead_id = uid and event = p_event for update;
  if not found then raise exception 'Only the team lead can submit the project.'; end if;
  select * into e from events where key = p_event;
  if e.flow = 'staged' then raise exception 'This event uses the step-by-step submission.'; end if;
  if e.submissions_close is not null and now() > e.submissions_close then
    raise exception 'Submissions for % are closed.', e.name;
  end if;
  if e.confirm_team and t.locked_at is null then
    raise exception 'Confirm your team first: tick "My team is final", then submit.';
  end if;
  p_problem := btrim(coalesce(p_problem, ''));
  p_idea := btrim(coalesce(p_idea, ''));
  p_url := btrim(coalesce(p_url, ''));
  p_demo := btrim(coalesce(p_demo, ''));
  if char_length(p_problem) < 10 then raise exception 'Describe the problem statement (at least 10 characters).'; end if;
  if char_length(p_idea) < 10 then raise exception 'Describe your idea (at least 10 characters).'; end if;
  if p_url !~* '^https?://' then raise exception 'The project URL must start with http:// or https://'; end if;
  if e.needs_demo and p_demo = '' then raise exception 'Add a demo link (a video or a live demo).'; end if;
  if p_demo <> '' and p_demo !~* '^https?://' then raise exception 'The demo link must start with http:// or https://'; end if;
  update teams set problem_statement = p_problem, idea = p_idea, project_url = p_url,
         demo_url = nullif(p_demo, ''), submitted_at = coalesce(submitted_at, now())
   where id = t.id returning * into t;
  return t;
end $$;

-- The lead confirms (locks) or unlocks the team. Locked teams cannot gain or lose members.
create or replace function public.lock_team(p_locked boolean default true, p_event text default 'p2p') returns public.teams
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  t public.teams;
  e public.events;
begin
  select * into t from teams where lead_id = uid and event = p_event for update;
  if not found then raise exception 'Only the team lead can confirm the team.'; end if;
  select * into e from events where key = p_event;
  if e.submissions_close is not null and now() > e.submissions_close then
    raise exception 'The deadline for % has passed, so the team can no longer be changed.', e.name;
  end if;
  if e.flow = 'staged' and e.current_stage <> 1 and coalesce(t.reopened_stage, 0) <> 1 then
    raise exception 'The team lock step is closed.';
  end if;
  if not p_locked and (t.problem_statement is not null or t.idea_confirmed_at is not null) then
    raise exception 'Your team is locked for good because the problem statement is already saved. Ask an admin if you need a change.';
  end if;
  update teams set locked_at = case when p_locked then coalesce(locked_at, now()) else null end,
         lead_locked_at = case when p_locked then coalesce(lead_locked_at, now()) else null end,
         reopened_stage = case when p_locked and reopened_stage = 1 then null else reopened_stage end
   where id = t.id returning * into t;
  return t;
end $$;

create or replace function public.leave_team(p_event text default 'p2p') returns void
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  t public.teams;
  tid uuid;
  n int;
begin
  select tm.team_id into tid from team_members tm where tm.user_id = uid and tm.event = p_event;
  if tid is null then return; end if;
  select * into t from teams where id = tid for update;
  if t.locked_at is not null then raise exception 'Your team is confirmed. Ask the team lead to untick "My team is final" first.'; end if;
  select count(*) into n from team_members where team_id = t.id;
  if t.lead_id = uid then
    if n > 1 then raise exception 'You are the team lead. Other members are still in the team.'; end if;
    delete from teams where id = t.id; -- also removes the lead's membership
  else
    delete from team_members where user_id = uid and event = p_event;
  end if;
end $$;

-- Names only: what teammates may see about each other.
create or replace function public.my_team_roster(p_event text default 'p2p')
returns table (name text, college text, is_lead boolean, is_me boolean)
language sql stable security definer set search_path = public as $$
  select p.name, p.college, (t.lead_id = tm.user_id), (tm.user_id = auth.uid())
  from team_members tm
  join teams t on t.id = tm.team_id
  join profiles p on p.user_id = tm.user_id
  where tm.team_id = (select team_id from team_members where user_id = auth.uid() and event = p_event)
  order by (t.lead_id = tm.user_id) desc, tm.joined_at;
$$;

-- ---------------------------------------------------------------- staged submission (Local2Global)
-- Admin's manual checks for a team: is the image really from Gemini, do the links open.
create table if not exists public.team_checks (
  team_id uuid primary key references public.teams (id) on delete cascade,
  image_ok boolean not null default false,
  slides_ok boolean not null default false,
  github_ok boolean not null default false,
  live_ok boolean not null default false,
  checked_by uuid,
  updated_at timestamptz not null default now()
);
-- The admin's star score for the whole team (1 to 5): idea, presentation skills and the website.
alter table public.team_checks add column if not exists idea_rating smallint;
alter table public.team_checks add column if not exists presentation_rating smallint;
alter table public.team_checks add column if not exists website_rating smallint;
alter table public.team_checks drop constraint if exists team_checks_idea_rating_check;
alter table public.team_checks add constraint team_checks_idea_rating_check check (idea_rating is null or idea_rating between 1 and 5);
alter table public.team_checks drop constraint if exists team_checks_presentation_rating_check;
alter table public.team_checks add constraint team_checks_presentation_rating_check check (presentation_rating is null or presentation_rating between 1 and 5);
alter table public.team_checks drop constraint if exists team_checks_website_rating_check;
alter table public.team_checks add constraint team_checks_website_rating_check check (website_rating is null or website_rating between 1 and 5);
alter table public.team_checks enable row level security;
drop policy if exists team_checks_all on public.team_checks;
create policy team_checks_all on public.team_checks for all to authenticated
  using (public.is_super()) with check (public.is_super());

-- Jury images live in a private bucket: 15 MB max, PNG/JPG/WebP only. One file per team: <team id>/jury-image
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('jury-images', 'jury-images', false, 15728640, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = 15728640,
  allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp'];

drop policy if exists jury_images_read on storage.objects;
create policy jury_images_read on storage.objects for select to authenticated
  using (bucket_id = 'jury-images' and (public.is_admin()
    or (storage.foldername(name))[1] in (select x::text from public.my_team_ids() x)));
drop policy if exists jury_images_insert on storage.objects;
create policy jury_images_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'jury-images' and exists (
    select 1 from public.teams t join public.events ev on ev.key = t.event
    where objects.name = t.id::text || '/jury-image' and t.lead_id = auth.uid()
      and (ev.current_stage = 3 or t.reopened_stage = 3) and t.assets_locked_at is null));
drop policy if exists jury_images_update on storage.objects;
create policy jury_images_update on storage.objects for update to authenticated
  using (bucket_id = 'jury-images' and exists (
    select 1 from public.teams t join public.events ev on ev.key = t.event
    where objects.name = t.id::text || '/jury-image' and t.lead_id = auth.uid()
      and (ev.current_stage = 3 or t.reopened_stage = 3) and t.assets_locked_at is null))
  with check (bucket_id = 'jury-images' and exists (
    select 1 from public.teams t join public.events ev on ev.key = t.event
    where objects.name = t.id::text || '/jury-image' and t.lead_id = auth.uid()
      and (ev.current_stage = 3 or t.reopened_stage = 3) and t.assets_locked_at is null));
drop policy if exists jury_images_delete on storage.objects;
create policy jury_images_delete on storage.objects for delete to authenticated
  using (bucket_id = 'jury-images' and public.is_super());

-- Internal: the signed-in lead's team for a staged event, locked for update, checked against the deadline and
-- against the stage the admin has opened (p_stage). A stage the admin reopened for this team also counts.
drop function if exists public.staged_team(text);
create or replace function public.staged_team(p_event text, p_stage int) returns public.teams
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  t public.teams;
  e public.events;
begin
  select * into t from teams where lead_id = uid and event = p_event for update;
  if not found then raise exception 'Only the team lead can submit.'; end if;
  select * into e from events where key = p_event;
  if e.flow <> 'staged' then raise exception 'This event does not use the step-by-step submission.'; end if;
  if e.submissions_close is not null and now() > e.submissions_close then
    raise exception 'Submissions for % are closed.', e.name;
  end if;
  if e.current_stage <> p_stage and coalesce(t.reopened_stage, 0) <> p_stage then
    if e.current_stage < p_stage then
      raise exception 'This step is not open yet. The admin will open it.';
    else
      raise exception 'This step is closed.';
    end if;
  end if;
  return t;
end $$;

-- Stage 2: problem statement and idea (a draft can be saved many times until it is confirmed or the stage closes).
create or replace function public.save_idea(p_problem text, p_idea text, p_event text default 'l2g') returns public.teams
language plpgsql security definer set search_path = public as $$
declare
  t public.teams;
begin
  t := staged_team(p_event, 2);
  if t.idea_confirmed_at is not null then raise exception 'The problem statement and idea are already confirmed.'; end if;
  p_problem := btrim(coalesce(p_problem, ''));
  p_idea := btrim(coalesce(p_idea, ''));
  if char_length(p_problem) < 10 then raise exception 'Describe the problem statement (at least 10 characters).'; end if;
  if char_length(p_problem) > 2000 then raise exception 'The problem statement is too long (2000 characters at most).'; end if;
  if char_length(p_idea) < 10 then raise exception 'Describe your idea (at least 10 characters).'; end if;
  if char_length(p_idea) > 3000 then raise exception 'The idea is too long (3000 characters at most).'; end if;
  update teams set problem_statement = p_problem, idea = p_idea where id = t.id returning * into t;
  return t;
end $$;

create or replace function public.confirm_idea(p_event text default 'l2g') returns public.teams
language plpgsql security definer set search_path = public as $$
declare
  t public.teams;
begin
  t := staged_team(p_event, 2);
  if t.problem_statement is null or t.idea is null then raise exception 'Save your problem statement and idea first.'; end if;
  update teams set idea_confirmed_at = coalesce(idea_confirmed_at, now()),
         reopened_stage = case when reopened_stage = 2 then null else reopened_stage end
   where id = t.id returning * into t;
  return t;
end $$;

-- Stage 3: the jury image (already uploaded to the bucket), the Gemini chat link and the Google Slides view link.
create or replace function public.save_assets(p_image_path text, p_gemini text, p_slides text, p_event text default 'l2g') returns public.teams
language plpgsql security definer set search_path = public as $$
declare
  t public.teams;
begin
  t := staged_team(p_event, 3);
  if t.assets_locked_at is not null then raise exception 'The image and links are already locked.'; end if;
  p_gemini := btrim(coalesce(p_gemini, ''));
  p_slides := btrim(coalesce(p_slides, ''));
  if coalesce(p_image_path, '') <> t.id::text || '/jury-image' then raise exception 'Upload your image again.'; end if;
  if not exists (select 1 from storage.objects where bucket_id = 'jury-images' and name = p_image_path) then
    raise exception 'The image upload was not found. Upload it again.';
  end if;
  if p_gemini !~* '^https://(gemini\.google\.com|g\.co)/.+' then
    raise exception 'Paste the share link of the Gemini chat that made the image (it starts with https://gemini.google.com/).';
  end if;
  if p_slides !~* '^https://docs\.google\.com/presentation/d/[A-Za-z0-9_-]+' then
    raise exception 'Paste a Google Slides link (it starts with https://docs.google.com/presentation/d/).';
  end if;
  update teams set jury_image_path = p_image_path, gemini_chat_url = p_gemini, slides_url = p_slides
   where id = t.id returning * into t;
  return t;
end $$;

create or replace function public.lock_assets(p_event text default 'l2g') returns public.teams
language plpgsql security definer set search_path = public as $$
declare
  t public.teams;
begin
  t := staged_team(p_event, 3);
  if t.jury_image_path is null or t.gemini_chat_url is null or t.slides_url is null then
    raise exception 'Submit the image, the Gemini link and the Slides link first.';
  end if;
  update teams set assets_locked_at = coalesce(assets_locked_at, now()),
         reopened_stage = case when reopened_stage = 3 then null else reopened_stage end
   where id = t.id returning * into t;
  return t;
end $$;

-- Stage 4: the GitHub repository and the live website. Both must work. Editable while stage 4 is open.
create or replace function public.save_final_links(p_github text, p_live text, p_event text default 'l2g') returns public.teams
language plpgsql security definer set search_path = public as $$
declare
  t public.teams;
begin
  t := staged_team(p_event, 4);
  p_github := btrim(coalesce(p_github, ''));
  p_live := btrim(coalesce(p_live, ''));
  if p_github !~* '^https://(www\.)?github\.com/[^/]+/[^/]+' then
    raise exception 'The GitHub link must look like https://github.com/your-name/your-repo';
  end if;
  if p_live !~* '^https?://' then raise exception 'The live website link must start with https://'; end if;
  update teams set github_url = p_github, live_url = p_live, submitted_at = coalesce(submitted_at, now())
   where id = t.id returning * into t;
  return t;
end $$;

-- Admin: reopen one stage for one team (the lead can edit it again even though the event moved on).
create or replace function public.admin_reopen_stage(p_team uuid, p_stage int) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_super() then raise exception 'Only the super admin can do this.'; end if;
  if p_stage = 1 then
    update teams set locked_at = null, lead_locked_at = null, reopened_stage = 1 where id = p_team;
  elsif p_stage = 2 then
    update teams set idea_confirmed_at = null, reopened_stage = 2 where id = p_team;
  elsif p_stage = 3 then
    update teams set assets_locked_at = null, reopened_stage = 3 where id = p_team;
  else
    raise exception 'Stage must be 1, 2 or 3.';
  end if;
end $$;

-- Admin: move the whole event to the next stage. The stage that is closing is locked for EVERY team, filled or not:
--   1 closes: every team is locked with the members it has.   2 closes: a saved draft counts as confirmed.
--   3 closes: the saved image and links are locked.           4 closes: the event ends (current_stage = 5).
create or replace function public.admin_next_stage(p_event text) returns public.events
language plpgsql security definer set search_path = public as $$
declare
  e public.events;
begin
  if not public.is_super() then raise exception 'Only the super admin can do this.'; end if;
  select * into e from events where key = p_event for update;
  if not found then raise exception 'That event does not exist.'; end if;
  if e.flow <> 'staged' then raise exception 'This event does not have stages.'; end if;
  if e.current_stage >= 5 then raise exception 'The event has already ended.'; end if;
  if e.current_stage = 1 then
    update teams set locked_at = coalesce(locked_at, now()) where event = p_event;
  elsif e.current_stage = 2 then
    update teams set idea_confirmed_at = coalesce(idea_confirmed_at, now())
     where event = p_event and problem_statement is not null and idea is not null;
  elsif e.current_stage = 3 then
    update teams set assets_locked_at = coalesce(assets_locked_at, now()) where event = p_event;
  end if;
  update events set current_stage = current_stage + 1 where key = p_event returning * into e;
  return e;
end $$;

-- Admin: undo a Move by mistake. Only the stage number goes back; nothing that was locked is unlocked
-- (use "Reopen" on a team for that).
create or replace function public.admin_back_stage(p_event text) returns public.events
language plpgsql security definer set search_path = public as $$
declare
  e public.events;
begin
  if not public.is_super() then raise exception 'Only the super admin can do this.'; end if;
  select * into e from events where key = p_event for update;
  if not found then raise exception 'That event does not exist.'; end if;
  if e.flow <> 'staged' then raise exception 'This event does not have stages.'; end if;
  if e.current_stage <= 1 then raise exception 'The event is already at stage 1.'; end if;
  update events set current_stage = current_stage - 1 where key = p_event returning * into e;
  return e;
end $$;

-- Admin: delete a team so its people can start again (they stay registered). p_remove = true also unregisters them.
-- (The admin page deletes the team's image file first; files are removed through the Storage API, not SQL.)
create or replace function public.admin_reset_team(p_team uuid, p_remove boolean default false) returns void
language plpgsql security definer set search_path = public as $$
declare
  t public.teams;
begin
  if not public.is_super() then raise exception 'Only the super admin can do this.'; end if;
  select * into t from teams where id = p_team for update;
  if not found then return; end if;
  if p_remove then
    delete from evaluations where event = t.event and user_id in (select user_id from team_members where team_id = t.id);
    delete from person_scores where event = t.event and user_id in (select user_id from team_members where team_id = t.id);
    delete from registrations where event = t.event and user_id in (select user_id from team_members where team_id = t.id);
  end if;
  delete from teams where id = t.id; -- members and checks go with it
end $$;

-- ---------------------------------------------------------------- judges' scores (Local2Global)
-- Every admin scores on their own: one row per judge. A normal admin only ever sees their own rows;
-- the super admin sees every judge's rows (and the page shows the average).
create table if not exists public.team_scores (
  team_id uuid not null references public.teams (id) on delete cascade,
  judge_id uuid not null,
  judge_email text not null default lower(coalesce(auth.jwt() ->> 'email', '')),
  idea_rating smallint check (idea_rating between 1 and 5),
  presentation_rating smallint check (presentation_rating between 1 and 5),
  website_rating smallint check (website_rating between 1 and 5),
  updated_at timestamptz not null default now(),
  primary key (team_id, judge_id)
);
create table if not exists public.person_scores (
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  event text not null references public.events (key),
  judge_id uuid not null,
  judge_email text not null default lower(coalesce(auth.jwt() ->> 'email', '')),
  presentation_rating smallint check (presentation_rating between 1 and 5),
  knowledge_rating smallint check (knowledge_rating between 1 and 5),
  roleplay_rating smallint check (roleplay_rating between 1 and 5),
  volunteer_interest boolean not null default false,
  notes text check (char_length(notes) <= 2000),
  updated_at timestamptz not null default now(),
  primary key (user_id, event, judge_id)
);
alter table public.team_scores enable row level security;
alter table public.person_scores enable row level security;
drop policy if exists team_scores_select on public.team_scores;
create policy team_scores_select on public.team_scores for select to authenticated
  using (public.is_super() or (public.is_admin() and judge_id = auth.uid()));
drop policy if exists team_scores_insert on public.team_scores;
create policy team_scores_insert on public.team_scores for insert to authenticated
  with check (public.is_admin() and judge_id = auth.uid());
drop policy if exists team_scores_update on public.team_scores;
create policy team_scores_update on public.team_scores for update to authenticated
  using (public.is_admin() and judge_id = auth.uid()) with check (public.is_admin() and judge_id = auth.uid());
drop policy if exists team_scores_delete on public.team_scores;
create policy team_scores_delete on public.team_scores for delete to authenticated
  using (public.is_super() or (public.is_admin() and judge_id = auth.uid()));
drop policy if exists person_scores_select on public.person_scores;
create policy person_scores_select on public.person_scores for select to authenticated
  using (public.is_super() or (public.is_admin() and judge_id = auth.uid()));
drop policy if exists person_scores_insert on public.person_scores;
create policy person_scores_insert on public.person_scores for insert to authenticated
  with check (public.is_admin() and judge_id = auth.uid());
drop policy if exists person_scores_update on public.person_scores;
create policy person_scores_update on public.person_scores for update to authenticated
  using (public.is_admin() and judge_id = auth.uid()) with check (public.is_admin() and judge_id = auth.uid());
drop policy if exists person_scores_delete on public.person_scores;
create policy person_scores_delete on public.person_scores for delete to authenticated
  using (public.is_super() or (public.is_admin() and judge_id = auth.uid()));

-- ---------------------------------------------------------------- managing admins (super admin only)
-- The list: the super admin first, then everyone added. signed_up = that email already has an account on the site.
create or replace function public.list_admins()
returns table (email text, is_super boolean, signed_up boolean, added_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_super() then raise exception 'Only the super admin can do this.'; end if;
  return query
    select 'saiakhil1629@gmail.com'::text, true,
           exists (select 1 from auth.users u where lower(u.email) = 'saiakhil1629@gmail.com'), null::timestamptz
    union all
    (select lower(a.email), false, exists (select 1 from auth.users u where lower(u.email) = lower(a.email)), a.added_at
       from public.admins a where lower(a.email) <> 'saiakhil1629@gmail.com' order by a.added_at);
end $$;

-- Add a normal admin by email. They do not need an account yet: once they sign up or log in with that email they are an admin.
create or replace function public.add_admin(p_email text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_super() then raise exception 'Only the super admin can do this.'; end if;
  p_email := lower(btrim(coalesce(p_email, '')));
  if p_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' or char_length(p_email) > 200 then
    raise exception 'Enter a valid email address.';
  end if;
  if p_email = 'saiakhil1629@gmail.com' then raise exception 'That is the super admin already.'; end if;
  insert into admins (email, added_by) values (p_email, auth.uid()) on conflict (email) do nothing;
end $$;

create or replace function public.remove_admin(p_email text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_super() then raise exception 'Only the super admin can do this.'; end if;
  p_email := lower(btrim(coalesce(p_email, '')));
  if p_email = 'saiakhil1629@gmail.com' then raise exception 'The super admin cannot be removed.'; end if;
  delete from admins where lower(email) = p_email;
end $$;

-- ---------------------------------------------------------------- permissions
revoke all on all tables in schema public from anon;
revoke execute on all functions in schema public from public, anon;
grant select, insert, update on public.profiles to authenticated;
grant select on public.teams, public.team_members, public.events, public.registrations to authenticated;
grant select, insert, update, delete on public.evaluations to authenticated;
grant select, insert, update, delete on public.team_checks, public.team_scores, public.person_scores to authenticated;
grant execute on function
  public.is_admin(), public.is_super(), public.list_admins(), public.add_admin(text), public.remove_admin(text),
  public.my_team_ids(), public.register_for_event(text),
  public.create_team(text, text), public.join_team(text), public.lock_team(boolean, text),
  public.save_idea(text, text, text), public.confirm_idea(text), public.save_assets(text, text, text, text),
  public.lock_assets(text), public.save_final_links(text, text, text),
  public.admin_reopen_stage(uuid, int), public.admin_reset_team(uuid, boolean),
  public.admin_next_stage(text), public.admin_back_stage(text),
  public.submit_project(text, text, text, text, text), public.leave_team(text), public.my_team_roster(text)
  to authenticated;

-- Make the API pick up the new tables and functions straight away (otherwise Supabase can say "not found in the schema cache").
notify pgrst, 'reload schema';

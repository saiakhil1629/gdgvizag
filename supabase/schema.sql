-- GDG Vizag: event registration, teams and admin review.
-- Run this once in Supabase: SQL Editor > New query > paste > Run.
-- Safe to re-run: tables use "if not exists" and functions/policies are replaced.

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
alter table public.profiles drop constraint if exists profiles_github_url_check;
alter table public.profiles add constraint profiles_github_url_check
  check (github_url is null or (github_url ~* '^https?://(www\.)?github\.com/.+' and char_length(github_url) <= 300));
alter table public.profiles drop constraint if exists profiles_linkedin_url_check;
alter table public.profiles add constraint profiles_linkedin_url_check
  check (linkedin_url is null or (linkedin_url ~* '^https?://([a-z]{2,3}\.)?linkedin\.com/.+' and char_length(linkedin_url) <= 300));
alter table public.profiles drop constraint if exists profiles_coding_level_check;
alter table public.profiles add constraint profiles_coding_level_check
  check (coding_level is null or coding_level between 0 and 5);

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

-- One row per person, so nobody can be in two teams.
create table if not exists public.team_members (
  user_id uuid primary key references public.profiles (user_id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete cascade,
  joined_at timestamptz not null default now()
);
create index if not exists team_members_team_idx on public.team_members (team_id);

-- Admins are identified by their (confirmed) login email.
create table if not exists public.admins (
  email text primary key
);

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
alter table public.evaluations drop constraint if exists evaluations_idea_rating_check;
alter table public.evaluations add constraint evaluations_idea_rating_check check (idea_rating is null or idea_rating between 1 and 5);
alter table public.evaluations drop constraint if exists evaluations_presentation_rating_check;
alter table public.evaluations add constraint evaluations_presentation_rating_check check (presentation_rating is null or presentation_rating between 1 and 5);

-- Add admins here. Add more rows any time.
insert into public.admins (email) values ('saiakhil1629@gmail.com') on conflict do nothing;

-- ---------------------------------------------------------------- helpers
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.admins a
    where lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

create or replace function public.my_team_id() returns uuid
language sql stable security definer set search_path = public as $$
  select team_id from public.team_members where user_id = auth.uid();
$$;

-- ---------------------------------------------------------------- row level security
alter table public.profiles enable row level security;
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.admins enable row level security;
alter table public.evaluations enable row level security;

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

-- teams and team_members: read-only from the browser. All changes go through the functions below.
drop policy if exists teams_select on public.teams;
create policy teams_select on public.teams for select to authenticated
  using (id = public.my_team_id() or public.is_admin());
drop policy if exists team_members_select on public.team_members;
create policy team_members_select on public.team_members for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- admins table: no policies, so it cannot be read from the browser at all.

-- evaluations: admins only.
drop policy if exists evaluations_all on public.evaluations;
create policy evaluations_all on public.evaluations for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------- team actions
create or replace function public.create_team(p_name text) returns public.teams
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  c text;
  t public.teams;
begin
  if uid is null then raise exception 'Please log in first.'; end if;
  if not exists (select 1 from profiles where user_id = uid) then raise exception 'Save your details first.'; end if;
  if exists (select 1 from team_members where user_id = uid) then raise exception 'You are already in a team.'; end if;
  p_name := btrim(coalesce(p_name, ''));
  if char_length(p_name) < 2 or char_length(p_name) > 60 then raise exception 'Enter a team name (2 to 60 characters).'; end if;
  loop
    c := 'GDG-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    exit when not exists (select 1 from teams where code = c);
  end loop;
  insert into teams (code, name, lead_id) values (c, p_name, uid) returning * into t;
  insert into team_members (user_id, team_id) values (uid, t.id);
  return t;
end $$;

create or replace function public.join_team(p_code text) returns public.teams
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  t public.teams;
  n int;
begin
  if uid is null then raise exception 'Please log in first.'; end if;
  if not exists (select 1 from profiles where user_id = uid) then raise exception 'Save your details first.'; end if;
  if exists (select 1 from team_members where user_id = uid) then raise exception 'You are already in a team.'; end if;
  select * into t from teams where code = upper(btrim(coalesce(p_code, ''))) for update;
  if not found then raise exception 'That team code was not found. Check it with your team lead.'; end if;
  select count(*) into n from team_members where team_id = t.id;
  if n >= 6 then raise exception 'This team is full (6 members).'; end if;
  insert into team_members (user_id, team_id) values (uid, t.id);
  return t;
end $$;

create or replace function public.submit_project(p_problem text, p_idea text, p_url text) returns public.teams
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  t public.teams;
  n int;
begin
  select * into t from teams where lead_id = uid for update;
  if not found then raise exception 'Only the team lead can submit the project.'; end if;
  select count(*) into n from team_members where team_id = t.id;
  if n < 3 then raise exception 'Your team needs at least 3 members before you can submit (now %).', n; end if;
  p_problem := btrim(coalesce(p_problem, ''));
  p_idea := btrim(coalesce(p_idea, ''));
  p_url := btrim(coalesce(p_url, ''));
  if char_length(p_problem) < 10 then raise exception 'Describe the problem statement (at least 10 characters).'; end if;
  if char_length(p_idea) < 10 then raise exception 'Describe your idea (at least 10 characters).'; end if;
  if p_url !~* '^https?://' then raise exception 'The project URL must start with http:// or https://'; end if;
  update teams set problem_statement = p_problem, idea = p_idea, project_url = p_url,
         submitted_at = coalesce(submitted_at, now())
   where id = t.id returning * into t;
  return t;
end $$;

create or replace function public.leave_team() returns void
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  t public.teams;
  tid uuid;
  n int;
begin
  select tm.team_id into tid from team_members tm where tm.user_id = uid;
  if tid is null then return; end if;
  select * into t from teams where id = tid for update;
  select count(*) into n from team_members where team_id = t.id;
  if t.lead_id = uid then
    if n > 1 then raise exception 'You are the team lead. Other members are still in the team.'; end if;
    delete from teams where id = t.id; -- also removes the lead's membership
  else
    delete from team_members where user_id = uid;
  end if;
end $$;

-- Names only: what teammates may see about each other.
create or replace function public.my_team_roster()
returns table (name text, college text, is_lead boolean, is_me boolean)
language sql stable security definer set search_path = public as $$
  select p.name, p.college, (t.lead_id = tm.user_id), (tm.user_id = auth.uid())
  from team_members tm
  join teams t on t.id = tm.team_id
  join profiles p on p.user_id = tm.user_id
  where tm.team_id = (select team_id from team_members where user_id = auth.uid())
  order by (t.lead_id = tm.user_id) desc, tm.joined_at;
$$;

-- ---------------------------------------------------------------- permissions
revoke all on all tables in schema public from anon;
revoke execute on all functions in schema public from public, anon;
grant select, insert, update on public.profiles to authenticated;
grant select on public.teams, public.team_members to authenticated;
grant select, insert, update, delete on public.evaluations to authenticated;
grant execute on function
  public.is_admin(), public.my_team_id(), public.create_team(text), public.join_team(text),
  public.submit_project(text, text, text), public.leave_team(), public.my_team_roster()
  to authenticated;

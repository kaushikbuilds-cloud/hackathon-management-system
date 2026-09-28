-- Project submissions: each approved team submits its work (title,
-- description, repository link, optional demo/video links and PDF slides)
-- while submissions are open and before the deadline. Staff and judges see them.

alter table public.hackathons add column if not exists projects_open boolean not null default false;
alter table public.hackathons add column if not exists projects_deadline timestamptz;

create table if not exists public.project_submissions (
  team_id      uuid primary key references public.teams(id) on delete cascade,
  hackathon_id uuid not null references public.hackathons(id) on delete cascade,
  title        text not null check (length(btrim(title)) between 2 and 100),
  description  text not null check (length(btrim(description)) between 10 and 2000),
  repo_url     text not null check (length(repo_url) <= 300 and repo_url ~* '^https://(www\.)?(github\.com|gitlab\.com|bitbucket\.org)/[^/[:space:]]+/[^/[:space:]]+/?$'),
  demo_url     text check (length(demo_url) <= 300 and demo_url ~* '^https?://[^[:space:]]+$'),
  video_url    text check (length(video_url) <= 300 and video_url ~* '^https?://[^[:space:]]+$'),
  slides_path  text,
  submitted_by uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists project_submissions_hackathon_idx on public.project_submissions (hackathon_id);
alter table public.project_submissions enable row level security;
grant select on public.project_submissions to authenticated;
grant all on public.project_submissions to service_role;
drop policy if exists project_submissions_read on public.project_submissions;
create policy project_submissions_read on public.project_submissions for select to authenticated
  using (hackathon_id = public.current_hackathon_id() and (
    team_id = public.my_team_id() or public.has_permission('view_participants')
    or public.has_permission('manage_judging') or public.has_permission('judge_teams')));

-- The team (its shared login or the Team Leader) saves its project; slides are attached by the server afterwards.
create or replace function public.save_project(p_title text, p_description text, p_repo text, p_demo text default null, p_video text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_team uuid := public.my_team_id();
  v_h uuid;
  v_open boolean;
  v_deadline timestamptz;
begin
  if v_team is null or not public.is_team_leader() then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;
  select t.hackathon_id, h.projects_open, h.projects_deadline into v_h, v_open, v_deadline
    from public.teams t join public.hackathons h on h.id = t.hackathon_id where t.id = v_team and t.status = 'approved';
  if v_h is null then
    return jsonb_build_object('ok', false, 'message', 'Only approved teams can submit a project.');
  end if;
  if not v_open or (v_deadline is not null and now() > v_deadline) then
    return jsonb_build_object('ok', false, 'message', 'Project submissions are closed.');
  end if;
  insert into public.project_submissions (team_id, hackathon_id, title, description, repo_url, demo_url, video_url, submitted_by)
  values (v_team, v_h, btrim(p_title), btrim(p_description), btrim(p_repo), nullif(btrim(p_demo), ''), nullif(btrim(p_video), ''), auth.uid())
  on conflict (team_id) do update set title = excluded.title, description = excluded.description, repo_url = excluded.repo_url,
    demo_url = excluded.demo_url, video_url = excluded.video_url, submitted_by = excluded.submitted_by, updated_at = now();
  return jsonb_build_object('ok', true);
exception when check_violation then
  return jsonb_build_object('ok', false, 'message', 'Please check the links: the repository must be a GitHub, GitLab or Bitbucket project link, and other links must start with https://.');
end;
$$;
revoke execute on function public.save_project(text, text, text, text, text) from public, anon;
grant execute on function public.save_project(text, text, text, text, text) to authenticated;

-- Slides (PDF): private; read through short-lived signed URLs only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('project-files', 'project-files', false, 10485760, array['application/pdf'])
on conflict (id) do nothing;

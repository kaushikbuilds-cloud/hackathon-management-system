-- Public results: once judging is done, the Admin publishes the winners
-- (teams with an award) on the public event page. Scores stay private.

alter table public.hackathons add column if not exists results_published boolean not null default false;
alter table public.hackathons add column if not exists results_published_at timestamptz;

-- Everything the public results page shows, or {published:false}.
-- Only awarded, approved teams; member names but no contact details; the project's public links (no slides).
create or replace function public.public_results(p_slug text)
returns jsonb language sql stable security definer set search_path = public as $$
  with h as (
    select id, results_published_at from public.hackathons
    where slug = lower(btrim(p_slug)) and status <> 'archived' and results_published
  ),
  winners as (
    select t.id, t.award, t.name, t.college, t.track,
      case t.award when 'Winner' then 1 when '1st Runner-up' then 2 when '2nd Runner-up' then 3 else 10 end as rank
    from public.teams t join h on t.hackathon_id = h.id
    where t.status = 'approved' and t.award is not null
  )
  select case when not exists (select 1 from h) then jsonb_build_object('published', false) else jsonb_build_object(
    'published', true,
    'published_at', (select results_published_at from h),
    'team_count', (select count(*) from public.teams t, h where t.hackathon_id = h.id and t.status = 'approved'),
    'participant_count', (select count(*) from public.participants p join public.teams t on t.id = p.team_id, h where t.hackathon_id = h.id and t.status = 'approved'),
    'winners', coalesce((
      select jsonb_agg(jsonb_build_object(
        'award', w.award, 'team_name', w.name, 'college', w.college, 'track', w.track,
        'members', (select coalesce(jsonb_agg(p.full_name order by p.role = 'leader' desc, p.full_name), '[]') from public.participants p where p.team_id = w.id),
        'statement', (select jsonb_build_object('code', s.code, 'title', s.title) from public.teams t join public.problem_statements s on s.id = t.problem_statement_id where t.id = w.id),
        'project', (select jsonb_build_object('title', ps.title, 'description', ps.description, 'repo_url', ps.repo_url, 'demo_url', ps.demo_url, 'video_url', ps.video_url)
                    from public.project_submissions ps where ps.team_id = w.id)
      ) order by w.rank, w.award, w.name)
      from winners w), '[]')
  ) end;
$$;
revoke execute on function public.public_results(text) from public;
grant execute on function public.public_results(text) to anon, authenticated;

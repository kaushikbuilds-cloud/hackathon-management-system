-- FAQ per hackathon. "public" answers show on the event page for anyone
-- (before registering); "participants" answers only in the team portal.
-- Managed by staff who can publish announcements.

create table if not exists public.hackathon_faqs (
  id           uuid primary key default gen_random_uuid(),
  hackathon_id uuid not null references public.hackathons(id) on delete cascade,
  question     text not null check (length(btrim(question)) between 3 and 200),
  answer       text not null check (length(btrim(answer)) between 1 and 3000),
  category     text check (length(category) <= 40),
  audience     text not null default 'public' check (audience in ('public', 'participants')),
  is_published boolean not null default true,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists hackathon_faqs_hackathon_idx on public.hackathon_faqs (hackathon_id, sort_order);

alter table public.hackathon_faqs enable row level security;
grant select on public.hackathon_faqs to anon;
grant select, insert, update, delete on public.hackathon_faqs to authenticated;
grant all on public.hackathon_faqs to service_role;

drop policy if exists faqs_public_read on public.hackathon_faqs;
create policy faqs_public_read on public.hackathon_faqs for select to anon
  using (is_published and audience = 'public');
drop policy if exists faqs_read on public.hackathon_faqs;
create policy faqs_read on public.hackathon_faqs for select to authenticated
  using ((is_published and audience = 'public')
         or (hackathon_id = public.current_hackathon_id() and (is_published or public.has_permission('publish_announcements'))));
drop policy if exists faqs_manage on public.hackathon_faqs;
create policy faqs_manage on public.hackathon_faqs for all to authenticated
  using (hackathon_id = public.current_hackathon_id() and public.has_permission('publish_announcements'))
  with check (hackathon_id = public.current_hackathon_id() and public.has_permission('publish_announcements'));

update public.permissions set label = 'Announcements, schedule & FAQ',
  description = 'Create, publish and archive announcements, schedule items and FAQ answers.'
where key = 'publish_announcements';

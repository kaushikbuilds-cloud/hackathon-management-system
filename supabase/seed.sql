-- =============================================================================
-- DEVELOPMENT SEED DATA ONLY — do not run against production.
-- Creates the event, a published registration form, an ID-card template,
-- schedule, announcements and realistic demo teams (through register_team so
-- IDs are generated exactly as in production).
-- Auth users (admin / official / team logins) are created by `npm run seed:users`.
-- =============================================================================

insert into public.hackathons (
  name, tagline, description, organizer_name, starts_at, ends_at, timezone, venue,
  contact_email, contact_phone, support_instructions, id_year,
  registration_opens_at, registration_closes_at, min_team_size, max_team_size
) values (
  'BuildFest 2026',
  '36 hours of building for social good',
  'A 36-hour student hackathon focused on climate, health and education.',
  'Riverside Institute of Technology',
  '2026-11-14 09:00:00+05:30', '2026-11-15 21:00:00+05:30', 'Asia/Kolkata',
  'Innovation Hall, Riverside Institute of Technology',
  'help@buildfest.example', '+91 90000 00000',
  'For urgent help during the event, visit the help desk near the main entrance or raise a support request in the Team Portal.',
  2026,
  '2026-09-01 00:00:00+05:30', '2026-11-10 23:59:00+05:30', 2, 4
);

insert into public.registration_forms (
  hackathon_id, slug, title, description, status, min_team_size, max_team_size, requires_approval, field_config, custom_questions
)
select id, 'buildfest-2026', 'BuildFest 2026 Team Registration',
  'Register your team of 2-4 students. One member must be the team leader.',
  'published', 2, 4, false,
  '{"phone":{"enabled":true,"required":true},"department":{"enabled":true,"required":true},"academic_year":{"enabled":true,"required":true}}'::jsonb,
  '[{"id":"track","label":"Which track are you most interested in?","type":"select","options":["Climate","Health","Education","Open"],"required":true},
    {"id":"idea","label":"Briefly describe your idea (optional)","type":"textarea","required":false}]'::jsonb
from public.hackathons;

insert into public.id_card_templates (hackathon_id, version, name, is_active, config)
select id, 1, 'Default portrait card', true,
  '{"cardSize":"cr80","pageLayout":"card","headerColor":"#0b1535","accentColor":"#6d5dfc","showPhoto":true,"showCollege":true,"showDepartment":true,"showEventDate":true,"showVenue":true,"footerText":"Wear this card at all times"}'::jsonb
from public.hackathons;

insert into public.event_schedule (hackathon_id, title, description, starts_at, ends_at, venue, visibility)
select h.id, s.title, s.description, s.starts_at::timestamptz, s.ends_at::timestamptz, s.venue, s.visibility::public.schedule_visibility
from public.hackathons h,
(values
  ('Check-in & breakfast', 'Collect your ID card and settle in.', '2026-11-14 08:00+05:30', '2026-11-14 09:00+05:30', 'Main Entrance', 'public'),
  ('Opening ceremony', 'Welcome, rules and problem statements.', '2026-11-14 09:00+05:30', '2026-11-14 10:00+05:30', 'Auditorium', 'public'),
  ('Hacking begins', null, '2026-11-14 10:00+05:30', null, 'Innovation Hall', 'participants'),
  ('Mentor round 1', 'Mentors visit each table.', '2026-11-14 16:00+05:30', '2026-11-14 18:00+05:30', 'Innovation Hall', 'participants'),
  ('Volunteer briefing', 'Help desk rota and attendance process.', '2026-11-14 07:15+05:30', '2026-11-14 07:45+05:30', 'Room 101', 'staff'),
  ('Final demos', 'Five-minute demos per team.', '2026-11-15 15:00+05:30', '2026-11-15 19:00+05:30', 'Auditorium', 'public')
) as s(title, description, starts_at, ends_at, venue, visibility);

insert into public.announcements (hackathon_id, title, body, status, audience, is_important)
select h.id, a.title, a.body, a.status::public.announcement_status, a.audience::public.audience, a.important
from public.hackathons h,
(values
  ('Welcome to BuildFest 2026!', 'Your ID cards will be available at the check-in desk. Please bring a government-issued photo ID.', 'published', 'all', true),
  ('Wi-Fi details', 'Network: BuildFest-Guest. The password is displayed at the help desk.', 'published', 'participants', false),
  ('Volunteer shift sheet', 'Officials: please confirm your help desk slots with the organising team.', 'published', 'staff', false),
  ('Prize announcement (draft)', 'Details coming soon.', 'draft', 'all', false)
) as a(title, body, status, audience, important);

-- Demo teams (the form window is temporarily widened so the seed works any time).
update public.registration_forms set opens_at = null, closes_at = null where slug = 'buildfest-2026';

select public.register_team('buildfest-2026', '{
  "team_name": "Code Ninjas", "college": "Riverside Institute of Technology",
  "answers": {"track": "Climate", "idea": "Carbon footprint tracker for campuses"},
  "members": [
    {"full_name": "Aarav Sharma", "email": "aarav.sharma@example.edu", "phone": "+91 98000 00001", "department": "Computer Science", "academic_year": "3rd Year", "role": "leader"},
    {"full_name": "Diya Patel", "email": "diya.patel@example.edu", "phone": "+91 98000 00002", "department": "Computer Science", "academic_year": "3rd Year", "role": "member"},
    {"full_name": "Kabir Mehta", "email": "kabir.mehta@example.edu", "phone": "+91 98000 00003", "department": "Electronics", "academic_year": "2nd Year", "role": "member"}
  ]}'::jsonb, 'seed-team-0001');

select public.register_team('buildfest-2026', '{
  "team_name": "Byte Brigade", "college": "Lakeside College of Engineering",
  "answers": {"track": "Health"},
  "members": [
    {"full_name": "Meera Iyer", "email": "meera.iyer@example.edu", "phone": "+91 98000 00011", "department": "Information Technology", "academic_year": "4th Year", "role": "leader"},
    {"full_name": "Rohan Das", "email": "rohan.das@example.edu", "phone": "+91 98000 00012", "department": "Information Technology", "academic_year": "4th Year", "role": "member"}
  ]}'::jsonb, 'seed-team-0002');

select public.register_team('buildfest-2026', '{
  "team_name": "Quantum Quokkas", "college": "Riverside Institute of Technology",
  "answers": {"track": "Education"},
  "members": [
    {"full_name": "Sara Khan", "email": "sara.khan@example.edu", "phone": "+91 98000 00021", "department": "Mathematics", "academic_year": "2nd Year", "role": "leader"},
    {"full_name": "Arjun Nair", "email": "arjun.nair@example.edu", "phone": "+91 98000 00022", "department": "Physics", "academic_year": "2nd Year", "role": "member"},
    {"full_name": "Ishita Roy", "email": "ishita.roy@example.edu", "phone": "+91 98000 00023", "department": "Computer Science", "academic_year": "1st Year", "role": "member"},
    {"full_name": "Vikram Singh", "email": "vikram.singh@example.edu", "phone": "+91 98000 00024", "department": "Mechanical", "academic_year": "3rd Year", "role": "member"}
  ]}'::jsonb, 'seed-team-0003');

select public.register_team('buildfest-2026', '{
  "team_name": "Pixel Pioneers", "college": "Hillview University",
  "answers": {"track": "Open"},
  "members": [
    {"full_name": "Ananya Gupta", "email": "ananya.gupta@example.edu", "phone": "+91 98000 00031", "department": "Design", "academic_year": "3rd Year", "role": "leader"},
    {"full_name": "Neil Fernandes", "email": "neil.fernandes@example.edu", "phone": "+91 98000 00032", "department": "Computer Science", "academic_year": "3rd Year", "role": "member"}
  ]}'::jsonb, 'seed-team-0004');

-- Restore the configured registration window.
update public.registration_forms
   set opens_at = '2026-09-01 00:00:00+05:30', closes_at = '2026-11-10 23:59:00+05:30'
 where slug = 'buildfest-2026';

-- Team / Participant IDs carry the hackathon's own prefix (SAMPLE1-T0001,
-- SAMPLE1-P0001) and are numbered per hackathon. Existing IDs are immutable
-- and keep their old TEAM-YYYY-NNNN / PRT-YYYY-NNNN form.

alter table public.hackathons add column if not exists code_prefix text;

create or replace function public.derive_code_prefix(p_name text)
returns text language plpgsql immutable as $$
declare
  w text[] := array(select x from regexp_split_to_table(upper(regexp_replace(coalesce(p_name, ''), '[^A-Za-z0-9]+', ' ', 'g')), ' ') x where x <> '');
  joined text := array_to_string(w, '');
  r text := '';
  x text;
begin
  if length(joined) between 2 and 8 then return joined; end if;
  foreach x in array w loop
    r := r || case when x ~ '^[0-9]+$' then x else left(x, 1) end;
  end loop;
  r := left(r, 8);
  if length(r) < 2 then r := left(joined, 8); end if;
  return case when length(r) < 2 then 'HB' else r end;
end;
$$;

create or replace function public.hackathons_code_prefix()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  base text;
  n int := 1;
begin
  new.code_prefix := nullif(upper(btrim(coalesce(new.code_prefix, ''))), '');
  if new.code_prefix is null then
    base := public.derive_code_prefix(new.name);
    new.code_prefix := base;
    while exists (select 1 from public.hackathons h where h.code_prefix = new.code_prefix and h.id <> new.id) loop
      n := n + 1;
      new.code_prefix := left(base, 10 - length(n::text)) || n::text;
    end loop;
  end if;
  if tg_op = 'UPDATE' and new.code_prefix is distinct from old.code_prefix and old.code_prefix is not null
     and exists (select 1 from public.teams t where t.hackathon_id = new.id) then
    raise exception 'The ID prefix is locked once teams have registered' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists hackathons_code_prefix on public.hackathons;
create trigger hackathons_code_prefix before insert or update of code_prefix on public.hackathons
  for each row execute function public.hackathons_code_prefix();

update public.hackathons set code_prefix = null where code_prefix is null; -- fires the trigger: derive for existing rows
alter table public.hackathons alter column code_prefix set not null;
alter table public.hackathons drop constraint if exists hackathons_code_prefix_format;
alter table public.hackathons add constraint hackathons_code_prefix_format check (code_prefix ~ '^[A-Z0-9]{2,10}$');
create unique index if not exists hackathons_code_prefix_unique on public.hackathons (code_prefix);

-- Per-hackathon counters (service-only; reached through the triggers below).
create table if not exists public.hackathon_code_counters (
  hackathon_id uuid primary key references public.hackathons(id) on delete cascade,
  teams integer not null default 0,
  participants integer not null default 0
);
alter table public.hackathon_code_counters enable row level security;

create or replace function public.assign_team_code()
returns trigger language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if new.team_code is null then
    insert into public.hackathon_code_counters as c (hackathon_id, teams) values (new.hackathon_id, 1)
      on conflict (hackathon_id) do update set teams = c.teams + 1 returning c.teams into n;
    new.team_code := (select code_prefix from public.hackathons where id = new.hackathon_id) || '-T' || lpad(n::text, 4, '0');
  end if;
  return new;
end;
$$;

create or replace function public.assign_participant_code()
returns trigger language plpgsql security definer set search_path = public as $$
declare n int;
begin
  -- Runs before participants_before_write (triggers fire alphabetically).
  new.hackathon_id := (select hackathon_id from public.teams where id = new.team_id);
  if new.participant_code is null then
    insert into public.hackathon_code_counters as c (hackathon_id, participants) values (new.hackathon_id, 1)
      on conflict (hackathon_id) do update set participants = c.participants + 1 returning c.participants into n;
    new.participant_code := (select code_prefix from public.hackathons where id = new.hackathon_id) || '-P' || lpad(n::text, 4, '0');
  end if;
  return new;
end;
$$;

revoke execute on function public.hackathons_code_prefix() from public, anon, authenticated;

-- Qmaster: run once in the Supabase SQL editor, or with `supabase db push`.
-- All critical mutations are authenticated, owner-checked, atomic RPCs.
create table public.organizers (
  id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create function public.provision_organizer() returns trigger language plpgsql security definer set search_path = public as $$
begin insert into organizers(id) values(new.id) on conflict do nothing; return new; end $$;
create trigger qmaster_organizer after insert on auth.users for each row execute function public.provision_organizer();
insert into public.organizers(id) select id from auth.users on conflict do nothing;

create table public.players (
  id uuid primary key default gen_random_uuid(), organizer_id uuid not null references organizers(id),
  name text not null check (length(trim(name)) between 1 and 100), photo_path text,
  archived boolean not null default false, created_at timestamptz not null default now()
);
create table public.tournaments (
  id uuid primary key default gen_random_uuid(), organizer_id uuid not null references organizers(id),
  name text not null check (length(trim(name)) between 1 and 150), description text,
  event_date date not null, venue text, play_type text not null check(play_type in ('singles','doubles')),
  court_count int not null check(court_count between 1 and 32), best_of int not null check(best_of in (1,3)),
  format text not null check(format in ('single_elimination','double_elimination','round_robin')),
  status text not null default 'draft' check(status in ('draft','ongoing','completed')),
  published boolean not null default false, banner_path text, champion_entry_id uuid,
  created_at timestamptz not null default now()
);
create table public.tournament_entries (
  id uuid primary key default gen_random_uuid(), tournament_id uuid not null references tournaments(id) on delete cascade,
  name text not null check(length(trim(name)) between 1 and 150), seed int not null check(seed > 0),
  created_at timestamptz not null default now(), unique(tournament_id, seed)
);
alter table tournaments add foreign key(champion_entry_id) references tournament_entries(id) deferrable initially deferred;
create table public.tournament_entry_players (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  entry_id uuid not null references tournament_entries(id) on delete cascade,
  player_id uuid not null references players(id), unique(entry_id,player_id), unique(tournament_id,player_id)
);
create table public.tournament_matches (
  id uuid primary key default gen_random_uuid(), tournament_id uuid not null references tournaments(id) on delete cascade,
  bracket text not null check(bracket in ('upper','lower','final','reset','round_robin')),
  round_no int not null check(round_no > 0), position int not null check(position >= 0),
  entry_a_id uuid references tournament_entries(id), entry_b_id uuid references tournament_entries(id),
  source_a_match_id uuid references tournament_matches(id) deferrable initially deferred,
  source_a_outcome text check(source_a_outcome in ('winner','loser')),
  source_b_match_id uuid references tournament_matches(id) deferrable initially deferred,
  source_b_outcome text check(source_b_outcome in ('winner','loser')),
  winner_entry_id uuid references tournament_entries(id), loser_entry_id uuid references tournament_entries(id),
  status text not null default 'pending' check(status in ('pending','ready','playing','completed','bye','skipped')),
  court_no int check(court_no > 0), started_at timestamptz, completed_at timestamptz,
  walkover boolean not null default false, version int not null default 0,
  check((source_a_match_id is null) = (source_a_outcome is null)),
  check((source_b_match_id is null) = (source_b_outcome is null)),
  check(entry_a_id is null or entry_b_id is null or entry_a_id <> entry_b_id),
  unique(tournament_id,bracket,round_no,position)
);
create unique index tournament_court_active on tournament_matches(tournament_id,court_no) where status='playing';
create table public.queue_sessions (
  id uuid primary key default gen_random_uuid(), organizer_id uuid not null references organizers(id),
  name text not null check(length(trim(name)) between 1 and 150),
  play_type text not null check(play_type in ('singles','doubles')),
  court_count int not null check(court_count between 1 and 32), best_of int not null check(best_of in (1,3)),
  status text not null default 'ongoing' check(status in ('ongoing','completed')),
  created_at timestamptz not null default now()
);
create table public.queue_members (
  id uuid primary key default gen_random_uuid(), session_id uuid not null references queue_sessions(id) on delete cascade,
  player_id uuid not null references players(id), position bigint not null check(position >= 0),
  status text not null default 'waiting' check(status in ('waiting','playing')), rejoin boolean not null default true,
  unique(session_id,player_id), unique(session_id,position)
);
create table public.queue_matches (
  id uuid primary key default gen_random_uuid(), session_id uuid not null references queue_sessions(id),
  status text not null default 'playing' check(status in ('playing','completed')),
  court_no int not null check(court_no > 0), winner_side text check(winner_side in ('a','b')),
  started_at timestamptz not null default now(), completed_at timestamptz,
  walkover boolean not null default false, version int not null default 0
);
create unique index queue_court_active on queue_matches(session_id,court_no) where status='playing';
create table public.queue_match_players (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references queue_matches(id), player_id uuid not null references players(id),
  side text not null check(side in ('a','b')), unique(match_id,player_id)
);
create table public.match_games (
  id uuid primary key default gen_random_uuid(),
  tournament_match_id uuid references tournament_matches(id) on delete cascade,
  queue_match_id uuid references queue_matches(id),
  game_no int not null check(game_no between 1 and 3),
  score_a int not null check(score_a between 0 and 30), score_b int not null check(score_b between 0 and 30),
  check(num_nonnulls(tournament_match_id,queue_match_id)=1),
  unique(tournament_match_id,game_no), unique(queue_match_id,game_no)
);
create index players_owner_idx on players(organizer_id);
create index tournaments_owner_idx on tournaments(organizer_id);
create index entries_tournament_idx on tournament_entries(tournament_id);
create index entry_players_player_idx on tournament_entry_players(player_id);
create index matches_tournament_idx on tournament_matches(tournament_id);
create index sessions_owner_idx on queue_sessions(organizer_id);
create index queue_matches_session_idx on queue_matches(session_id);
create index queue_match_players_player_idx on queue_match_players(player_id);
create index queue_members_session_idx on queue_members(session_id,position);
create index match_games_tournament_idx on match_games(tournament_match_id);
create index match_games_queue_idx on match_games(queue_match_id);

-- Helpers execute under the migration owner, avoiding recursive RLS lookups.
create function public.owns_tournament(p_id uuid) returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from tournaments where id=p_id and organizer_id=auth.uid()) $$;
create function public.reads_tournament(p_id uuid) returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from tournaments where id=p_id and (organizer_id=auth.uid() or published)) $$;
create function public.owns_queue(p_id uuid) returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from queue_sessions where id=p_id and organizer_id=auth.uid()) $$;
create function public.reads_tournament_match(p_id uuid) returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from tournament_matches where id=p_id and reads_tournament(tournament_id)) $$;
create function public.owns_queue_match(p_id uuid) returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from queue_matches where id=p_id and owns_queue(session_id)) $$;

alter table organizers enable row level security;
alter table players enable row level security;
alter table tournaments enable row level security;
alter table tournament_entries enable row level security;
alter table tournament_entry_players enable row level security;
alter table tournament_matches enable row level security;
alter table queue_sessions enable row level security;
alter table queue_members enable row level security;
alter table queue_matches enable row level security;
alter table queue_match_players enable row level security;
alter table match_games enable row level security;
create policy organizer_read on organizers for select to authenticated using(id=auth.uid());
create policy player_read on players for select to authenticated using(organizer_id=auth.uid());
create policy player_insert on players for insert to authenticated with check(organizer_id=auth.uid());
create policy player_update on players for update to authenticated using(organizer_id=auth.uid()) with check(organizer_id=auth.uid());
create policy tournament_read on tournaments for select to anon,authenticated using(published or organizer_id=auth.uid());
create policy tournament_insert on tournaments for insert to authenticated with check(organizer_id=auth.uid() and status='draft' and not published and champion_entry_id is null);
create policy entries_read on tournament_entries for select to anon,authenticated using(reads_tournament(tournament_id));
create policy entry_players_read on tournament_entry_players for select to authenticated using(owns_tournament(tournament_id));
create policy tournament_matches_read on tournament_matches for select to anon,authenticated using(reads_tournament(tournament_id));
create policy queue_sessions_read on queue_sessions for select to authenticated using(organizer_id=auth.uid());
create policy queue_sessions_insert on queue_sessions for insert to authenticated with check(organizer_id=auth.uid() and status='ongoing');
create policy queue_members_read on queue_members for select to authenticated using(owns_queue(session_id));
create policy queue_matches_read on queue_matches for select to authenticated using(owns_queue(session_id));
create policy queue_match_players_read on queue_match_players for select to authenticated using(owns_queue_match(match_id));
create policy match_games_read on match_games for select to anon,authenticated using(reads_tournament_match(tournament_match_id) or owns_queue_match(queue_match_id));
revoke all on organizers,players,tournaments,tournament_entries,tournament_entry_players,tournament_matches,queue_sessions,queue_members,queue_matches,queue_match_players,match_games from anon,authenticated;
grant select on tournaments,tournament_entries,tournament_matches,match_games to anon,authenticated;
grant select on organizers,players,tournament_entry_players,queue_sessions,queue_members,queue_matches,queue_match_players to authenticated;
grant insert on players,tournaments,queue_sessions to authenticated;
grant update(name,photo_path,archived) on players to authenticated;

-- Serialize operations for one organizer so cross-event player checks are atomic.
create function public.lock_organizer() returns uuid language plpgsql security definer set search_path=public as $$
declare u uuid:=auth.uid(); begin
 if u is null or not exists(select 1 from organizers where id=u) then raise exception 'Sign in as an organizer.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,0)); return u;
end $$;
create function public.player_busy(p_id uuid,p_exclude uuid default null) returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from queue_match_players mp join queue_matches m on m.id=mp.match_id where mp.player_id=p_id and m.status='playing' and m.id is distinct from p_exclude)
 or exists(select 1 from tournament_entry_players ep join tournament_matches m on ep.entry_id in (m.entry_a_id,m.entry_b_id) where ep.player_id=p_id and m.status='playing' and m.id is distinct from p_exclude) $$;

create function public.register_entry(p_tournament_id uuid,p_name text,p_player_ids uuid[]) returns uuid language plpgsql security definer set search_path=public as $$
declare u uuid; t tournaments; e uuid:=gen_random_uuid(); n int; begin
 u:=lock_organizer(); select * into t from tournaments where id=p_tournament_id and organizer_id=u for update;
 if not found then raise exception 'Tournament not found.'; end if;
 if t.status<>'draft' or exists(select 1 from tournament_matches where tournament_id=t.id) then raise exception 'Reset the draft bracket before changing participants.'; end if;
 n:=case when t.play_type='singles' then 1 else 2 end;
 if cardinality(p_player_ids) is distinct from n or (select count(distinct x) from unnest(p_player_ids) x)<>n then raise exception 'Choose exactly % distinct players.',n; end if;
 if (select count(*) from players where id=any(p_player_ids) and organizer_id=u and not archived)<>n then raise exception 'Choose active players you own.'; end if;
 if exists(select 1 from tournament_entry_players where tournament_id=t.id and player_id=any(p_player_ids)) then raise exception 'A player is already registered in this tournament.'; end if;
 insert into tournament_entries(id,tournament_id,name,seed) values(e,t.id,trim(p_name),(select coalesce(max(seed),0)+1 from tournament_entries where tournament_id=t.id));
 insert into tournament_entry_players(tournament_id,entry_id,player_id) select t.id,e,x from unnest(p_player_ids) x;
 return e;
end $$;
create function public.remove_entry(p_entry_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare u uuid; t tournaments; begin
 u:=lock_organizer(); select t0.* into t from tournaments t0 join tournament_entries e on e.tournament_id=t0.id where e.id=p_entry_id and t0.organizer_id=u for update of t0;
 if not found then raise exception 'Entry not found.'; end if;
 if t.status<>'draft' or exists(select 1 from tournament_matches where tournament_id=t.id) then raise exception 'Reset the draft bracket before changing participants.'; end if;
 delete from tournament_entries where id=p_entry_id;
end $$;
create function public.seed_entries(p_tournament_id uuid,p_entry_ids uuid[]) returns void language plpgsql security definer set search_path=public as $$
declare u uuid; n int; x uuid; i int:=0; begin
 u:=lock_organizer(); if not exists(select 1 from tournaments where id=p_tournament_id and organizer_id=u and status='draft') or exists(select 1 from tournament_matches where tournament_id=p_tournament_id) then raise exception 'Seeding is only available before generating a draft bracket.'; end if;
 select count(*) into n from tournament_entries where tournament_id=p_tournament_id;
 if cardinality(p_entry_ids) is distinct from n or (select count(distinct v) from unnest(p_entry_ids) v)<>n or (select count(*) from tournament_entries where tournament_id=p_tournament_id and id=any(p_entry_ids))<>n then raise exception 'Provide every entry exactly once.'; end if;
 update tournament_entries set seed=seed+100000 where tournament_id=p_tournament_id;
 foreach x in array p_entry_ids loop i:=i+1; update tournament_entries set seed=i where id=x; end loop;
end $$;

-- Resolve graph slots only when each feed has finished. Empty feeds represent BYEs.
create function public.resolve_tournament(p_tournament_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare m tournament_matches; a tournament_matches; b tournament_matches; va uuid; vb uuid; done_a boolean; done_b boolean; changed boolean; passes int:=0; champ uuid; fmt text; begin
 loop
  changed:=false; passes:=passes+1;
  for m in select * from tournament_matches where tournament_id=p_tournament_id and status='pending' order by round_no,position loop
   va:=m.entry_a_id; vb:=m.entry_b_id; done_a:=m.source_a_match_id is null; done_b:=m.source_b_match_id is null;
   if m.source_a_match_id is not null then select * into a from tournament_matches where id=m.source_a_match_id; done_a:=a.status in ('completed','bye','skipped'); if done_a then va:=case when m.source_a_outcome='winner' then a.winner_entry_id else a.loser_entry_id end; end if; end if;
   if m.source_b_match_id is not null then select * into b from tournament_matches where id=m.source_b_match_id; done_b:=b.status in ('completed','bye','skipped'); if done_b then vb:=case when m.source_b_outcome='winner' then b.winner_entry_id else b.loser_entry_id end; end if; end if;
   if done_a and done_b then
    if m.bracket='reset' and a.winner_entry_id=a.entry_a_id then
     update tournament_matches set entry_a_id=va,entry_b_id=vb,status='skipped',completed_at=now() where id=m.id;
    elsif va is null or vb is null then
     update tournament_matches set entry_a_id=va,entry_b_id=vb,status='bye',winner_entry_id=coalesce(va,vb),loser_entry_id=null,completed_at=now() where id=m.id;
    else update tournament_matches set entry_a_id=va,entry_b_id=vb,status='ready' where id=m.id;
    end if; changed:=true;
   else update tournament_matches set entry_a_id=case when done_a then va else null end,entry_b_id=case when done_b then vb else null end where id=m.id;
   end if;
  end loop;
  exit when not changed or passes>512;
 end loop;
 if exists(select 1 from tournament_matches where tournament_id=p_tournament_id) and not exists(select 1 from tournament_matches where tournament_id=p_tournament_id and status not in ('completed','bye','skipped')) then
  select format into fmt from tournaments where id=p_tournament_id;
  if fmt='round_robin' then
   select e.id into champ from tournament_entries e left join tournament_matches mm on mm.tournament_id=e.tournament_id and e.id in(mm.entry_a_id,mm.entry_b_id)
   left join lateral (select coalesce(sum(case when mm.entry_a_id=e.id then sign(g.score_a-g.score_b) else sign(g.score_b-g.score_a) end),0) gd,
    coalesce(sum(case when mm.entry_a_id=e.id then g.score_a-g.score_b else g.score_b-g.score_a end),0) pd from match_games g where g.tournament_match_id=mm.id) s on true
   where e.tournament_id=p_tournament_id group by e.id,e.seed
   order by count(*) filter(where mm.winner_entry_id=e.id) desc,coalesce(sum(s.gd),0) desc,coalesce(sum(s.pd),0) desc,e.seed asc limit 1;
  else
   select winner_entry_id into champ from tournament_matches where tournament_id=p_tournament_id and bracket in('final','reset') and status='completed' order by case when bracket='reset' then 0 else 1 end,round_no desc limit 1;
  end if;
  update tournaments set status='completed',champion_entry_id=champ where id=p_tournament_id;
 end if;
end $$;

create function public.generate_bracket(p_tournament_id uuid,p_matches jsonb) returns void language plpgsql security definer set search_path=public as $$
declare u uuid; t tournaments; n int; count_m int; size int:=1; begin
 u:=lock_organizer(); select * into t from tournaments where id=p_tournament_id and organizer_id=u for update;
 if not found then raise exception 'Tournament not found.'; end if;
 if t.status<>'draft' or exists(select 1 from tournament_matches where tournament_id=t.id) then raise exception 'A bracket already exists. Reset it explicitly first.'; end if;
 select count(*) into n from tournament_entries where tournament_id=t.id;
 if n<2 or n>64 then raise exception 'Register between 2 and 64 entries.'; end if;
 while size<n loop size:=size*2; end loop;
 if jsonb_typeof(p_matches)<>'array' or jsonb_array_length(p_matches) not between 1 and 4032 then raise exception 'Invalid bracket graph.'; end if;
 insert into tournament_matches(id,tournament_id,bracket,round_no,position,entry_a_id,entry_b_id,source_a_match_id,source_a_outcome,source_b_match_id,source_b_outcome)
 select x.id,t.id,x.bracket,x.round_no,x.position,x.entry_a_id,x.entry_b_id,x.source_a_match_id,x.source_a_outcome,x.source_b_match_id,x.source_b_outcome
 from jsonb_to_recordset(p_matches) as x(id uuid,bracket text,round_no int,position int,entry_a_id uuid,entry_b_id uuid,source_a_match_id uuid,source_a_outcome text,source_b_match_id uuid,source_b_outcome text);
 if exists(select 1 from tournament_matches m where m.tournament_id=t.id and (
  (m.entry_a_id is not null and not exists(select 1 from tournament_entries e where e.id=m.entry_a_id and e.tournament_id=t.id)) or
  (m.entry_b_id is not null and not exists(select 1 from tournament_entries e where e.id=m.entry_b_id and e.tournament_id=t.id)) or
  (m.source_a_match_id is not null and not exists(select 1 from tournament_matches s where s.id=m.source_a_match_id and s.tournament_id=t.id)) or
  (m.source_b_match_id is not null and not exists(select 1 from tournament_matches s where s.id=m.source_b_match_id and s.tournament_id=t.id)) or
  (m.source_a_match_id is not null and m.entry_a_id is not null) or (m.source_b_match_id is not null and m.entry_b_id is not null))) then raise exception 'Invalid bracket entries or cross-tournament feeds.'; end if;
 if exists(with recursive walk as (
  select id,id as root,array[id] as path,false as cyclic from tournament_matches where tournament_id=t.id
  union all select m.id,w.root,w.path||m.id,m.id=any(w.path) from walk w join tournament_matches m on m.id in ((select source_a_match_id from tournament_matches where id=w.id),(select source_b_match_id from tournament_matches where id=w.id)) where not w.cyclic
 ) select 1 from walk where cyclic) then raise exception 'Bracket graph contains a cycle.'; end if;
 if t.format='round_robin' then
  select count(*) into count_m from tournament_matches where tournament_id=t.id;
  if count_m<>n*(n-1)/2 or exists(select 1 from tournament_matches where tournament_id=t.id and (bracket<>'round_robin' or entry_a_id is null or entry_b_id is null or source_a_match_id is not null or source_b_match_id is not null)) then raise exception 'Invalid round robin schedule.'; end if;
  if exists(select 1 from tournament_matches where tournament_id=t.id group by least(entry_a_id::text,entry_b_id::text),greatest(entry_a_id::text,entry_b_id::text) having count(*)>1) then raise exception 'Duplicate round robin pairing.'; end if;
 else
  if exists(select 1 from (select entry_a_id e from tournament_matches where tournament_id=t.id and entry_a_id is not null union all select entry_b_id from tournament_matches where tournament_id=t.id and entry_b_id is not null) x group by e having count(*)<>1)
   or (select count(distinct e) from (select entry_a_id e from tournament_matches where tournament_id=t.id union all select entry_b_id from tournament_matches where tournament_id=t.id) x)<>n then raise exception 'Every entry must appear exactly once in initial bracket slots.'; end if;
  if (select count(*) from tournament_matches where tournament_id=t.id and bracket='final')<>1 or (select count(*) from tournament_matches where tournament_id=t.id and bracket='reset')<>(case when t.format='double_elimination' then 1 else 0 end) then raise exception 'Invalid final structure.'; end if;
  if t.format='single_elimination' and exists(select 1 from tournament_matches where tournament_id=t.id and (bracket not in('upper','final') or source_a_outcome='loser' or source_b_outcome='loser')) then raise exception 'Invalid single elimination feeds.'; end if;
  select count(*) into count_m from tournament_matches where tournament_id=t.id;
  if t.format='single_elimination' then
   if count_m<>size-1 or exists(select 1 from tournament_matches m where m.tournament_id=t.id and
    (select count(*) from tournament_matches s where s.tournament_id=t.id and (s.source_a_match_id=m.id or s.source_b_match_id=m.id))<>(case when m.bracket='final' then 0 else 1 end)) then raise exception 'Every elimination winner must advance exactly once to the final.'; end if;
  else
   if count_m<>2*size-1 or (select count(*) from tournament_matches where tournament_id=t.id and bracket='upper')<>size-1 or (select count(*) from tournament_matches where tournament_id=t.id and bracket='lower')<>size-2 then raise exception 'Invalid double elimination round count.'; end if;
   if exists(select 1 from tournament_matches m where m.tournament_id=t.id and (
    (select count(*) from (select source_a_match_id sid,source_a_outcome outcome from tournament_matches where tournament_id=t.id union all select source_b_match_id,source_b_outcome from tournament_matches where tournament_id=t.id) feeds where sid=m.id and outcome='winner')<>(case when m.bracket='reset' then 0 else 1 end)
    or (select count(*) from (select source_a_match_id sid,source_a_outcome outcome from tournament_matches where tournament_id=t.id union all select source_b_match_id,source_b_outcome from tournament_matches where tournament_id=t.id) feeds where sid=m.id and outcome='loser')<>(case when m.bracket in('upper','final') then 1 else 0 end)
   )) then raise exception 'Double elimination winner and loser feeds are incomplete.'; end if;
   if exists(select 1 from tournament_matches dest join tournament_matches src on src.id in(dest.source_a_match_id,dest.source_b_match_id) where dest.tournament_id=t.id and (
    (src.bracket='upper' and ((dest.source_a_match_id=src.id and dest.source_a_outcome='winner') or (dest.source_b_match_id=src.id and dest.source_b_outcome='winner')) and dest.bracket not in('upper','final'))
    or (src.bracket='upper' and ((dest.source_a_match_id=src.id and dest.source_a_outcome='loser') or (dest.source_b_match_id=src.id and dest.source_b_outcome='loser')) and dest.bracket not in('lower','final'))
    or (src.bracket='lower' and dest.bracket not in('lower','final')) or (src.bracket='final' and dest.bracket<>'reset')
   )) then raise exception 'Invalid cross-bracket progression.'; end if;
   if exists(select 1 from tournament_matches r join tournament_matches f on f.tournament_id=r.tournament_id and f.bracket='final' where r.tournament_id=t.id and r.bracket='reset' and (r.source_a_match_id is distinct from f.id or r.source_b_match_id is distinct from f.id or r.source_a_outcome is distinct from 'winner' or r.source_b_outcome is distinct from 'loser')) then raise exception 'The reset must receive both grand-finalists.'; end if;
   if not exists(select 1 from tournament_matches f join tournament_matches a on a.id=f.source_a_match_id join tournament_matches b on b.id=f.source_b_match_id where f.tournament_id=t.id and f.bracket='final' and a.bracket='upper' and f.source_a_outcome='winner' and ((size=2 and b.bracket='upper' and f.source_b_outcome='loser') or (size>2 and b.bracket='lower' and f.source_b_outcome='winner'))) then raise exception 'Grand final must contain the upper and lower finalists.'; end if;
  end if;
 end if;
 perform resolve_tournament(t.id);
end $$;
create function public.reset_bracket(p_tournament_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare u uuid; begin
 u:=lock_organizer(); if not exists(select 1 from tournaments where id=p_tournament_id and organizer_id=u) then raise exception 'Tournament not found.'; end if;
 if exists(select 1 from tournament_matches where tournament_id=p_tournament_id and status='playing') then raise exception 'Finish active matches before resetting the bracket.'; end if;
 update tournaments set status='draft',champion_entry_id=null where id=p_tournament_id;
 delete from tournament_matches where tournament_id=p_tournament_id;
end $$;
create function public.start_tournament(p_tournament_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare u uuid; begin
 u:=lock_organizer(); if not exists(select 1 from tournaments where id=p_tournament_id and organizer_id=u and status='draft') then raise exception 'Only a draft tournament can start.'; end if;
 if not exists(select 1 from tournament_matches where tournament_id=p_tournament_id) then raise exception 'Generate a bracket first.'; end if;
 update tournaments set status='ongoing' where id=p_tournament_id;
end $$;
create function public.assign_tournament_court(p_match_id uuid,p_court_no int) returns void language plpgsql security definer set search_path=public as $$
declare u uuid; m tournament_matches; t tournaments; begin
 u:=lock_organizer(); select * into m from tournament_matches where id=p_match_id for update;
 select * into t from tournaments where id=m.tournament_id and organizer_id=u;
 if not found then raise exception 'Match not found.'; end if;
 if t.status<>'ongoing' or m.status not in('ready','playing') then raise exception 'Start the tournament and choose a ready match.'; end if;
 if p_court_no is null or p_court_no<1 or p_court_no>t.court_count then raise exception 'Choose a valid court.'; end if;
 if exists(select 1 from tournament_matches where tournament_id=t.id and court_no=p_court_no and status='playing' and id<>m.id) then raise exception 'That court is occupied.'; end if;
 if exists(select 1 from tournament_entry_players where entry_id in(m.entry_a_id,m.entry_b_id) and player_busy(player_id,m.id)) then raise exception 'A participant is already playing another match.'; end if;
 update tournament_matches set court_no=p_court_no,status='playing',started_at=coalesce(started_at,now()),version=version+1 where id=m.id;
end $$;

create function public.update_tournament(p_tournament_id uuid,p_details jsonb) returns void language plpgsql security definer set search_path=public as $$
declare u uuid; t tournaments; begin
 u:=lock_organizer(); select * into t from tournaments where id=p_tournament_id and organizer_id=u for update;
 if not found then raise exception 'Tournament not found.'; end if;
 if (p_details ? 'play_type' and p_details->>'play_type'<>t.play_type) or (p_details ? 'format' and p_details->>'format'<>t.format) or (p_details ? 'best_of' and (p_details->>'best_of')::int<>t.best_of) then
  if t.status<>'draft' or exists(select 1 from tournament_matches where tournament_id=t.id) or exists(select 1 from tournament_entries where tournament_id=t.id) then raise exception 'Format can only change before registering entries.'; end if;
 end if;
 if p_details ? 'court_count' and exists(select 1 from tournament_matches where tournament_id=t.id and status='playing' and court_no>(p_details->>'court_count')::int) then raise exception 'Cannot remove an occupied court.'; end if;
 update tournaments set name=coalesce(p_details->>'name',name),description=case when p_details ? 'description' then p_details->>'description' else description end,
 event_date=coalesce((p_details->>'event_date')::date,event_date),venue=case when p_details ? 'venue' then p_details->>'venue' else venue end,
 play_type=coalesce(p_details->>'play_type',play_type),format=coalesce(p_details->>'format',format),best_of=coalesce((p_details->>'best_of')::int,best_of),
 court_count=coalesce((p_details->>'court_count')::int,court_count),banner_path=case when p_details ? 'banner_path' then p_details->>'banner_path' else banner_path end where id=t.id;
end $$;
create function public.publish_tournament(p_tournament_id uuid,p_published boolean) returns void language plpgsql security definer set search_path=public as $$
declare u uuid; begin u:=lock_organizer(); update tournaments set published=p_published where id=p_tournament_id and organizer_id=u; if not found then raise exception 'Tournament not found.'; end if; end $$;

create function public.add_queue_players(p_session_id uuid,p_player_ids uuid[]) returns void language plpgsql security definer set search_path=public as $$
declare u uuid; s queue_sessions; p uuid; pos bigint; begin
 u:=lock_organizer(); select * into s from queue_sessions where id=p_session_id and organizer_id=u and status='ongoing' for update;
 if not found then raise exception 'Active queue session not found.'; end if;
 if p_player_ids is null or cardinality(p_player_ids)=0 then raise exception 'Choose players to add.'; end if;
 if cardinality(p_player_ids)<>(select count(distinct x) from unnest(p_player_ids) x) or (select count(*) from players where id=any(p_player_ids) and organizer_id=u and not archived)<>cardinality(p_player_ids) then raise exception 'Choose distinct active players you own.'; end if;
 if exists(select 1 from queue_members where session_id=s.id and player_id=any(p_player_ids)) then raise exception 'A selected player is already in this queue.'; end if;
 select coalesce(max(position),0) into pos from queue_members where session_id=s.id;
 foreach p in array p_player_ids loop pos:=pos+1; insert into queue_members(session_id,player_id,position) values(s.id,p,pos); end loop;
end $$;
create function public.remove_queue_player(p_member_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare u uuid; m queue_members; begin
 u:=lock_organizer(); select * into m from queue_members where id=p_member_id;
 if not owns_queue(m.session_id) then raise exception 'Queue member not found.'; end if;
 if m.status='playing' then raise exception 'Finish the current match before removing this player.'; end if;
 delete from queue_members where id=m.id;
end $$;
create function public.set_queue_rejoin(p_member_id uuid,p_rejoin boolean) returns void language plpgsql security definer set search_path=public as $$
declare u uuid; begin u:=lock_organizer(); update queue_members set rejoin=p_rejoin where id=p_member_id and owns_queue(session_id); if not found then raise exception 'Queue member not found.'; end if; end $$;
create function public.start_queue_match(p_session_id uuid,p_player_ids uuid[],p_court_no int) returns uuid language plpgsql security definer set search_path=public as $$
declare u uuid; s queue_sessions; n int; mid uuid:=gen_random_uuid(); begin
 u:=lock_organizer(); select * into s from queue_sessions where id=p_session_id and organizer_id=u and status='ongoing' for update;
 if not found then raise exception 'Active queue session not found.'; end if;
 n:=case when s.play_type='singles' then 2 else 4 end;
 if cardinality(p_player_ids) is distinct from n or (select count(distinct x) from unnest(p_player_ids) x)<>n then raise exception 'Select exactly % different players.',n; end if;
 if (select count(*) from queue_members where session_id=s.id and player_id=any(p_player_ids) and status='waiting')<>n then raise exception 'Every selected player must be waiting in this queue.'; end if;
 if p_court_no is null or p_court_no<1 or p_court_no>s.court_count then raise exception 'Choose a valid court.'; end if;
 if exists(select 1 from queue_matches where session_id=s.id and court_no=p_court_no and status='playing') then raise exception 'That court is occupied.'; end if;
 if exists(select 1 from unnest(p_player_ids) p where player_busy(p)) then raise exception 'A selected player is already playing another match.'; end if;
 insert into queue_matches(id,session_id,court_no) values(mid,s.id,p_court_no);
 insert into queue_match_players(match_id,player_id,side) select mid,p,case when i<=n/2 then 'a' else 'b' end from unnest(p_player_ids) with ordinality as x(p,i);
 update queue_members set status='playing' where session_id=s.id and player_id=any(p_player_ids);
 return mid;
end $$;
create function public.end_queue_session(p_session_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare u uuid; begin
 u:=lock_organizer(); if not owns_queue(p_session_id) then raise exception 'Queue session not found.'; end if;
 if exists(select 1 from queue_matches where session_id=p_session_id and status='playing') then raise exception 'Finish active matches before ending the session.'; end if;
 delete from queue_members where session_id=p_session_id;
 update queue_sessions set status='completed' where id=p_session_id;
end $$;
create function public.update_queue_session(p_session_id uuid,p_name text) returns void language plpgsql security definer set search_path=public as $$
declare u uuid; begin u:=lock_organizer(); update queue_sessions set name=trim(p_name) where id=p_session_id and organizer_id=u; if not found then raise exception 'Queue session not found.'; end if; end $$;

-- Final scores are validated in PostgreSQL; the browser cannot bypass badminton rules.
create function public.save_match_score(p_match_id uuid,p_kind text,p_games jsonb,p_expected_version int,p_finalize boolean,p_walkover_side text default null) returns void language plpgsql security definer set search_path=public as $$
declare u uuid; tm tournament_matches; qm queue_matches; bo int; g record; ga int:=0; gb int:=0; gw text; winner text; oldwinner text; needed int; k int:=0; ct int; pending boolean:=false; was_completed boolean; nextpos bigint; member queue_members; descendants uuid[]; begin
 u:=lock_organizer();
 if p_finalize is null then raise exception 'Choose whether to save or finalize the result.'; end if;
 if p_kind='tournament' then
  select * into tm from tournament_matches where id=p_match_id for update;
  select best_of into bo from tournaments where id=tm.tournament_id and organizer_id=u;
  if not found then raise exception 'Match not found.'; end if;
  if tm.status not in('playing','completed') then raise exception 'Assign an available court before scoring this match.'; end if;
  if tm.version is distinct from p_expected_version then raise exception 'This score changed on another device. Reload and try again.'; end if;
  was_completed:=tm.status='completed'; oldwinner:=case when tm.winner_entry_id=tm.entry_a_id then 'a' when tm.winner_entry_id=tm.entry_b_id then 'b' end;
 elsif p_kind='queue' then
  select * into qm from queue_matches where id=p_match_id for update;
  select best_of into bo from queue_sessions where id=qm.session_id and organizer_id=u;
  if not found then raise exception 'Match not found.'; end if;
  if qm.version is distinct from p_expected_version then raise exception 'This score changed on another device. Reload and try again.'; end if;
  was_completed:=qm.status='completed'; oldwinner:=qm.winner_side;
 else raise exception 'Unknown match type.'; end if;
 if p_games is null or jsonb_typeof(p_games)<>'array' then raise exception 'Provide an array of game scores.'; end if;
 ct:=jsonb_array_length(p_games); needed:=(bo+1)/2;
 if ct>bo then raise exception 'Too many games for this match format.'; end if;
 if p_walkover_side is not null and p_walkover_side not in('a','b') then raise exception 'Choose the walkover winner.'; end if;
 if p_walkover_side is not null and ct<>0 then raise exception 'A walkover has no game scores. Clear the games before recording it.'; end if;
 if p_walkover_side is not null and not p_finalize then raise exception 'Confirm the walkover to finalize it.'; end if;
 for g in select * from jsonb_to_recordset(p_games) as x(game_no int,score_a int,score_b int) order by game_no loop
  k:=k+1;
  if winner is not null then raise exception 'Remove games after the match was already won.'; end if;
  if pending then raise exception 'Finish the previous game first.'; end if;
  if g.game_no is distinct from k or g.score_a is null or g.score_b is null or g.score_a not between 0 and 30 or g.score_b not between 0 and 30 then raise exception 'Games must be consecutive, with integer scores from 0 to 30.'; end if;
  gw:=null;
  if greatest(g.score_a,g.score_b)=30 then
   if least(g.score_a,g.score_b) not in(28,29) then raise exception 'At 30 points the opposing score must be 28 or 29.'; end if;
   gw:=case when g.score_a>g.score_b then 'a' else 'b' end;
  elsif greatest(g.score_a,g.score_b)>=21 and abs(g.score_a-g.score_b)>=2 then
   if greatest(g.score_a,g.score_b)>21 and abs(g.score_a-g.score_b)<>2 then raise exception 'A game ends as soon as a side wins by two.'; end if;
   gw:=case when g.score_a>g.score_b then 'a' else 'b' end;
  end if;
  if gw='a' then ga:=ga+1; elsif gw='b' then gb:=gb+1; else pending:=true; end if;
  if ga=needed then winner:='a'; elsif gb=needed then winner:='b'; end if;
 end loop;
 if p_walkover_side is not null then winner:=p_walkover_side; end if;
 if p_finalize and winner is null then raise exception 'Enter a winning score before finalizing.'; end if;
 if was_completed and not p_finalize then raise exception 'Completed results must remain finalized.'; end if;
 if p_kind='tournament' and was_completed and winner is distinct from oldwinner then
  with recursive d(id) as (select id from tournament_matches where source_a_match_id=tm.id or source_b_match_id=tm.id union select m.id from tournament_matches m join d on m.source_a_match_id=d.id or m.source_b_match_id=d.id) select array_agg(id) into descendants from d;
  if exists(select 1 from tournament_matches where id=any(descendants) and status in('playing','completed')) then raise exception 'The winner cannot change because a later match has started. Reset the bracket to replay affected results.'; end if;
  update tournament_matches set status='pending',winner_entry_id=null,loser_entry_id=null,entry_a_id=case when source_a_match_id is not null then null else entry_a_id end,entry_b_id=case when source_b_match_id is not null then null else entry_b_id end,completed_at=null,version=version+1 where id=any(descendants);
  update tournaments set status='ongoing',champion_entry_id=null where id=tm.tournament_id;
 end if;
 delete from match_games where (p_kind='tournament' and tournament_match_id=p_match_id) or (p_kind='queue' and queue_match_id=p_match_id);
 insert into match_games(tournament_match_id,queue_match_id,game_no,score_a,score_b)
 select case when p_kind='tournament' then p_match_id end,case when p_kind='queue' then p_match_id end,x.game_no,x.score_a,x.score_b
 from jsonb_to_recordset(p_games) as x(game_no int,score_a int,score_b int);
 if p_kind='tournament' then
  update tournament_matches set version=version+1,walkover=p_walkover_side is not null,status=case when p_finalize then 'completed' else status end,
   winner_entry_id=case when p_finalize then case when winner='a' then entry_a_id else entry_b_id end else winner_entry_id end,
   loser_entry_id=case when p_finalize then case when winner='a' then entry_b_id else entry_a_id end else loser_entry_id end,
   completed_at=case when p_finalize then coalesce(completed_at,now()) else completed_at end where id=tm.id;
  if p_finalize then perform resolve_tournament(tm.tournament_id); end if;
 else
  update queue_matches set version=version+1,walkover=p_walkover_side is not null,status=case when p_finalize then 'completed' else status end,
   winner_side=case when p_finalize then winner else winner_side end,completed_at=case when p_finalize then coalesce(completed_at,now()) else completed_at end where id=qm.id;
  if p_finalize and not was_completed then
   select coalesce(max(position),0) into nextpos from queue_members where session_id=qm.session_id;
   for member in select q.* from queue_members q join queue_match_players mp on mp.player_id=q.player_id and mp.match_id=qm.id where q.session_id=qm.session_id order by q.position loop
    if member.rejoin then nextpos:=nextpos+1; update queue_members set status='waiting',position=nextpos where id=member.id;
    else delete from queue_members where id=member.id; end if;
   end loop;
  end if;
 end if;
end $$;
create function public.delete_player(p_player_id uuid) returns text language plpgsql security definer set search_path=public as $$
declare u uuid; begin
 u:=lock_organizer(); if not exists(select 1 from players where id=p_player_id and organizer_id=u) then raise exception 'Player not found.'; end if;
 if exists(select 1 from tournament_entry_players where player_id=p_player_id) or exists(select 1 from queue_match_players where player_id=p_player_id) or exists(select 1 from queue_members where player_id=p_player_id) then
  update players set archived=true where id=p_player_id; return 'archived';
 else delete from players where id=p_player_id; return 'deleted'; end if;
end $$;

-- No default PUBLIC execute privilege on mutation functions or internal helpers.
revoke execute on function provision_organizer(),owns_tournament(uuid),reads_tournament(uuid),owns_queue(uuid),reads_tournament_match(uuid),owns_queue_match(uuid),lock_organizer(),player_busy(uuid,uuid),resolve_tournament(uuid),register_entry(uuid,text,uuid[]),remove_entry(uuid),seed_entries(uuid,uuid[]),generate_bracket(uuid,jsonb),reset_bracket(uuid),start_tournament(uuid),assign_tournament_court(uuid,int),update_tournament(uuid,jsonb),publish_tournament(uuid,boolean),add_queue_players(uuid,uuid[]),remove_queue_player(uuid),set_queue_rejoin(uuid,boolean),start_queue_match(uuid,uuid[],int),end_queue_session(uuid),update_queue_session(uuid,text),save_match_score(uuid,text,jsonb,int,boolean,text),delete_player(uuid) from public,anon,authenticated;
grant execute on function owns_tournament(uuid),reads_tournament(uuid),owns_queue(uuid),reads_tournament_match(uuid),owns_queue_match(uuid) to anon,authenticated;
grant execute on function register_entry(uuid,text,uuid[]),remove_entry(uuid),seed_entries(uuid,uuid[]),generate_bracket(uuid,jsonb),reset_bracket(uuid),start_tournament(uuid),assign_tournament_court(uuid,int),update_tournament(uuid,jsonb),publish_tournament(uuid,boolean),add_queue_players(uuid,uuid[]),remove_queue_player(uuid),set_queue_rejoin(uuid,boolean),start_queue_match(uuid,uuid[],int),end_queue_session(uuid),update_queue_session(uuid,text),save_match_score(uuid,text,jsonb,int,boolean,text),delete_player(uuid) to authenticated;

-- Private optional media. Only the owner can upload, read or replace it.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('qmaster-media','qmaster-media',false,3145728,array['image/jpeg','image/png','image/webp']) on conflict(id) do nothing;
create policy qmaster_media_read on storage.objects for select to authenticated using(bucket_id='qmaster-media' and (storage.foldername(name))[1]=auth.uid()::text);
create policy qmaster_media_insert on storage.objects for insert to authenticated with check(bucket_id='qmaster-media' and (storage.foldername(name))[1]=auth.uid()::text);
create policy qmaster_media_update on storage.objects for update to authenticated using(bucket_id='qmaster-media' and (storage.foldername(name))[1]=auth.uid()::text) with check(bucket_id='qmaster-media' and (storage.foldername(name))[1]=auth.uid()::text);
create policy qmaster_media_delete on storage.objects for delete to authenticated using(bucket_id='qmaster-media' and (storage.foldername(name))[1]=auth.uid()::text);
-- Reloads use the database as source of truth. Published rows use the same read RLS.
do $$ declare tbl text; begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
  foreach tbl in array array['players','tournaments','tournament_entries','tournament_matches','queue_sessions','queue_members','queue_matches','queue_match_players','match_games'] loop
   if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=tbl) then execute format('alter publication supabase_realtime add table public.%I',tbl); end if;
  end loop;
 end if;
end $$;

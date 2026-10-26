-- Fixed teams, queue-session brackets, and automatic court scheduling.
alter table public.queue_sessions add column mode text not null default 'normal' check(mode in('normal','bracket'));
alter table public.queue_sessions add column bracket_format text not null default 'single_elimination' check(bracket_format in('single_elimination','double_elimination','round_robin'));
alter table public.tournaments add column queue_session_id uuid unique references public.queue_sessions(id) on delete cascade;
create table public.queue_teams (
 id uuid primary key default gen_random_uuid(),session_id uuid not null references public.queue_sessions(id) on delete cascade,
 name text not null check(length(trim(name)) between 1 and 150),position int not null check(position>0),created_at timestamptz not null default now()
);
create table public.queue_team_players (
 id uuid primary key default gen_random_uuid(),session_id uuid not null references public.queue_sessions(id) on delete cascade,
 team_id uuid not null references public.queue_teams(id) on delete cascade,player_id uuid not null references public.players(id),
 unique(session_id,player_id),unique(team_id,player_id)
);
create index queue_teams_session_idx on public.queue_teams(session_id);
create index queue_team_players_team_idx on public.queue_team_players(team_id);
alter table public.queue_teams enable row level security;
alter table public.queue_team_players enable row level security;
create policy queue_teams_owner_read on public.queue_teams for select to authenticated using(owns_queue(session_id));
create policy queue_team_players_owner_read on public.queue_team_players for select to authenticated using(owns_queue(session_id));
revoke all on public.queue_teams,public.queue_team_players from public,anon,authenticated;
grant select on public.queue_teams,public.queue_team_players to authenticated;

create function public.register_queue_team(p_session_id uuid,p_name text,p_player_ids uuid[]) returns uuid
language plpgsql security definer set search_path=public as $$
declare u uuid; s queue_sessions; n int; team uuid:=gen_random_uuid(); missing uuid[];
begin
 u:=lock_organizer(); select * into s from queue_sessions where id=p_session_id and organizer_id=u and status='ongoing' for update;
 if not found then raise exception 'Active session not found.'; end if;
 if exists(select 1 from tournaments where queue_session_id=s.id) then raise exception 'Reset the session bracket before changing teams.'; end if;
 n:=case when s.play_type='singles' then 1 else 2 end;
 if cardinality(p_player_ids) is distinct from n or (select count(distinct x) from unnest(p_player_ids) x)<>n then raise exception 'Choose exactly % distinct players.',n; end if;
 if (select count(*) from players where id=any(p_player_ids) and organizer_id=u and not archived)<>n then raise exception 'Choose active players you own.'; end if;
 if exists(select 1 from queue_team_players where session_id=s.id and player_id=any(p_player_ids)) then raise exception 'A player is already registered on another team in this session.'; end if;
 insert into queue_teams(id,session_id,name,position) values(team,s.id,trim(p_name),(select coalesce(max(position),0)+1 from queue_teams where session_id=s.id));
 insert into queue_team_players(session_id,team_id,player_id) select s.id,team,x from unnest(p_player_ids) x;
 select array_agg(x) into missing from unnest(p_player_ids) x where not exists(select 1 from queue_members where session_id=s.id and player_id=x);
 if cardinality(missing)>0 then perform add_queue_players(s.id,missing); end if;
 return team;
end $$;
create function public.remove_queue_team(p_team_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare u uuid; team queue_teams; ids uuid[];
begin
 u:=lock_organizer(); select q.* into team from queue_teams q join queue_sessions s on s.id=q.session_id where q.id=p_team_id and s.organizer_id=u and s.status='ongoing';
 if not found then raise exception 'Team not found.'; end if;
 if exists(select 1 from tournaments where queue_session_id=team.session_id) then raise exception 'Reset the session bracket before changing teams.'; end if;
 select array_agg(player_id) into ids from queue_team_players where team_id=team.id;
 if exists(select 1 from queue_members where session_id=team.session_id and player_id=any(ids) and status='playing') then raise exception 'Finish this team''s current match first.'; end if;
 delete from queue_teams where id=team.id;
 delete from queue_members where session_id=team.session_id and player_id=any(ids);
end $$;
create function public.seed_queue_teams(p_session_id uuid,p_team_ids uuid[]) returns void language plpgsql security definer set search_path=public as $$
declare u uuid;
begin
 u:=lock_organizer(); if not exists(select 1 from queue_sessions where id=p_session_id and organizer_id=u and status='ongoing') then raise exception 'Session not found.'; end if;
 if exists(select 1 from tournaments where queue_session_id=p_session_id) then raise exception 'Reset the bracket before changing seeds.'; end if;
 if p_team_ids is null or cardinality(p_team_ids)<>(select count(*) from queue_teams where session_id=p_session_id) or cardinality(p_team_ids)<>(select count(distinct x) from unnest(p_team_ids) x) or exists(select 1 from unnest(p_team_ids) x where not exists(select 1 from queue_teams where id=x and session_id=p_session_id)) then raise exception 'Include every registered team exactly once.'; end if;
 update queue_teams q set position=x.i from unnest(p_team_ids) with ordinality x(id,i) where q.id=x.id and q.session_id=p_session_id;
end $$;

-- Existing manual match calls remain available only in normal sessions.
alter function public.start_queue_match(uuid,uuid[],int) rename to start_queue_match_core;
revoke execute on function public.start_queue_match_core(uuid,uuid[],int) from public,anon,authenticated;
create function public.start_queue_match(p_session_id uuid,p_player_ids uuid[],p_court_no int) returns uuid language plpgsql security definer set search_path=public as $$
begin
 if not exists(select 1 from queue_sessions where id=p_session_id and organizer_id=auth.uid() and mode='normal') then raise exception 'Use the generated bracket to start matches in bracket sessions.'; end if;
 return start_queue_match_core(p_session_id,p_player_ids,p_court_no);
end $$;
create function public.start_registered_queue_match(p_team_a_id uuid,p_team_b_id uuid,p_court_no int) returns uuid language plpgsql security definer set search_path=public as $$
declare u uuid; a queue_teams; b queue_teams; ids uuid[];
begin
 u:=lock_organizer(); select q.* into a from queue_teams q join queue_sessions s on s.id=q.session_id where q.id=p_team_a_id and s.organizer_id=u;
 if not found then raise exception 'Team not found.'; end if;
 select * into b from queue_teams where id=p_team_b_id and session_id=a.session_id and id<>a.id;
 if not found then raise exception 'Choose two different teams in the same session.'; end if;
 select array_agg(player_id order by case when team_id=a.id then 0 else 1 end,player_id) into ids from queue_team_players where team_id in(a.id,b.id);
 return start_named_queue_match(a.session_id,ids,p_court_no,a.name,b.name);
end $$;

create function public.auto_fill_session_courts(p_session_id uuid) returns int language plpgsql security definer set search_path=public as $$
declare u uuid; s queue_sessions; t tournaments; court int; m tournament_matches; ids uuid[]; teams uuid[]; n int; started int:=0;
begin
 u:=lock_organizer(); select * into s from queue_sessions where id=p_session_id and organizer_id=u for update;
 if not found then raise exception 'Session not found.'; end if;
 if s.status<>'ongoing' then return 0; end if;
 if s.mode='bracket' then
  select * into t from tournaments where queue_session_id=s.id;
  if not found then raise exception 'Generate the session bracket first.'; end if;
  if t.status='completed' then update queue_sessions set status='completed',updated_at=clock_timestamp() where id=s.id; delete from queue_members where session_id=s.id; return 0; end if;
  for court in 1..s.court_count loop
   if exists(select 1 from tournament_matches where tournament_id=t.id and court_no=court and status='playing') then continue; end if;
   select x.* into m from tournament_matches x where x.tournament_id=t.id and x.status='ready'
    and not exists(select 1 from tournament_entry_players ep where ep.entry_id in(x.entry_a_id,x.entry_b_id) and player_busy(ep.player_id))
    order by x.round_no,x.bracket,x.position limit 1;
   if found then perform assign_tournament_court(m.id,court); started:=started+1; end if;
  end loop;
 else
  n:=case when s.play_type='singles' then 2 else 4 end;
  for court in 1..s.court_count loop
   if exists(select 1 from queue_matches where session_id=s.id and court_no=court and status='playing') then continue; end if;
   if exists(select 1 from queue_teams where session_id=s.id) then
    select array_agg(id) into teams from (select q.id from queue_teams q where q.session_id=s.id
     and (select count(*) from queue_team_players where team_id=q.id)=n/2
     and not exists(select 1 from queue_team_players p where p.team_id=q.id and (player_busy(p.player_id) or not exists(select 1 from queue_members where session_id=s.id and player_id=p.player_id and status='waiting')))
     order by random() limit 2) available;
    if cardinality(teams)=2 then perform start_registered_queue_match(teams[1],teams[2],court); started:=started+1; end if;
   else
    select array_agg(player_id) into ids from (select player_id from queue_members where session_id=s.id and status='waiting' and not player_busy(player_id) order by random() limit n) available;
    if cardinality(ids)=n then perform start_queue_match(s.id,ids,court); started:=started+1; end if;
   end if;
  end loop;
 end if;
 return started;
end $$;

create function public.generate_queue_bracket(p_session_id uuid,p_team_order uuid[],p_matches jsonb) returns uuid language plpgsql security definer set search_path=public as $$
declare u uuid; s queue_sessions; tid uuid:=gen_random_uuid(); team uuid; i int:=0;
begin
 u:=lock_organizer(); select * into s from queue_sessions where id=p_session_id and organizer_id=u and mode='bracket' and status='ongoing' for update;
 if not found then raise exception 'Active bracket session not found.'; end if;
 if exists(select 1 from tournaments where queue_session_id=s.id) then raise exception 'This session already has a bracket. Reset it before regenerating.'; end if;
 if exists(select 1 from queue_matches where session_id=s.id) then raise exception 'A bracket session cannot contain casual queue matches.'; end if;
 perform seed_queue_teams(s.id,p_team_order);
 if cardinality(p_team_order)<2 or cardinality(p_team_order)>64 then raise exception 'Register 2–64 teams or singles entries.'; end if;
 if exists(select 1 from queue_teams q where q.session_id=s.id and (select count(*) from queue_team_players where team_id=q.id)<>case when s.play_type='singles' then 1 else 2 end) then raise exception 'Every team must have the required players.'; end if;
 insert into tournaments(id,organizer_id,name,event_date,play_type,court_count,best_of,scoring_rule,format,published,queue_session_id)
 values(tid,u,s.name,(s.created_at at time zone 'Asia/Singapore')::date,s.play_type,s.court_count,s.best_of,s.scoring_rule,s.bracket_format,s.published,s.id);
 foreach team in array p_team_order loop
  i:=i+1;
  insert into tournament_entries(id,tournament_id,name,seed) select id,tid,name,i from queue_teams where id=team and session_id=s.id;
  insert into tournament_entry_players(tournament_id,entry_id,player_id) select tid,team,player_id from queue_team_players where team_id=team;
 end loop;
 perform generate_bracket(tid,p_matches); perform start_tournament(tid); perform auto_fill_session_courts(s.id);
 return tid;
end $$;
create function public.reset_queue_bracket(p_session_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare u uuid; tid uuid;
begin
 u:=lock_organizer(); if not owns_queue(p_session_id) then raise exception 'Session not found.'; end if;
 select id into tid from tournaments where queue_session_id=p_session_id;
 if tid is null then raise exception 'No session bracket to reset.'; end if;
 if exists(select 1 from tournament_matches where tournament_id=tid and status='playing') then raise exception 'Finish active matches before resetting the bracket.'; end if;
 delete from tournaments where id=tid;
 update queue_sessions set status='ongoing',updated_at=clock_timestamp() where id=p_session_id;
end $$;

-- Progress the bracket first, then schedule ready matches on newly freed courts.
alter function public.save_match_score(uuid,text,jsonb,int,boolean,text) rename to save_match_score_core;
revoke execute on function public.save_match_score_core(uuid,text,jsonb,int,boolean,text) from public,anon,authenticated;
create function public.save_match_score(p_match_id uuid,p_kind text,p_games jsonb,p_expected_version int,p_finalize boolean,p_walkover_side text default null) returns void
language plpgsql security definer set search_path=public as $$
declare sid uuid;
begin
 perform save_match_score_core(p_match_id,p_kind,p_games,p_expected_version,p_finalize,p_walkover_side);
 if p_kind='tournament' then
  select t.queue_session_id into sid from tournament_matches m join tournaments t on t.id=m.tournament_id where m.id=p_match_id;
  if sid is not null then
   update queue_sessions set updated_at=clock_timestamp(),status=case when exists(select 1 from tournaments where queue_session_id=sid and status='ongoing') then 'ongoing' else status end where id=sid;
   if p_finalize then perform auto_fill_session_courts(sid); end if;
  end if;
 end if;
end $$;
create or replace function public.publish_queue_session(p_session_id uuid,p_published boolean) returns void language plpgsql security definer set search_path=public as $$
declare u uuid;
begin
 u:=lock_organizer(); if p_published is null then raise exception 'Choose a sharing status.'; end if;
 update queue_sessions set published=p_published,updated_at=clock_timestamp() where id=p_session_id and organizer_id=u;
 if not found then raise exception 'Session not found.'; end if;
 update tournaments set published=p_published where queue_session_id=p_session_id and organizer_id=u;
end $$;

alter function public.get_public_sessions(uuid) rename to get_public_sessions_base;
revoke execute on function public.get_public_sessions_base(uuid) from public,anon,authenticated;
create function public.get_public_sessions(p_session_id uuid default null) returns jsonb language sql stable security definer set search_path=public as $$
 select coalesce(jsonb_agg(x.event || jsonb_build_object(
  'mode',s.mode,'bracket_format',s.bracket_format,
  'teams',coalesce((select jsonb_agg(jsonb_build_object('id',q.id,'name',q.name,'players',(select jsonb_agg(p.name order by p.name) from queue_team_players qp join players p on p.id=qp.player_id where qp.team_id=q.id)) order by q.position) from queue_teams q where q.session_id=s.id),'[]'::jsonb),
  'bracket',case when t.id is null then null else jsonb_build_object('tournament_id',t.id,'format',t.format,'champion_entry_id',t.champion_entry_id,
    'entries',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'tournament_id',e.tournament_id,'name',e.name,'seed',e.seed)) from tournament_entries e where e.tournament_id=t.id),'[]'::jsonb),
    'matches',coalesce((select jsonb_agg(to_jsonb(m) order by m.round_no,m.position) from tournament_matches m where m.tournament_id=t.id),'[]'::jsonb),
    'games',coalesce((select jsonb_agg(to_jsonb(g)) from match_games g join tournament_matches m on m.id=g.tournament_match_id where m.tournament_id=t.id),'[]'::jsonb)) end,
  'matches',(x.event->'matches') || coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'status',m.status,'court_no',m.court_no,'started_at',m.started_at,'completed_at',m.completed_at,'winner_side',case when m.winner_entry_id=m.entry_a_id then 'a' when m.winner_entry_id=m.entry_b_id then 'b' end,'walkover',m.walkover,'side_a',a.name,'side_b',b.name,
    'games',coalesce((select jsonb_agg(jsonb_build_object('game_no',g.game_no,'score_a',g.score_a,'score_b',g.score_b) order by g.game_no) from match_games g where g.tournament_match_id=m.id),'[]'::jsonb)))
    from tournament_matches m join tournament_entries a on a.id=m.entry_a_id join tournament_entries b on b.id=m.entry_b_id where m.tournament_id=t.id and m.status in('playing','completed')),'[]'::jsonb)
 ) order by s.created_at desc),'[]'::jsonb)
 from jsonb_array_elements(get_public_sessions_base(p_session_id)) x(event)
 join queue_sessions s on s.id=(x.event->>'id')::uuid
 left join tournaments t on t.queue_session_id=s.id and t.published
$$;

create trigger queue_team_public_update after insert or update or delete on public.queue_teams for each row execute function public.touch_queue_session();
do $$ begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
  alter publication supabase_realtime add table public.queue_teams;
 end if;
end $$;
revoke execute on function register_queue_team(uuid,text,uuid[]),remove_queue_team(uuid),seed_queue_teams(uuid,uuid[]),start_queue_match(uuid,uuid[],int),start_registered_queue_match(uuid,uuid,int),auto_fill_session_courts(uuid),generate_queue_bracket(uuid,uuid[],jsonb),reset_queue_bracket(uuid),save_match_score(uuid,text,jsonb,int,boolean,text),get_public_sessions(uuid) from public,anon,authenticated;
grant execute on function register_queue_team(uuid,text,uuid[]),remove_queue_team(uuid),seed_queue_teams(uuid,uuid[]),start_queue_match(uuid,uuid[],int),start_registered_queue_match(uuid,uuid,int),auto_fill_session_courts(uuid),generate_queue_bracket(uuid,uuid[],jsonb),reset_queue_bracket(uuid),save_match_score(uuid,text,jsonb,int,boolean,text) to authenticated;
grant execute on function get_public_sessions(uuid) to anon,authenticated;

create or replace function public.purge_player(p_player_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare u uuid; begin
 u:=lock_organizer(); if not exists(select 1 from players where id=p_player_id and organizer_id=u) then raise exception 'Player not found.'; end if;
 if exists(select 1 from tournament_entry_players where player_id=p_player_id) or exists(select 1 from queue_match_players where player_id=p_player_id) or exists(select 1 from queue_team_players where player_id=p_player_id) or exists(select 1 from queue_members where player_id=p_player_id and status='playing') then
  raise exception 'Delete this player''s tournaments and queue sessions first, or use Clear all test data in Settings. You can also archive the player to keep history.';
 end if;
 delete from queue_members where player_id=p_player_id; delete from players where id=p_player_id and organizer_id=u;
end $$;
alter function public.end_queue_session(uuid) rename to end_queue_session_core;
revoke execute on function public.end_queue_session_core(uuid) from public,anon,authenticated;
create function public.end_queue_session(p_session_id uuid) returns void language plpgsql security definer set search_path=public as $$
begin
 perform lock_organizer();
 if not owns_queue(p_session_id) then raise exception 'Session not found.'; end if;
 if exists(select 1 from tournaments where queue_session_id=p_session_id and status<>'completed') then raise exception 'Finish the session bracket before ending it, or delete the session to cancel it.'; end if;
 perform end_queue_session_core(p_session_id);
end $$;
revoke execute on function end_queue_session(uuid) from public,anon,authenticated;
grant execute on function end_queue_session(uuid) to authenticated;

create or replace view public.player_match_records as
select ep.player_id,m.id as match_id,coalesce(t.queue_session_id,t.id) as event_id,t.name as event_name,case when t.queue_session_id is null then 'tournament' else 'queue' end::text as kind,t.play_type,t.published,
 m.completed_at,m.court_no,m.walkover,a.name as side_a,b.name as side_b,
 case when ep.entry_id=m.entry_a_id then 'a' else 'b' end as player_side,
 case when m.winner_entry_id=m.entry_a_id then 'a' else 'b' end as winner_side,
 coalesce((select jsonb_agg(p.name order by p.name,p.id) from tournament_entry_players x join players p on p.id=x.player_id where x.entry_id=m.entry_a_id),'[]'::jsonb) as players_a,
 coalesce((select jsonb_agg(p.name order by p.name,p.id) from tournament_entry_players x join players p on p.id=x.player_id where x.entry_id=m.entry_b_id),'[]'::jsonb) as players_b,
 coalesce((select jsonb_agg(jsonb_build_object('game_no',g.game_no,'score_a',g.score_a,'score_b',g.score_b) order by g.game_no) from match_games g where g.tournament_match_id=m.id),'[]'::jsonb) as games
from tournament_matches m join tournaments t on t.id=m.tournament_id
join tournament_entries a on a.id=m.entry_a_id join tournament_entries b on b.id=m.entry_b_id
join tournament_entry_players ep on ep.entry_id in(m.entry_a_id,m.entry_b_id)
where m.status='completed' and m.winner_entry_id is not null
union all
select mp.player_id,m.id,s.id,s.name,'queue'::text,s.play_type,s.published,m.completed_at,m.court_no,m.walkover,
 coalesce(m.team_a_name,(select string_agg(p.name,' / ' order by p.name,p.id) from queue_match_players x join players p on p.id=x.player_id where x.match_id=m.id and x.side='a'),'TBD'),
 coalesce(m.team_b_name,(select string_agg(p.name,' / ' order by p.name,p.id) from queue_match_players x join players p on p.id=x.player_id where x.match_id=m.id and x.side='b'),'TBD'),
 mp.side,m.winner_side,
 coalesce((select jsonb_agg(p.name order by p.name,p.id) from queue_match_players x join players p on p.id=x.player_id where x.match_id=m.id and x.side='a'),'[]'::jsonb),
 coalesce((select jsonb_agg(p.name order by p.name,p.id) from queue_match_players x join players p on p.id=x.player_id where x.match_id=m.id and x.side='b'),'[]'::jsonb),
 coalesce((select jsonb_agg(jsonb_build_object('game_no',g.game_no,'score_a',g.score_a,'score_b',g.score_b) order by g.game_no) from match_games g where g.queue_match_id=m.id),'[]'::jsonb)
from queue_matches m join queue_sessions s on s.id=m.session_id join queue_match_players mp on mp.match_id=m.id
where m.status='completed' and m.winner_side is not null;
revoke all on public.player_match_records from public,anon,authenticated;


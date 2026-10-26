-- Mixed doubles, named queue teams, and safe public player records.
alter table public.tournaments drop constraint tournaments_play_type_check;
alter table public.tournaments add constraint tournaments_play_type_check check(play_type in('singles','doubles','mixed'));
alter table public.queue_sessions drop constraint queue_sessions_play_type_check;
alter table public.queue_sessions add constraint queue_sessions_play_type_check check(play_type in('singles','doubles','mixed'));
alter table public.queue_matches add column team_a_name text check(team_a_name is null or length(trim(team_a_name)) between 1 and 150);
alter table public.queue_matches add column team_b_name text check(team_b_name is null or length(trim(team_b_name)) between 1 and 150);

create function public.start_named_queue_match(p_session_id uuid,p_player_ids uuid[],p_court_no int,p_team_a_name text default null,p_team_b_name text default null) returns uuid
language plpgsql security definer set search_path=public as $$
declare mid uuid; u uuid;
begin
  u:=lock_organizer();
  mid:=start_queue_match(p_session_id,p_player_ids,p_court_no);
  if exists(select 1 from queue_sessions where id=p_session_id and play_type='singles')
     and (nullif(trim(p_team_a_name),'') is not null or nullif(trim(p_team_b_name),'') is not null) then
    raise exception 'Team names are available for doubles and mixed doubles.';
  end if;
  update queue_matches set team_a_name=nullif(trim(p_team_a_name),''),team_b_name=nullif(trim(p_team_b_name),'') where id=mid;
  return mid;
end $$;

create function public.rename_queue_teams(p_match_id uuid,p_team_a_name text,p_team_b_name text) returns void
language plpgsql security definer set search_path=public as $$
declare u uuid;
begin
  u:=lock_organizer();
  if not exists(select 1 from queue_matches m join queue_sessions s on s.id=m.session_id where m.id=p_match_id and s.organizer_id=u and s.play_type<>'singles') then
    raise exception 'Doubles or mixed match not found.';
  end if;
  update queue_matches set team_a_name=nullif(trim(p_team_a_name),''),team_b_name=nullif(trim(p_team_b_name),'') where id=p_match_id;
end $$;

create function public.rename_tournament_team(p_entry_id uuid,p_name text) returns void
language plpgsql security definer set search_path=public as $$
declare u uuid;
begin
  u:=lock_organizer();
  if not exists(select 1 from tournament_entries e join tournaments t on t.id=e.tournament_id where e.id=p_entry_id and t.organizer_id=u and t.play_type<>'singles') then
    raise exception 'Tournament team not found.';
  end if;
  update tournament_entries set name=trim(p_name) where id=p_entry_id;
end $$;

create or replace function public.get_public_sessions(p_session_id uuid default null) returns jsonb
language sql stable security definer set search_path=public as $$
 select coalesce(jsonb_agg(event order by created_at desc),'[]'::jsonb)
 from (
  select s.created_at,jsonb_build_object(
   'id',s.id,'name',s.name,'play_type',s.play_type,'court_count',s.court_count,
   'best_of',s.best_of,'status',s.status,'created_at',s.created_at,
   'waiting',coalesce((select jsonb_agg(jsonb_build_object('name',p.name,'position',q.position) order by q.position)
     from queue_members q join players p on p.id=q.player_id where q.session_id=s.id and q.status='waiting'),'[]'::jsonb),
   'matches',coalesce((select jsonb_agg(jsonb_build_object(
     'id',m.id,'status',m.status,'court_no',m.court_no,'started_at',m.started_at,
     'completed_at',m.completed_at,'winner_side',m.winner_side,'walkover',m.walkover,
     'side_a',coalesce(m.team_a_name,(select string_agg(p.name,' / ' order by p.name,p.id) from queue_match_players mp join players p on p.id=mp.player_id where mp.match_id=m.id and mp.side='a'),'TBD'),
     'side_b',coalesce(m.team_b_name,(select string_agg(p.name,' / ' order by p.name,p.id) from queue_match_players mp join players p on p.id=mp.player_id where mp.match_id=m.id and mp.side='b'),'TBD'),
     'players_a',coalesce((select jsonb_agg(p.name order by p.name,p.id) from queue_match_players mp join players p on p.id=mp.player_id where mp.match_id=m.id and mp.side='a'),'[]'::jsonb),
     'players_b',coalesce((select jsonb_agg(p.name order by p.name,p.id) from queue_match_players mp join players p on p.id=mp.player_id where mp.match_id=m.id and mp.side='b'),'[]'::jsonb),
     'games',coalesce((select jsonb_agg(jsonb_build_object('game_no',g.game_no,'score_a',g.score_a,'score_b',g.score_b) order by g.game_no) from match_games g where g.queue_match_id=m.id),'[]'::jsonb)
    ) order by m.started_at desc,m.id) from queue_matches m where m.session_id=s.id),'[]'::jsonb)
  ) as event from queue_sessions s where s.published and (p_session_id is null or s.id=p_session_id)
 ) events
$$;

-- Private internal view: one finalized match result per participating player.
-- Public RPCs below explicitly filter published events. Never grant this view.
create view public.player_match_records as
select ep.player_id,m.id as match_id,t.id as event_id,t.name as event_name,'tournament'::text as kind,t.play_type,t.published,
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

create function public.get_public_players(p_player_id uuid default null) returns jsonb
language sql stable security definer set search_path=public as $$
 select coalesce(jsonb_agg(profile order by name,id),'[]'::jsonb) from (
   select p.id,p.name,jsonb_build_object(
     'id',p.id,'name',p.name,'archived',p.archived,
     'wins',(select count(*) from player_match_records r where r.player_id=p.id and r.published and r.player_side=r.winner_side),
     'losses',(select count(*) from player_match_records r where r.player_id=p.id and r.published and r.player_side<>r.winner_side),
     'matches',case when p_player_id is null then '[]'::jsonb else coalesce((
       select jsonb_agg(jsonb_build_object('id',r.match_id,'event_id',r.event_id,'event_name',r.event_name,'kind',r.kind,
         'play_type',r.play_type,'completed_at',r.completed_at,'court_no',r.court_no,'walkover',r.walkover,
         'side_a',r.side_a,'side_b',r.side_b,'players_a',r.players_a,'players_b',r.players_b,
         'result',case when r.player_side=r.winner_side then 'win' else 'loss' end,'games',r.games
       ) order by r.completed_at desc,r.match_id) from player_match_records r where r.player_id=p.id and r.published
     ),'[]'::jsonb) end
   ) as profile from players p where p_player_id is null or p.id=p_player_id
 ) profiles
$$;

revoke execute on function start_named_queue_match(uuid,uuid[],int,text,text),rename_queue_teams(uuid,text,text),rename_tournament_team(uuid,text),get_public_players(uuid) from public,anon,authenticated;
grant execute on function start_named_queue_match(uuid,uuid[],int,text,text),rename_queue_teams(uuid,text,text),rename_tournament_team(uuid,text) to authenticated;
grant execute on function get_public_players(uuid) to anon,authenticated;

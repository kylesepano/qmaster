-- Shared player pool, separate sports and selectable pickleball 11-point rules.
-- Existing events remain badminton with their original scoring and results.
alter table public.tournaments add column sport text not null default 'badminton' check(sport in('badminton','pickleball'));
alter table public.queue_sessions add column sport text not null default 'badminton' check(sport in('badminton','pickleball'));
alter table public.tournaments drop constraint tournaments_scoring_rule_check;
alter table public.queue_sessions drop constraint queue_sessions_scoring_rule_check;
alter table public.tournaments add constraint tournaments_sport_scoring_check check(
 (sport='badminton' and scoring_rule in('standard_21','lenient_31')) or
 (sport='pickleball' and scoring_rule in('pickleball_11_sudden_death','pickleball_11_deuce')));
alter table public.queue_sessions add constraint queue_sessions_sport_scoring_check check(
 (sport='badminton' and scoring_rule in('standard_21','lenient_31')) or
 (sport='pickleball' and scoring_rule in('pickleball_11_sudden_death','pickleball_11_deuce')));
-- Win-by-two pickleball has no sports-rule cap; integer storage remains nonnegative.
alter table public.match_games drop constraint match_games_score_a_check;
alter table public.match_games drop constraint match_games_score_b_check;
alter table public.match_games add constraint match_games_score_a_check check(score_a >= 0);
alter table public.match_games add constraint match_games_score_b_check check(score_b >= 0);

-- Stop sport/scoring changes from reclassifying registered teams or historical results.
create function public.guard_event_rules() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.sport is distinct from old.sport or new.scoring_rule is distinct from old.scoring_rule then
  perform lock_organizer();
  if tg_table_name='tournaments' then
   if old.status<>'draft' or exists(select 1 from tournament_entries where tournament_id=old.id) or exists(select 1 from tournament_matches where tournament_id=old.id) then
    raise exception 'Sport and scoring can only change before registering entries.';
   end if;
  else
   if old.status<>'ongoing' or exists(select 1 from queue_matches where session_id=old.id) or exists(select 1 from queue_teams where session_id=old.id) or exists(select 1 from queue_members where session_id=old.id) or exists(select 1 from tournaments where queue_session_id=old.id) then
    raise exception 'Sport and scoring can only change before registering session players or teams.';
   end if;
  end if;
 end if;
 return new;
end $$;
revoke execute on function public.guard_event_rules() from public,anon,authenticated;
create trigger tournaments_guard_sport before update of sport,scoring_rule on public.tournaments for each row execute function public.guard_event_rules();
create trigger queue_sessions_guard_sport before update of sport,scoring_rule on public.queue_sessions for each row execute function public.guard_event_rules();

create or replace function public.save_match_score_core(p_match_id uuid,p_kind text,p_games jsonb,p_expected_version int,p_finalize boolean,p_walkover_side text default null) returns void language plpgsql security definer set search_path=public as $$
declare u uuid; tm tournament_matches; qm queue_matches; bo int; scoring text; max_score int; g record; ga int:=0; gb int:=0; gw text; winner text; oldwinner text; needed int; k int:=0; ct int; pending boolean:=false; was_completed boolean; nextpos bigint; member queue_members; descendants uuid[]; begin
 u:=lock_organizer();
 if p_finalize is null then raise exception 'Choose whether to save or finalize the result.'; end if;
 if p_kind='tournament' then
  select * into tm from tournament_matches where id=p_match_id for update;
  select best_of,scoring_rule into bo,scoring from tournaments where id=tm.tournament_id and organizer_id=u;
  if not found then raise exception 'Match not found.'; end if;
  if tm.status not in('playing','completed') then raise exception 'Assign an available court before scoring this match.'; end if;
  if tm.version is distinct from p_expected_version then raise exception 'This score changed on another device. Reload and try again.'; end if;
  was_completed:=tm.status='completed'; oldwinner:=case when tm.winner_entry_id=tm.entry_a_id then 'a' when tm.winner_entry_id=tm.entry_b_id then 'b' end;
 elsif p_kind='queue' then
  select * into qm from queue_matches where id=p_match_id for update;
  select best_of,scoring_rule into bo,scoring from queue_sessions where id=qm.session_id and organizer_id=u;
  if not found then raise exception 'Match not found.'; end if;
  if qm.version is distinct from p_expected_version then raise exception 'This score changed on another device. Reload and try again.'; end if;
  was_completed:=qm.status='completed'; oldwinner:=qm.winner_side;
 else raise exception 'Unknown match type.'; end if;
 if p_games is null or jsonb_typeof(p_games)<>'array' then raise exception 'Provide an array of game scores.'; end if;
 ct:=jsonb_array_length(p_games); needed:=(bo+1)/2; max_score:=case when scoring='lenient_31' then 31 when scoring='pickleball_11_sudden_death' then 11 when scoring='pickleball_11_deuce' then 2147483647 else 30 end;
 if ct>bo then raise exception 'Too many games for this match format.'; end if;
 if p_walkover_side is not null and p_walkover_side not in('a','b') then raise exception 'Choose the walkover winner.'; end if;
 if p_walkover_side is not null and ct<>0 then raise exception 'A walkover has no game scores. Clear the games before recording it.'; end if;
 if p_walkover_side is not null and not p_finalize then raise exception 'Confirm the walkover to finalize it.'; end if;
 for g in select * from jsonb_to_recordset(p_games) as x(game_no int,score_a int,score_b int) order by game_no loop
  k:=k+1;
  if winner is not null then raise exception 'Remove games after the match was already won.'; end if;
  if pending then raise exception 'Finish the previous game first.'; end if;
  if g.game_no is distinct from k or g.score_a is null or g.score_b is null or g.score_a not between 0 and max_score or g.score_b not between 0 and max_score then raise exception 'Games must be consecutive, with integer scores from 0 to %.',max_score; end if;
  gw:=null;
  if scoring='pickleball_11_sudden_death' then
   if g.score_a=11 and g.score_b=11 then raise exception 'The first side to 11 wins; both sides cannot finish at 11.'; end if;
   if greatest(g.score_a,g.score_b)=11 then gw:=case when g.score_a>g.score_b then 'a' else 'b' end; end if;
  elsif scoring='pickleball_11_deuce' then
   if greatest(g.score_a,g.score_b)>11 and (least(g.score_a,g.score_b)<10 or abs(g.score_a-g.score_b)>2) then
    raise exception 'A pickleball game ends as soon as a side reaches 11 with a two-point lead.';
   end if;
   if greatest(g.score_a,g.score_b)>=11 and abs(g.score_a-g.score_b)>=2 then gw:=case when g.score_a>g.score_b then 'a' else 'b' end; end if;
  elsif scoring='lenient_31' then
   if g.score_a=31 and g.score_b=31 then raise exception 'The first side to 31 wins; both sides cannot finish at 31.'; end if;
   if greatest(g.score_a,g.score_b)=31 then gw:=case when g.score_a>g.score_b then 'a' else 'b' end; end if;
  elsif greatest(g.score_a,g.score_b)=30 then
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

create or replace function public.update_tournament(p_tournament_id uuid,p_details jsonb) returns void language plpgsql security definer set search_path=public as $$
declare u uuid; t tournaments; begin
 u:=lock_organizer(); select * into t from tournaments where id=p_tournament_id and organizer_id=u for update;
 if not found then raise exception 'Tournament not found.'; end if;
 if (p_details ? 'sport' and p_details->>'sport' is distinct from t.sport) or (p_details ? 'scoring_rule' and p_details->>'scoring_rule' is distinct from t.scoring_rule) or (p_details ? 'play_type' and p_details->>'play_type'<>t.play_type) or (p_details ? 'format' and p_details->>'format'<>t.format) or (p_details ? 'best_of' and (p_details->>'best_of')::int<>t.best_of) then
  if t.status<>'draft' or exists(select 1 from tournament_matches where tournament_id=t.id) or exists(select 1 from tournament_entries where tournament_id=t.id) then raise exception 'Format can only change before registering entries.'; end if;
 end if;
 if p_details ? 'court_count' and exists(select 1 from tournament_matches where tournament_id=t.id and status='playing' and court_no>(p_details->>'court_count')::int) then raise exception 'Cannot remove an occupied court.'; end if;
 update tournaments set name=coalesce(p_details->>'name',name),description=case when p_details ? 'description' then p_details->>'description' else description end,
 event_date=coalesce((p_details->>'event_date')::date,event_date),venue=case when p_details ? 'venue' then p_details->>'venue' else venue end,
 sport=coalesce(p_details->>'sport',sport),play_type=coalesce(p_details->>'play_type',play_type),format=coalesce(p_details->>'format',format),best_of=coalesce((p_details->>'best_of')::int,best_of),scoring_rule=coalesce(p_details->>'scoring_rule',scoring_rule),
 court_count=coalesce((p_details->>'court_count')::int,court_count),banner_path=case when p_details ? 'banner_path' then p_details->>'banner_path' else banner_path end where id=t.id;
end $$;

create or replace function public.generate_queue_bracket(p_session_id uuid,p_team_order uuid[],p_matches jsonb) returns uuid language plpgsql security definer set search_path=public as $$
declare u uuid; s queue_sessions; tid uuid:=gen_random_uuid(); team uuid; i int:=0;
begin
 u:=lock_organizer(); select * into s from queue_sessions where id=p_session_id and organizer_id=u and mode='bracket' and status='ongoing' for update;
 if not found then raise exception 'Active bracket session not found.'; end if;
 if exists(select 1 from tournaments where queue_session_id=s.id) then raise exception 'This session already has a bracket. Reset it before regenerating.'; end if;
 if exists(select 1 from queue_matches where session_id=s.id) then raise exception 'A bracket session cannot contain casual queue matches.'; end if;
 perform seed_queue_teams(s.id,p_team_order);
 if cardinality(p_team_order)<2 or cardinality(p_team_order)>64 then raise exception 'Register 2–64 teams or singles entries.'; end if;
 if exists(select 1 from queue_teams q where q.session_id=s.id and (select count(*) from queue_team_players where team_id=q.id)<>case when s.play_type='singles' then 1 else 2 end) then raise exception 'Every team must have the required players.'; end if;
 insert into tournaments(id,organizer_id,name,event_date,play_type,court_count,best_of,scoring_rule,sport,format,published,queue_session_id)
 values(tid,u,s.name,(s.created_at at time zone 'Asia/Singapore')::date,s.play_type,s.court_count,s.best_of,s.scoring_rule,s.sport,s.bracket_format,s.published,s.id);
 foreach team in array p_team_order loop
  i:=i+1;
  insert into tournament_entries(id,tournament_id,name,seed) select id,tid,name,i from queue_teams where id=team and session_id=s.id;
  insert into tournament_entry_players(tournament_id,entry_id,player_id) select tid,team,player_id from queue_team_players where team_id=team;
 end loop;
 perform generate_bracket(tid,p_matches); perform start_tournament(tid); perform auto_fill_session_courts(s.id);
 return tid;
end $$;
create or replace function public.get_public_sessions(p_session_id uuid default null) returns jsonb language sql stable security definer set search_path=public as $$
 select coalesce(jsonb_agg(x.event || jsonb_build_object(
  'sport',s.sport,'mode',s.mode,'bracket_format',s.bracket_format,
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

create or replace view public.player_match_records as
select ep.player_id,m.id as match_id,coalesce(t.queue_session_id,t.id) as event_id,t.name as event_name,case when t.queue_session_id is null then 'tournament' else 'queue' end::text as kind,t.play_type,t.published,
 m.completed_at,m.court_no,m.walkover,a.name as side_a,b.name as side_b,
 case when ep.entry_id=m.entry_a_id then 'a' else 'b' end as player_side,
 case when m.winner_entry_id=m.entry_a_id then 'a' else 'b' end as winner_side,
 coalesce((select jsonb_agg(p.name order by p.name,p.id) from tournament_entry_players x join players p on p.id=x.player_id where x.entry_id=m.entry_a_id),'[]'::jsonb) as players_a,
 coalesce((select jsonb_agg(p.name order by p.name,p.id) from tournament_entry_players x join players p on p.id=x.player_id where x.entry_id=m.entry_b_id),'[]'::jsonb) as players_b,
 coalesce((select jsonb_agg(jsonb_build_object('game_no',g.game_no,'score_a',g.score_a,'score_b',g.score_b) order by g.game_no) from match_games g where g.tournament_match_id=m.id),'[]'::jsonb) as games,t.sport
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
 coalesce((select jsonb_agg(jsonb_build_object('game_no',g.game_no,'score_a',g.score_a,'score_b',g.score_b) order by g.game_no) from match_games g where g.queue_match_id=m.id),'[]'::jsonb),s.sport
from queue_matches m join queue_sessions s on s.id=m.session_id join queue_match_players mp on mp.match_id=m.id
where m.status='completed' and m.winner_side is not null;
revoke all on public.player_match_records from public,anon,authenticated;


drop function public.get_public_players(uuid);
create function public.get_public_players(p_player_id uuid default null,p_sport text default 'badminton') returns jsonb
language sql stable security definer set search_path=public as $$
 select coalesce(jsonb_agg(profile order by name,id),'[]'::jsonb) from (
   select p.id,p.name,jsonb_build_object(
     'id',p.id,'name',p.name,'archived',p.archived,'sport',p_sport,
     'wins',(select count(*) from player_match_records r where r.player_id=p.id and r.published and r.sport=p_sport and r.player_side=r.winner_side),
     'losses',(select count(*) from player_match_records r where r.player_id=p.id and r.published and r.sport=p_sport and r.player_side<>r.winner_side),
     'matches',case when p_player_id is null then '[]'::jsonb else coalesce((
       select jsonb_agg(jsonb_build_object('id',r.match_id,'event_id',r.event_id,'event_name',r.event_name,'kind',r.kind,
         'sport',r.sport,'play_type',r.play_type,'completed_at',r.completed_at,'court_no',r.court_no,'walkover',r.walkover,
         'side_a',r.side_a,'side_b',r.side_b,'players_a',r.players_a,'players_b',r.players_b,
         'result',case when r.player_side=r.winner_side then 'win' else 'loss' end,'games',r.games
       ) order by r.completed_at desc,r.match_id) from player_match_records r where r.player_id=p.id and r.published and r.sport=p_sport
     ),'[]'::jsonb) end
   ) as profile from players p where p_sport in('badminton','pickleball') and (p_player_id is null or p.id=p_player_id)
 ) profiles
$$;

revoke execute on function public.get_public_players(uuid,text) from public,anon,authenticated;
grant execute on function public.get_public_players(uuid,text) to anon,authenticated;

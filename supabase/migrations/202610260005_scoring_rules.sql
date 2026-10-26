-- Existing events retain standard scoring; new events may opt into first-to-31.
alter table public.tournaments add column scoring_rule text not null default 'standard_21' check(scoring_rule in('standard_21','lenient_31'));
alter table public.queue_sessions add column scoring_rule text not null default 'standard_21' check(scoring_rule in('standard_21','lenient_31'));
alter table public.match_games drop constraint match_games_score_a_check;
alter table public.match_games drop constraint match_games_score_b_check;
alter table public.match_games add constraint match_games_score_a_check check(score_a between 0 and 31);
alter table public.match_games add constraint match_games_score_b_check check(score_b between 0 and 31);
-- The authenticated scoring RPC below enforces the selected event's rule.

create or replace function public.save_match_score(p_match_id uuid,p_kind text,p_games jsonb,p_expected_version int,p_finalize boolean,p_walkover_side text default null) returns void language plpgsql security definer set search_path=public as $$
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
 ct:=jsonb_array_length(p_games); needed:=(bo+1)/2; max_score:=case when scoring='lenient_31' then 31 else 30 end;
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
  if scoring='lenient_31' then
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
 if (p_details ? 'scoring_rule' and p_details->>'scoring_rule' is distinct from t.scoring_rule) or (p_details ? 'play_type' and p_details->>'play_type'<>t.play_type) or (p_details ? 'format' and p_details->>'format'<>t.format) or (p_details ? 'best_of' and (p_details->>'best_of')::int<>t.best_of) then
  if t.status<>'draft' or exists(select 1 from tournament_matches where tournament_id=t.id) or exists(select 1 from tournament_entries where tournament_id=t.id) then raise exception 'Format can only change before registering entries.'; end if;
 end if;
 if p_details ? 'court_count' and exists(select 1 from tournament_matches where tournament_id=t.id and status='playing' and court_no>(p_details->>'court_count')::int) then raise exception 'Cannot remove an occupied court.'; end if;
 update tournaments set name=coalesce(p_details->>'name',name),description=case when p_details ? 'description' then p_details->>'description' else description end,
 event_date=coalesce((p_details->>'event_date')::date,event_date),venue=case when p_details ? 'venue' then p_details->>'venue' else venue end,
 play_type=coalesce(p_details->>'play_type',play_type),format=coalesce(p_details->>'format',format),best_of=coalesce((p_details->>'best_of')::int,best_of),scoring_rule=coalesce(p_details->>'scoring_rule',scoring_rule),
 court_count=coalesce((p_details->>'court_count')::int,court_count),banner_path=case when p_details ? 'banner_path' then p_details->>'banner_path' else banner_path end where id=t.id;
end $$;

create or replace function public.get_public_sessions(p_session_id uuid default null) returns jsonb
language sql stable security definer set search_path=public as $$
 select coalesce(jsonb_agg(event order by created_at desc),'[]'::jsonb)
 from (
  select s.created_at,jsonb_build_object(
   'id',s.id,'name',s.name,'play_type',s.play_type,'court_count',s.court_count,
   'best_of',s.best_of,'scoring_rule',s.scoring_rule,'status',s.status,'created_at',s.created_at,
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


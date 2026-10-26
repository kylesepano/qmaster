-- Event schedules are dates/times in the club timezone UTC+8 (Singapore / Manila).
-- Leave legacy session schedules and tournament start times unknown, rather than inventing them.
alter table public.tournaments add column start_time time check(start_time < time '24:00');
alter table public.queue_sessions add column event_date date;
alter table public.queue_sessions add column start_time time check(start_time < time '24:00');
alter table public.queue_sessions add constraint queue_session_schedule_check check(start_time is null or event_date is not null);

create function public.set_queue_schedule(p_session_id uuid,p_date date,p_time time) returns void language plpgsql security definer set search_path=public as $$
begin
 perform lock_organizer();
 if p_date is null or p_time is null or p_time>=time '24:00' then raise exception 'Enter an event date and a valid start time.'; end if;
 update queue_sessions set event_date=p_date,start_time=p_time,updated_at=clock_timestamp() where id=p_session_id and organizer_id=auth.uid();
 if not found then raise exception 'Session not found.'; end if;
 update tournaments set event_date=p_date,start_time=p_time where queue_session_id=p_session_id and organizer_id=auth.uid();
end $$;
revoke execute on function public.set_queue_schedule(uuid,date,time) from public,anon,authenticated;
grant execute on function public.set_queue_schedule(uuid,date,time) to authenticated;

create or replace function public.update_tournament(p_tournament_id uuid,p_details jsonb) returns void language plpgsql security definer set search_path=public as $$
declare u uuid; t tournaments; begin
 u:=lock_organizer(); select * into t from tournaments where id=p_tournament_id and organizer_id=u for update;
 if not found then raise exception 'Tournament not found.'; end if;
 if (p_details ? 'sport' and p_details->>'sport' is distinct from t.sport) or (p_details ? 'scoring_rule' and p_details->>'scoring_rule' is distinct from t.scoring_rule) or (p_details ? 'play_type' and p_details->>'play_type'<>t.play_type) or (p_details ? 'format' and p_details->>'format'<>t.format) or (p_details ? 'best_of' and (p_details->>'best_of')::int<>t.best_of) then
  if t.status<>'draft' or exists(select 1 from tournament_matches where tournament_id=t.id) or exists(select 1 from tournament_entries where tournament_id=t.id) then raise exception 'Format can only change before registering entries.'; end if;
 end if;
 if p_details ? 'court_count' and exists(select 1 from tournament_matches where tournament_id=t.id and status='playing' and court_no>(p_details->>'court_count')::int) then raise exception 'Cannot remove an occupied court.'; end if;
 update tournaments set name=coalesce(p_details->>'name',name),description=case when p_details ? 'description' then p_details->>'description' else description end,
 event_date=coalesce((p_details->>'event_date')::date,event_date),start_time=case when p_details ? 'start_time' then (p_details->>'start_time')::time else start_time end,venue=case when p_details ? 'venue' then p_details->>'venue' else venue end,
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
 insert into tournaments(id,organizer_id,name,event_date,start_time,play_type,court_count,best_of,scoring_rule,sport,format,published,queue_session_id)
 values(tid,u,s.name,coalesce(s.event_date,(s.created_at at time zone 'Asia/Singapore')::date),s.start_time,s.play_type,s.court_count,s.best_of,s.scoring_rule,s.sport,s.bracket_format,s.published,s.id);
 foreach team in array p_team_order loop
  i:=i+1;
  insert into tournament_entries(id,tournament_id,name,seed) select id,tid,name,i from queue_teams where id=team and session_id=s.id;
  insert into tournament_entry_players(tournament_id,entry_id,player_id) select tid,team,player_id from queue_team_players where team_id=team;
 end loop;
 perform generate_bracket(tid,p_matches); perform start_tournament(tid); perform auto_fill_session_courts(s.id);
 return tid;
end $$;

alter function public.get_public_sessions(uuid) rename to get_public_sessions_with_sport;
revoke execute on function public.get_public_sessions_with_sport(uuid) from public,anon,authenticated;
create function public.get_public_sessions(p_session_id uuid default null) returns jsonb language sql stable security definer set search_path=public as $$
 select coalesce(jsonb_agg(x.event || jsonb_build_object('event_date',s.event_date,'start_time',s.start_time) order by s.created_at desc),'[]'::jsonb)
 from jsonb_array_elements(get_public_sessions_with_sport(p_session_id)) x(event)
 join queue_sessions s on s.id=(x.event->>'id')::uuid and s.published
$$;
revoke execute on function public.get_public_sessions(uuid) from public,anon,authenticated;
grant execute on function public.get_public_sessions(uuid) to anon,authenticated;

-- Public event directory and safe spectator views of explicitly published queues.
alter table public.queue_sessions add column published boolean not null default false;
alter table public.queue_sessions add column updated_at timestamptz not null default now();
create policy queue_sessions_public_read on public.queue_sessions for select to anon,authenticated using(published);
grant select on public.queue_sessions to anon;

create function public.publish_queue_session(p_session_id uuid,p_published boolean) returns void
language plpgsql security definer set search_path=public as $$
declare u uuid;
begin
  u:=lock_organizer();
  if p_published is null then raise exception 'Choose a sharing status.'; end if;
  update queue_sessions set published=p_published,updated_at=now() where id=p_session_id and organizer_id=u;
  if not found then raise exception 'Queue session not found.'; end if;
end $$;

-- Return only event details and display names, never private player rows/UUIDs,
-- queue membership IDs, rejoin preferences, photos, or organizer credentials.
create function public.get_public_sessions(p_session_id uuid default null) returns jsonb
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
     'side_a',coalesce((select string_agg(p.name,' / ' order by p.name,p.id) from queue_match_players mp join players p on p.id=mp.player_id where mp.match_id=m.id and mp.side='a'),'TBD'),
     'side_b',coalesce((select string_agg(p.name,' / ' order by p.name,p.id) from queue_match_players mp join players p on p.id=mp.player_id where mp.match_id=m.id and mp.side='b'),'TBD'),
     'games',coalesce((select jsonb_agg(jsonb_build_object('game_no',g.game_no,'score_a',g.score_a,'score_b',g.score_b) order by g.game_no) from match_games g where g.queue_match_id=m.id),'[]'::jsonb)
    ) order by m.started_at desc,m.id) from queue_matches m where m.session_id=s.id),'[]'::jsonb)
  ) as event from queue_sessions s where s.published and (p_session_id is null or s.id=p_session_id)
 ) events
$$;

-- Changing a match or roster touches the public parent so spectators can listen
-- to one safe table while queue tables themselves remain private.
create function public.touch_queue_session() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if TG_OP='DELETE' then
    update queue_sessions set updated_at=clock_timestamp() where id=old.session_id;
    return old;
  end if;
  update queue_sessions set updated_at=clock_timestamp() where id=new.session_id;
  return new;
end $$;
create trigger queue_match_public_update after insert or update or delete on public.queue_matches for each row execute function public.touch_queue_session();
create trigger queue_member_public_update after insert or update or delete on public.queue_members for each row execute function public.touch_queue_session();

-- Names are the only player information exposed by published sessions. Renaming
-- an active or historical participant should also refresh their spectator page.
create function public.touch_player_sessions() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if new.name is distinct from old.name then
    update queue_sessions set updated_at=clock_timestamp() where id in (
      select session_id from queue_members where player_id=new.id
      union select qm.session_id from queue_matches qm join queue_match_players mp on mp.match_id=qm.id where mp.player_id=new.id
    );
  end if;
  return new;
end $$;
create trigger queue_player_name_update after update of name on public.players for each row execute function public.touch_player_sessions();

revoke execute on function publish_queue_session(uuid,boolean),get_public_sessions(uuid),touch_queue_session(),touch_player_sessions() from public,anon,authenticated;
grant execute on function publish_queue_session(uuid,boolean) to authenticated;
grant execute on function get_public_sessions(uuid) to anon,authenticated;

-- Equal-play normal pickleball rotations. Planned games are not tournament brackets.
alter table public.queue_sessions add column session_hours numeric(5,2) not null default 2 check(session_hours between 0.25 and 24);
alter table public.queue_sessions add column estimated_match_minutes int not null default 15 check(estimated_match_minutes between 1 and 180);
create table public.queue_rotations (
 id uuid primary key default gen_random_uuid(),session_id uuid not null unique references public.queue_sessions(id) on delete cascade,
 player_ids uuid[] not null,target_matches int not null check(target_matches>0),created_at timestamptz not null default now()
);
create table public.queue_rotation_games (
 id uuid primary key default gen_random_uuid(),session_id uuid not null references public.queue_rotations(session_id) on delete cascade,
 position int not null check(position>0),player_ids uuid[] not null,
 match_id uuid unique references public.queue_matches(id) on delete set null,unique(session_id,position)
);
alter table public.queue_rotations enable row level security;
alter table public.queue_rotation_games enable row level security;
create policy queue_rotations_owner_read on public.queue_rotations for select to authenticated using(owns_queue(session_id));
create policy queue_rotation_games_owner_read on public.queue_rotation_games for select to authenticated using(owns_queue(session_id));
revoke all on public.queue_rotations,public.queue_rotation_games from public,anon,authenticated;
grant select on public.queue_rotations,public.queue_rotation_games to authenticated;

-- Membership is fixed while a rotation is in place; returning players must rejoin.
create function public.guard_rotation_members() returns trigger language plpgsql security definer set search_path=public as $$
declare sid uuid;
begin
 if tg_op='UPDATE' and new.session_id=old.session_id and new.player_id=old.player_id and new.rejoin then return new; end if;
 sid:=case when tg_op='INSERT' then new.session_id else old.session_id end;
 perform lock_organizer();
 if exists(select 1 from queue_rotations r join queue_sessions s on s.id=r.session_id where r.session_id=sid and s.status='ongoing') or
    (tg_op='UPDATE' and exists(select 1 from queue_rotations r join queue_sessions s on s.id=r.session_id where r.session_id=new.session_id and s.status='ongoing')) then
  raise exception 'Cancel the balanced rotation before changing its roster or rejoin settings.';
 end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end $$;
create trigger queue_rotation_member_guard before insert or update or delete on public.queue_members for each row execute function public.guard_rotation_members();
revoke execute on function public.guard_rotation_members() from public,anon,authenticated;

-- Manual games cannot invalidate an active equal-play plan. The scheduler alone uses the core starter.
create or replace function public.start_queue_match(p_session_id uuid,p_player_ids uuid[],p_court_no int) returns uuid language plpgsql security definer set search_path=public as $$
begin
 perform lock_organizer();
 if not exists(select 1 from queue_sessions where id=p_session_id and organizer_id=auth.uid() and mode='normal') then raise exception 'Use the generated bracket to start matches in bracket sessions.'; end if;
 if exists(select 1 from queue_rotations where session_id=p_session_id) then raise exception 'Use Fill available courts for this balanced rotation, or cancel it before starting manual games.'; end if;
 return start_queue_match_core(p_session_id,p_player_ids,p_court_no);
end $$;

alter function public.auto_fill_session_courts(uuid) rename to auto_fill_session_courts_legacy;
revoke execute on function public.auto_fill_session_courts_legacy(uuid) from public,anon,authenticated;
create function public.auto_fill_session_courts(p_session_id uuid) returns int language plpgsql security definer set search_path=public as $$
declare u uuid; s queue_sessions; court int; next_game queue_rotation_games; mid uuid; started int:=0;
begin
 u:=lock_organizer(); select * into s from queue_sessions where id=p_session_id and organizer_id=u for update;
 if not found then raise exception 'Session not found.'; end if;
 if s.status<>'ongoing' then return 0; end if;
 if s.sport<>'pickleball' or s.mode<>'normal' then return auto_fill_session_courts_legacy(s.id); end if;
 if not exists(select 1 from queue_rotations where session_id=s.id) then raise exception 'Generate a balanced rotation before randomly filling pickleball courts.'; end if;
 for court in 1..s.court_count loop
  if exists(select 1 from queue_matches where session_id=s.id and court_no=court and status='playing') then continue; end if;
  select g.* into next_game from queue_rotation_games g where g.session_id=s.id and g.match_id is null
   and not exists(select 1 from unnest(g.player_ids) p where player_busy(p) or not exists(select 1 from queue_members q where q.session_id=s.id and q.player_id=p and q.status='waiting'))
   order by g.position limit 1;
  if not found then continue; end if;
  mid:=start_queue_match_core(s.id,next_game.player_ids,court);
  update queue_rotation_games set match_id=mid where id=next_game.id;
  started:=started+1;
 end loop;
 return started;
end $$;

create function public.generate_pickleball_rotation(p_session_id uuid,p_hours numeric,p_minutes int) returns int language plpgsql security definer set search_path=public as $$
declare u uuid; s queue_sessions; roster uuid[]; counts int[]; remaining int[]; chosen uuid[]; chosen_indices int[];
 n int; slots int; capacity int; total_before int; largest_before int; target int; games int; i int; step int;
begin
 u:=lock_organizer(); select * into s from queue_sessions where id=p_session_id and organizer_id=u and sport='pickleball' and mode='normal' and status='ongoing' for update;
 if not found then raise exception 'Active normal pickleball session not found.'; end if;
 if p_hours is null or p_hours<0.25 or p_hours>24 or p_hours<>round(p_hours,2) or p_minutes is null or p_minutes not between 1 and 180 then raise exception 'Choose 0.25–24 hours (up to two decimals) and 1–180 minutes per match.'; end if;
 if exists(select 1 from queue_rotations where session_id=s.id) then raise exception 'Cancel the existing rotation before generating another.'; end if;
 if exists(select 1 from queue_matches where session_id=s.id and status='playing') then raise exception 'Finish active session matches before generating a rotation.'; end if;
 select array_agg(q.player_id order by q.player_id) into roster from queue_members q where q.session_id=s.id;
 n:=coalesce(cardinality(roster),0); slots:=case when s.play_type='singles' then 2 else 4 end;
 if n<slots or n>256 then raise exception 'Register %–256 players before generating this rotation.',slots; end if;
 select array_agg((select count(*)::int from queue_match_players mp join queue_matches m on m.id=mp.match_id where m.session_id=s.id and m.status='completed' and mp.player_id=p) order by p) into counts from unnest(roster) p;
 select sum(c),max(c) into total_before,largest_before from unnest(counts) c;
 capacity:=floor(p_hours*60/p_minutes)::int * least(s.court_count,n/slots);
 target:=(capacity*slots+total_before)/n;
 -- Find a feasible equal final count. Divisibility and per-player quotas prevent stranded games.
 loop
  if target<largest_before or target<=0 then raise exception 'Not enough time for equal match counts. Add hours, shorten the match estimate, or adjust the roster before generating.'; end if;
  games:=(n*target-total_before)/slots;
  exit when (n*target-total_before)%slots=0 and games>0 and target-(select min(c) from unnest(counts) c)<=games;
  target:=target-1;
 end loop;
 if games>1000 then raise exception 'This plan exceeds 1,000 games. Shorten the session or increase the estimated match time.'; end if;
 remaining:=array(select target-c from unnest(counts) c);
 update queue_sessions set session_hours=p_hours,estimated_match_minutes=p_minutes,updated_at=clock_timestamp() where id=s.id;
 update queue_members set rejoin=true where session_id=s.id;
 insert into queue_rotations(session_id,player_ids,target_matches) values(s.id,roster,target);
 for step in 1..games loop
  -- Largest outstanding quotas first, random tie-breaks; randomize sides independently.
  select array_agg(idx) into chosen_indices from (select idx from generate_subscripts(remaining,1) idx where remaining[idx]>0 order by remaining[idx] desc,random() limit slots) picked;
  if cardinality(chosen_indices)<>slots then raise exception 'Unable to create an equal-play rotation with this roster.'; end if;
  select array_agg(roster[idx] order by random()) into chosen from unnest(chosen_indices) idx;
  foreach i in array chosen_indices loop remaining[i]:=remaining[i]-1; end loop;
  insert into queue_rotation_games(session_id,position,player_ids) values(s.id,step,chosen);
 end loop;
 if exists(select 1 from unnest(remaining) c where c<>0) then raise exception 'Unable to balance all player match counts.'; end if;
 perform auto_fill_session_courts(s.id);
 return games;
end $$;

create function public.cancel_pickleball_rotation(p_session_id uuid) returns void language plpgsql security definer set search_path=public as $$
begin
 perform lock_organizer(); if not owns_queue(p_session_id) then raise exception 'Session not found.'; end if;
 delete from queue_rotations where session_id=p_session_id;
 -- Started matches and results remain in queue_matches; only unstarted reservations are discarded.
 update queue_sessions set updated_at=clock_timestamp() where id=p_session_id;
end $$;

-- Preserve the bracket-finalization wrapper, then fill freed courts from this normal-session plan.
alter function public.save_match_score(uuid,text,jsonb,int,boolean,text) rename to save_match_score_with_brackets;
revoke execute on function public.save_match_score_with_brackets(uuid,text,jsonb,int,boolean,text) from public,anon,authenticated;
create function public.save_match_score(p_match_id uuid,p_kind text,p_games jsonb,p_expected_version int,p_finalize boolean,p_walkover_side text default null) returns void language plpgsql security definer set search_path=public as $$
declare sid uuid;
begin
 perform save_match_score_with_brackets(p_match_id,p_kind,p_games,p_expected_version,p_finalize,p_walkover_side);
 if p_kind='queue' and p_finalize then
  select session_id into sid from queue_matches where id=p_match_id;
  if exists(select 1 from queue_rotations where session_id=sid) then perform auto_fill_session_courts(sid); end if;
 end if;
end $$;

-- Ending a session is an explicit cancellation of any unused time/rotation slots.
create or replace function public.end_queue_session_core(p_session_id uuid) returns void language plpgsql security definer set search_path=public as $$
begin
 perform lock_organizer(); if not owns_queue(p_session_id) then raise exception 'Queue session not found.'; end if;
 if exists(select 1 from queue_matches where session_id=p_session_id and status='playing') then raise exception 'Finish active matches before ending the session.'; end if;
 update queue_sessions set status='completed' where id=p_session_id;
 delete from queue_members where session_id=p_session_id;
end $$;

revoke execute on function auto_fill_session_courts(uuid),generate_pickleball_rotation(uuid,numeric,int),cancel_pickleball_rotation(uuid),save_match_score(uuid,text,jsonb,int,boolean,text) from public,anon,authenticated;
grant execute on function auto_fill_session_courts(uuid),generate_pickleball_rotation(uuid,numeric,int),cancel_pickleball_rotation(uuid),save_match_score(uuid,text,jsonb,int,boolean,text) to authenticated;
do $$ begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
  alter publication supabase_realtime add table public.queue_rotations,public.queue_rotation_games;
 end if;
end $$;

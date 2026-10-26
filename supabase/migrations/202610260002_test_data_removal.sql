-- Apply after 202610260001_qmaster.sql. Permanent, owner-scoped test cleanup.
create function public.delete_tournament(p_tournament_id uuid) returns void
language plpgsql security definer set search_path=public as $$
declare u uuid;
begin
  u := lock_organizer();
  if not exists(select 1 from tournaments where id=p_tournament_id and organizer_id=u) then
    raise exception 'Tournament not found.';
  end if;
  -- Tournament FK cascades remove entries, memberships, matches and game scores.
  -- This also cancels any active matches and removes the public results page.
  delete from tournaments where id=p_tournament_id and organizer_id=u;
end $$;

create function public.delete_queue_session(p_session_id uuid) returns void
language plpgsql security definer set search_path=public as $$
declare u uuid;
begin
  u := lock_organizer();
  if not exists(select 1 from queue_sessions where id=p_session_id and organizer_id=u) then
    raise exception 'Queue session not found.';
  end if;
  delete from match_games where queue_match_id in(select id from queue_matches where session_id=p_session_id);
  delete from queue_match_players where match_id in(select id from queue_matches where session_id=p_session_id);
  delete from queue_matches where session_id=p_session_id;
  delete from queue_sessions where id=p_session_id and organizer_id=u;
end $$;

create function public.purge_player(p_player_id uuid) returns void
language plpgsql security definer set search_path=public as $$
declare u uuid;
begin
  u := lock_organizer();
  if not exists(select 1 from players where id=p_player_id and organizer_id=u) then
    raise exception 'Player not found.';
  end if;
  if exists(select 1 from tournament_entry_players where player_id=p_player_id)
     or exists(select 1 from queue_match_players where player_id=p_player_id)
     or exists(select 1 from queue_members where player_id=p_player_id and status='playing') then
    raise exception 'Delete this player''s tournaments and queue sessions first, or use Clear all test data in Settings. You can also archive the player to keep history.';
  end if;
  delete from queue_members where player_id=p_player_id;
  delete from players where id=p_player_id and organizer_id=u;
end $$;

create function public.clear_test_data(p_confirmation text) returns void
language plpgsql security definer set search_path=public as $$
declare u uuid; event_id uuid;
begin
  u := lock_organizer();
  if p_confirmation is distinct from 'DELETE ALL' then
    raise exception 'Type DELETE ALL to confirm clearing your workspace.';
  end if;
  for event_id in select id from queue_sessions where organizer_id=u loop
    perform delete_queue_session(event_id);
  end loop;
  for event_id in select id from tournaments where organizer_id=u loop
    perform delete_tournament(event_id);
  end loop;
  delete from players where organizer_id=u;
  -- Keep the organizer/Auth account and Storage objects. Storage files must be
  -- deleted via the Storage API; deleting its metadata in SQL leaves orphan files.
end $$;

revoke execute on function delete_tournament(uuid),delete_queue_session(uuid),purge_player(uuid),clear_test_data(text) from public,anon,authenticated;
grant execute on function delete_tournament(uuid),delete_queue_session(uuid),purge_player(uuid),clear_test_data(text) to authenticated;

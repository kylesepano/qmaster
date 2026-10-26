-- Durable cleanup requests. Physical files must be removed using Storage API,
-- never by deleting storage.objects metadata in SQL.
create table public.media_cleanup (
 id uuid primary key default gen_random_uuid(),organizer_id uuid not null references public.organizers(id),
 path text not null,created_at timestamptz not null default now(),
 check(path like organizer_id::text || '/%'),unique(organizer_id,path)
);
alter table public.media_cleanup enable row level security;
create policy media_cleanup_owner_read on public.media_cleanup for select to authenticated using(organizer_id=auth.uid());
create policy media_cleanup_owner_delete on public.media_cleanup for delete to authenticated using(organizer_id=auth.uid());
revoke all on public.media_cleanup from public,anon,authenticated;
grant select,delete on public.media_cleanup to authenticated;

create function public.enqueue_media_cleanup(p_path text) returns void language plpgsql security definer set search_path=public as $$
declare u uuid; begin
 u:=lock_organizer();
 if p_path is null or p_path not like u::text || '/%' or p_path ~ '(^|/)[.]{1,2}(/|$)' or position(chr(92) in p_path)>0 then raise exception 'Choose an image in your own media folder.'; end if;
 insert into media_cleanup(organizer_id,path) values(u,p_path) on conflict(organizer_id,path) do nothing;
end $$;
create function public.track_media_cleanup() returns trigger language plpgsql security definer set search_path=public as $$
declare old_path text; begin
 if TG_TABLE_NAME='players' then
  old_path:=old.photo_path;
  if TG_OP='UPDATE' and new.photo_path is not distinct from old.photo_path then return new; end if;
 else
  old_path:=old.banner_path;
  if TG_OP='UPDATE' and new.banner_path is not distinct from old.banner_path then return new; end if;
 end if;
 if old_path is not null and old_path like old.organizer_id::text || '/%' then
  insert into media_cleanup(organizer_id,path) values(old.organizer_id,old_path) on conflict(organizer_id,path) do nothing;
 end if;
 if TG_OP='DELETE' then return old; else return new; end if;
end $$;
create trigger player_media_cleanup after delete or update of photo_path on public.players for each row execute function public.track_media_cleanup();
create trigger tournament_media_cleanup after delete or update of banner_path on public.tournaments for each row execute function public.track_media_cleanup();
revoke execute on function public.enqueue_media_cleanup(text),public.track_media_cleanup() from public,anon,authenticated;
grant execute on function public.enqueue_media_cleanup(text) to authenticated;

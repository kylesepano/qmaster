import { db, rpc, write } from "./api";
import { ActionFeedback } from "./actionFeedback";

type CleanupResult = { removed: number; error: string | null };
function ownPath(path: string, uid: string) {
  return (
    path.startsWith(`${uid}/`) &&
    !path.split("/").some((p) => p === "." || p === "..") &&
    !path.includes("\\")
  );
}
async function userId() {
  const { data, error } = await db().auth.getUser();
  if (error) throw error;
  if (!data.user) throw new Error("Sign in to clean up images.");
  return data.user.id;
}
async function referencedPaths(uid: string) {
  const paths = new Set<string>();
  for (const [table, column] of [
    ["players", "photo_path"],
    ["tournaments", "banner_path"],
  ]) {
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await db()
        .from(table)
        .select(`id,${column}`)
        .eq("organizer_id", uid)
        .order("id")
        .range(offset, offset + 499);
      if (error) throw error;
      for (const row of data as unknown as Record<string, unknown>[])
        if (typeof row[column] === "string") paths.add(row[column] as string);
      if (data.length < 500) break;
    }
  }
  return paths;
}
/** Retries persist in Postgres until the Storage API has removed the file. */
let cleanupChain: Promise<unknown> = Promise.resolve();
export function flushMediaCleanup(): Promise<CleanupResult> {
  const next = cleanupChain.then(processCleanup);
  cleanupChain = next.catch(() => undefined);
  return next;
}
async function processCleanup(): Promise<CleanupResult> {
  let removed = 0;
  try {
    const uid = await userId();
    let cursor: string | null = null;
    for (;;) {
      let query = db()
        .from("media_cleanup")
        .select("id,path")
        .eq("organizer_id", uid)
        .order("id")
        .limit(100);
      if (cursor) query = query.gt("id", cursor);
      const { data: jobs, error } = await query;
      if (error) throw error;
      if (!jobs.length) break;
      const references = await referencedPaths(uid);
      for (const job of jobs) {
        if (!ownPath(job.path, uid))
          throw new Error("A cleanup path is outside your media folder.");
        if (references.has(job.path)) continue;
        const { data: deleted, error } = await db()
          .storage.from("qmaster-media")
          .remove([job.path]);
        if (error) throw error;
        if (!deleted?.length) {
          const split = job.path.lastIndexOf("/");
          const filename = job.path.slice(split + 1);
          const { data: remaining, error: listError } = await db()
            .storage.from("qmaster-media")
            .list(job.path.slice(0, split), { search: filename, limit: 100 });
          if (listError) throw listError;
          if (remaining.some((file) => file.id && file.name === filename))
            throw new Error(
              "Storage did not remove the image. Check your Storage delete policy and retry.",
            );
        }
        removed += deleted?.length ?? 0;
        await write(
          db()
            .from("media_cleanup")
            .delete()
            .eq("id", job.id)
            .eq("organizer_id", uid),
        );
      }
      cursor = jobs[jobs.length - 1].id;
    }
    return { removed, error: null };
  } catch (error) {
    return {
      removed,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
/** Find files left by earlier deletions or interrupted uploads, within this owner only. */
export async function cleanUnusedImages(): Promise<CleanupResult> {
  try {
    const uid = await userId();
    const references = await referencedPaths(uid);
    const folders = [uid];
    const unused: string[] = [];
    while (folders.length) {
      const folder = folders.pop()!;
      for (let offset = 0; ; offset += 100) {
        const { data, error } = await db()
          .storage.from("qmaster-media")
          .list(folder, {
            limit: 100,
            offset,
            sortBy: { column: "name", order: "asc" },
          });
        if (error) throw error;
        for (const object of data) {
          if (!object.name || object.name.includes("/")) continue;
          const path = `${folder}/${object.name}`;
          if (!ownPath(path, uid)) continue;
          if (!object.id) folders.push(path);
          else if (!references.has(path)) {
            const created = Date.parse(
              object.created_at ?? object.updated_at ?? "",
            );
            if (
              Number.isFinite(created) &&
              Date.now() - created >= 5 * 60 * 1000
            )
              unused.push(path);
          }
        }
        if (data.length < 100) break;
      }
    }
    for (const path of unused)
      await rpc("enqueue_media_cleanup", { p_path: path });
    return await flushMediaCleanup();
  } catch (error) {
    return {
      removed: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
export async function cleanupFeedback(success: string, scan = false) {
  const result = await (scan ? cleanUnusedImages() : flushMediaCleanup());
  return new ActionFeedback(
    result.error
      ? `${success} Image cleanup is pending: ${result.error} Retry Clean unused images in Settings.`
      : success,
    !!result.error,
  );
}
export async function deleteWithMediaCleanup(
  name: string,
  args: Record<string, unknown>,
  success: string,
) {
  await rpc(name, args);
  return await cleanupFeedback(success);
}
export async function discardUpload(path: string) {
  await rpc("enqueue_media_cleanup", { p_path: path });
  return await flushMediaCleanup();
}

import { supabase } from "../lib/supabase";
import type { AppData, Entry } from "../types";

export function db() {
  if (!supabase)
    throw new Error(
      "Connect Supabase first. Follow the setup checklist in Settings.",
    );
  return supabase;
}
export async function rpc(name: string, args: Record<string, unknown> = {}) {
  const { data, error } = await db().rpc(name, args);
  if (error) throw new Error(error.message);
  return data;
}
export async function write(
  query: PromiseLike<{ error: { message: string } | null }>,
) {
  const { error } = await query;
  if (error) throw new Error(error.message);
}
async function rows(
  table: string,
  filterColumn?: string,
  filterValue?: string | string[],
): Promise<any[]> {
  if (Array.isArray(filterValue) && !filterValue.length) return [];
  if (Array.isArray(filterValue) && filterValue.length > 100) {
    const result: any[] = [];
    for (let i = 0; i < filterValue.length; i += 100)
      result.push(
        ...(await rows(table, filterColumn, filterValue.slice(i, i + 100))),
      );
    return result;
  }
  const result: any[] = [];
  for (let start = 0; ; start += 500) {
    let query = db()
      .from(table)
      .select("*")
      .order("id")
      .range(start, start + 499);
    if (filterColumn && filterValue !== undefined)
      query = Array.isArray(filterValue)
        ? query.in(filterColumn, filterValue)
        : query.eq(filterColumn, filterValue);
    const { data, error } = await query;
    if (error) throw new Error(`${table}: ${error.message}`);
    result.push(...data);
    if (data.length < 500) return result;
  }
}
export async function loadData(organizerId: string): Promise<AppData> {
  const [players, tournaments, queueSessions] = await Promise.all([
    rows("players", "organizer_id", organizerId),
    rows("tournaments", "organizer_id", organizerId),
    rows("queue_sessions", "organizer_id", organizerId),
  ]);
  const tournamentIds = tournaments.map((t) => t.id),
    queueIds = queueSessions.map((q) => q.id);
  const [
    rawEntries,
    entryPlayers,
    tournamentMatches,
    queueMembers,
    queueMatches,
  ] = await Promise.all([
    rows("tournament_entries", "tournament_id", tournamentIds),
    rows("tournament_entry_players", "tournament_id", tournamentIds),
    rows("tournament_matches", "tournament_id", tournamentIds),
    rows("queue_members", "session_id", queueIds),
    rows("queue_matches", "session_id", queueIds),
  ]);
  const [queueMatchPlayers, tournamentGames, queueGames] = await Promise.all([
    rows(
      "queue_match_players",
      "match_id",
      queueMatches.map((m) => m.id),
    ),
    rows(
      "match_games",
      "tournament_match_id",
      tournamentMatches.map((m) => m.id),
    ),
    rows(
      "match_games",
      "queue_match_id",
      queueMatches.map((m) => m.id),
    ),
  ]);
  const games = [...tournamentGames, ...queueGames];
  const entries: Entry[] = rawEntries.map((e) => ({
    ...e,
    player_ids: entryPlayers
      .filter((p) => p.entry_id === e.id)
      .map((p) => p.player_id),
  }));
  return {
    players,
    tournaments,
    entries,
    tournamentMatches,
    queueSessions,
    queueMembers,
    queueMatches,
    queueMatchPlayers,
    games,
  };
}
export async function loadPublicTournament(id: string) {
  const [tournaments, entries, matches] = await Promise.all([
    rows("tournaments", "id", id),
    rows("tournament_entries", "tournament_id", id),
    rows("tournament_matches", "tournament_id", id),
  ]);
  if (!tournaments[0]?.published)
    return {
      tournament: undefined,
      entries: [] as Entry[],
      matches: [] as AppData["tournamentMatches"],
      games: [] as AppData["games"],
    };
  const ids = matches.map((m) => m.id);
  const games: AppData["games"] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await db()
      .from("match_games")
      .select("*")
      .in("tournament_match_id", ids.slice(i, i + 100));
    if (error) throw new Error(error.message);
    games.push(...data);
  }
  return {
    tournament: tournaments[0] as AppData["tournaments"][0] | undefined,
    entries: entries as Entry[],
    matches: matches as AppData["tournamentMatches"],
    games,
  };
}

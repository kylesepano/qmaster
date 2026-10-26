import type { AppData, Sport } from "../types";

/** Match wins/losses for each individual, including both members of a doubles side. */
export function playerRecords(
  data: AppData,
  sport?: Sport,
): Map<string, { wins: number; losses: number }> {
  const records = new Map(
    data.players.map((p) => [p.id, { wins: 0, losses: 0 }]),
  );
  const count = (id: string, won: boolean) => {
    const row = records.get(id);
    if (row) {
      if (won) row.wins++;
      else row.losses++;
    }
  };
  for (const match of data.tournamentMatches) {
    if (
      sport &&
      (data.tournaments.find((t) => t.id === match.tournament_id)?.sport ??
        "badminton") !== sport
    )
      continue;
    if (match.status !== "completed" || !match.winner_entry_id) continue;
    for (const entry of data.entries.filter(
      (e) => e.id === match.entry_a_id || e.id === match.entry_b_id,
    ))
      for (const id of entry.player_ids)
        count(id, entry.id === match.winner_entry_id);
  }
  for (const match of data.queueMatches) {
    if (
      sport &&
      (data.queueSessions.find((s) => s.id === match.session_id)?.sport ??
        "badminton") !== sport
    )
      continue;
    if (match.status !== "completed" || !match.winner_side) continue;
    for (const player of data.queueMatchPlayers.filter(
      (p) => p.match_id === match.id,
    ))
      count(player.player_id, player.side === match.winner_side);
  }
  return records;
}

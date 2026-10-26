import type { Entry, MatchGame, TournamentMatch } from "../types";

export interface Standing {
  entryId: string;
  name: string;
  seed: number;
  rank: number;
  played: number;
  wins: number;
  losses: number;
  gamesFor: number;
  gamesAgainst: number;
  pointsFor: number;
  pointsAgainst: number;
  gameDifference: number;
  pointDifference: number;
}

/** Mirrors the database champion rules: match wins, game difference, point difference, then seed. */
export function calculateStandings(
  entries: Entry[],
  matches: TournamentMatch[],
  games: MatchGame[],
): Standing[] {
  const rows: Standing[] = entries.map((entry) => ({
    entryId: entry.id,
    name: entry.name,
    seed: entry.seed,
    rank: 0,
    played: 0,
    wins: 0,
    losses: 0,
    gamesFor: 0,
    gamesAgainst: 0,
    pointsFor: 0,
    pointsAgainst: 0,
    gameDifference: 0,
    pointDifference: 0,
  }));
  const byEntry = new Map(rows.map((row) => [row.entryId, row]));
  const byMatch = new Map<string, MatchGame[]>();
  for (const game of games) {
    if (!game.tournament_match_id) continue;
    const list = byMatch.get(game.tournament_match_id) ?? [];
    list.push(game);
    byMatch.set(game.tournament_match_id, list);
  }
  for (const match of matches) {
    if (match.status !== "completed") continue;
    for (const side of ["a", "b"] as const) {
      const entryId = side === "a" ? match.entry_a_id : match.entry_b_id;
      if (!entryId) continue;
      const row = byEntry.get(entryId);
      if (!row) continue;
      row.played++;
      if (match.winner_entry_id === entryId) row.wins++;
      else row.losses++;
      for (const game of byMatch.get(match.id) ?? []) {
        const own = side === "a" ? game.score_a : game.score_b;
        const other = side === "a" ? game.score_b : game.score_a;
        row.pointsFor += own;
        row.pointsAgainst += other;
        if (own > other) row.gamesFor++;
        if (other > own) row.gamesAgainst++;
      }
      row.gameDifference = row.gamesFor - row.gamesAgainst;
      row.pointDifference = row.pointsFor - row.pointsAgainst;
    }
  }
  return rows
    .sort(
      (a, b) =>
        b.wins - a.wins ||
        b.gameDifference - a.gameDifference ||
        b.pointDifference - a.pointDifference ||
        a.seed - b.seed,
    )
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

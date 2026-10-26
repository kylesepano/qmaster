import type { AppData, QueueMatch, TournamentMatch } from "../types";

export function matchSides(
  data: AppData,
  match: TournamentMatch | QueueMatch,
): [string, string] {
  if ("tournament_id" in match) {
    const label = (id: string | null, source: string | null) =>
      id
        ? (data.entries.find((entry) => entry.id === id)?.name ??
          "Unknown entry")
        : source
          ? "TBD"
          : match.status === "bye"
            ? "BYE"
            : "TBD";
    return [
      label(match.entry_a_id, match.source_a_match_id),
      label(match.entry_b_id, match.source_b_match_id),
    ];
  }
  const name = (side: "a" | "b") =>
    (side === "a" ? match.team_a_name : match.team_b_name) ||
    data.queueMatchPlayers
      .filter((item) => item.match_id === match.id && item.side === side)
      .map(
        (item) =>
          data.players.find((player) => player.id === item.player_id)?.name ??
          "Archived player",
      )
      .join(" / ") ||
    "TBD";
  return [name("a"), name("b")];
}

export function matchGames(data: AppData, id: string) {
  return data.games
    .filter(
      (game) => game.tournament_match_id === id || game.queue_match_id === id,
    )
    .sort((a, b) => a.game_no - b.game_no);
}

export function busyPlayerIds(data: AppData): Set<string> {
  const ids = new Set<string>();
  for (const match of data.queueMatches.filter(
    (item) => item.status === "playing",
  )) {
    for (const item of data.queueMatchPlayers.filter(
      (item) => item.match_id === match.id,
    ))
      ids.add(item.player_id);
  }
  for (const match of data.tournamentMatches.filter(
    (item) => item.status === "playing",
  )) {
    for (const entry of data.entries.filter(
      (item) => item.id === match.entry_a_id || item.id === match.entry_b_id,
    )) {
      for (const id of entry.player_ids) ids.add(id);
    }
  }
  return ids;
}

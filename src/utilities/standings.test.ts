import { describe, expect, it } from "vitest";
import type { Entry, MatchGame, TournamentMatch } from "../types";
import { calculateStandings } from "./standings";

const entries: Entry[] = ["a", "b", "c"].map((id, index) => ({
  id,
  tournament_id: "t",
  name: id.toUpperCase(),
  seed: index + 1,
  player_ids: [],
}));
const match = (
  id: string,
  a: string,
  b: string,
  winner: string,
  status = "completed",
) =>
  ({
    id,
    entry_a_id: a,
    entry_b_id: b,
    winner_entry_id: winner,
    status,
  }) as TournamentMatch;
const game = (id: string, a: number, b: number) =>
  ({
    tournament_match_id: id,
    queue_match_id: null,
    game_no: 1,
    score_a: a,
    score_b: b,
  }) as MatchGame;

describe("round robin standings", () => {
  it("breaks a circular match-win tie by point difference when game difference is equal", () => {
    const matches = [
      match("ab", "a", "b", "a"),
      match("bc", "b", "c", "b"),
      match("ca", "c", "a", "c"),
    ];
    const games = [game("ab", 21, 10), game("bc", 21, 19), game("ca", 21, 19)];
    const table = calculateStandings(entries, matches, games);
    expect(table.map((row) => row.entryId)).toEqual(["a", "c", "b"]);
    expect(table.map((row) => row.pointDifference)).toEqual([9, 0, -9]);
    expect(
      table.every(
        (row) => row.played === 2 && row.wins === 1 && row.gameDifference === 0,
      ),
    ).toBe(true);
  });
  it("counts a walkover as a match win without inventing game scores", () => {
    const table = calculateStandings(entries, [match("ab", "a", "b", "b")], []);
    expect(table[0]).toMatchObject({
      entryId: "b",
      wins: 1,
      played: 1,
      gamesFor: 0,
      pointsFor: 0,
    });
  });
  it("ignores live scores, queue scores and byes and uses seed for exact ties", () => {
    const table = calculateStandings(
      entries,
      [
        match("ab", "a", "b", "b", "playing"),
        match("ca", "c", "a", "c", "bye"),
      ],
      [
        game("ab", 15, 20),
        { ...game("q", 21, 0), tournament_match_id: null, queue_match_id: "q" },
      ],
    );
    expect(table.map((row) => row.entryId)).toEqual(["a", "b", "c"]);
    expect(table.every((row) => row.played === 0 && row.pointsFor === 0)).toBe(
      true,
    );
  });
});

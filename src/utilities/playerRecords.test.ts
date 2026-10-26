import { describe, expect, it } from "vitest";
import { EMPTY_DATA } from "../types";
import type { AppData } from "../types";
import { playerRecords } from "./playerRecords";
import { suggestNextPlayers } from "./queue";

describe("individual player records", () => {
  it("keeps pickleball and badminton records separate for the same player", () => {
    const data = {
      ...EMPTY_DATA,
      players: [{ id: "a" }, { id: "b" }],
      tournaments: [{ id: "t", sport: "pickleball" }],
      entries: [
        { id: "a", player_ids: ["a"] },
        { id: "b", player_ids: ["b"] },
      ],
      tournamentMatches: [
        {
          tournament_id: "t",
          status: "completed",
          entry_a_id: "a",
          entry_b_id: "b",
          winner_entry_id: "a",
        },
      ],
      queueSessions: [{ id: "s", sport: "badminton" }],
      queueMatches: [
        { id: "m", session_id: "s", status: "completed", winner_side: "b" },
      ],
      queueMatchPlayers: [
        { match_id: "m", player_id: "a", side: "a" },
        { match_id: "m", player_id: "b", side: "b" },
      ],
    } as AppData;
    expect(playerRecords(data, "pickleball").get("a")).toEqual({
      wins: 1,
      losses: 0,
    });
    expect(playerRecords(data, "badminton").get("a")).toEqual({
      wins: 0,
      losses: 1,
    });
  });
  it("counts team wins for both members, ignores BYEs and live matches, and follows corrected winners", () => {
    const data = {
      ...EMPTY_DATA,
      players: ["a", "b", "c", "d", "e"].map((id) => ({ id })),
      entries: [
        { id: "team1", player_ids: ["a", "b"] },
        { id: "team2", player_ids: ["c", "d"] },
      ],
      tournamentMatches: [
        {
          status: "completed",
          entry_a_id: "team1",
          entry_b_id: "team2",
          winner_entry_id: "team1",
        },
        { status: "bye", entry_a_id: "team1", winner_entry_id: "team1" },
        {
          status: "playing",
          entry_a_id: "team1",
          entry_b_id: "team2",
          winner_entry_id: null,
        },
      ],
      queueMatches: [
        { id: "q", status: "completed", winner_side: "b", walkover: true },
      ],
      queueMatchPlayers: [
        { match_id: "q", player_id: "a", side: "a" },
        { match_id: "q", player_id: "b", side: "a" },
        { match_id: "q", player_id: "c", side: "b" },
        { match_id: "q", player_id: "d", side: "b" },
      ],
    } as AppData;
    const rows = playerRecords(data);
    for (const id of ["a", "b", "c", "d"])
      expect(rows.get(id)).toEqual({ wins: 1, losses: 1 });
    expect(rows.get("e")).toEqual({ wins: 0, losses: 0 });
    data.queueMatches[0].winner_side = "a";
    expect(playerRecords(data).get("a")).toEqual({ wins: 2, losses: 0 });
  });
  it("requires four players for mixed doubles FIFO suggestions", () => {
    const members = ["a", "b", "c", "d"].map((id, i) => ({
      id,
      player_id: id,
      position: i,
      status: "waiting",
    })) as AppData["queueMembers"];
    expect(suggestNextPlayers(members, "mixed")).toHaveLength(4);
    expect(suggestNextPlayers(members.slice(0, 3), "mixed")).toEqual([]);
  });
});

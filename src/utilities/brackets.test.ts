import { describe, expect, it } from "vitest";
import type { BracketFormat } from "../types";
import {
  generateBracket,
  resolveBracket,
  seedOrder,
  shuffleEntries,
} from "./brackets";

const entrants = (count: number) =>
  Array.from({ length: count }, (_, index) => `entry-${index + 1}`);
function play(
  count: number,
  format: BracketFormat,
  choose: (index: number) => "a" | "b",
) {
  const ids = entrants(count);
  const nodes = generateBracket(ids, format);
  const results: Record<string, "a" | "b"> = {};
  let state = resolveBracket(nodes, results);
  for (let turn = 0; turn <= nodes.length; turn++) {
    const ready = state.filter((node) => node.status === "ready");
    if (!ready.length) break;
    ready.forEach((node, index) => {
      results[node.id] = choose(turn + index);
    });
    state = resolveBracket(nodes, results);
  }
  return { ids, nodes, state };
}

describe("single elimination", () => {
  it.each([2, 4, 6, 8, 10, 12, 16, 31, 32, 64])(
    "advances all %i entries safely through BYEs and into one champion",
    (count) => {
      const { ids, state } = play(count, "single_elimination", () => "a");
      const played = state.filter((node) => node.status === "completed");
      expect(played).toHaveLength(count - 1);
      expect(
        state.every((node) => ["completed", "bye"].includes(node.status)),
      ).toBe(true);
      expect(
        new Set(played.flatMap((node) => [node.entry_a_id, node.entry_b_id])),
      ).toEqual(new Set(ids));
      const final = state.find((node) => node.bracket === "final")!;
      const losses = played.map((node) => node.loser_entry_id);
      expect(new Set(losses).size).toBe(count - 1);
      expect(losses).not.toContain(final.winner_entry_id);
    },
  );
  it("gives the top seeds BYEs in a six-player bracket", () => {
    const nodes = resolveBracket(
      generateBracket(entrants(6), "single_elimination"),
    );
    const byes = nodes.filter((node) => node.status === "bye");
    expect(byes.map((node) => node.winner_entry_id).sort()).toEqual([
      "entry-1",
      "entry-2",
    ]);
    expect(seedOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
  });
  it("keeps future matches pending until both sources are resolved", () => {
    const nodes = generateBracket(entrants(4), "single_elimination");
    let resolved = resolveBracket(nodes);
    expect(resolved.at(-1)!.status).toBe("pending");
    resolved = resolveBracket(nodes, { [nodes[0].id]: "a" });
    expect(resolved.at(-1)!.status).toBe("pending");
    resolved = resolveBracket(nodes, {
      [nodes[0].id]: "a",
      [nodes[1].id]: "b",
    });
    expect(resolved.at(-1)!.status).toBe("ready");
    expect(resolved.at(-1)!.entry_a_id).toBe(nodes[0].entry_a_id);
    expect(resolved.at(-1)!.entry_b_id).toBe(nodes[1].entry_b_id);
  });
});

describe("double elimination", () => {
  it.each(Array.from({ length: 63 }, (_, index) => index + 2))(
    "requires two played losses to eliminate every non-champion with %i entries",
    (count) => {
      for (const choose of [
        () => "a" as const,
        () => "b" as const,
        (index: number) => (index % 3 ? ("a" as const) : ("b" as const)),
      ]) {
        const { ids, state } = play(count, "double_elimination", choose);
        expect(
          state.every((node) =>
            ["completed", "bye", "skipped"].includes(node.status),
          ),
        ).toBe(true);
        const played = state.filter((node) => node.status === "completed");
        const reset = state.find((node) => node.bracket === "reset")!;
        const final = state.find((node) => node.bracket === "final")!;
        const champion =
          reset.status === "completed"
            ? reset.winner_entry_id
            : final.winner_entry_id;
        expect(ids).toContain(champion);
        const losses = new Map(ids.map((id) => [id, 0]));
        played.forEach((node) =>
          losses.set(
            node.loser_entry_id!,
            losses.get(node.loser_entry_id!)! + 1,
          ),
        );
        ids.forEach((id) =>
          expect(losses.get(id)).toBe(
            id === champion ? (reset.status === "completed" ? 1 : 0) : 2,
          ),
        );
        expect(played).toHaveLength(
          2 * count - (reset.status === "completed" ? 1 : 2),
        );
      }
    },
  );
  it("skips the reset when the undefeated finalist wins, and enables it after an upset", () => {
    const undefeated = play(6, "double_elimination", () => "a").state;
    expect(undefeated.find((node) => node.bracket === "reset")!.status).toBe(
      "skipped",
    );
    const upset = play(6, "double_elimination", () => "b").state;
    expect(upset.find((node) => node.bracket === "reset")!.status).toBe(
      "completed",
    );
  });
});

describe("round robin and input safety", () => {
  it.each([2, 3, 6, 7, 10, 16])(
    "schedules each pair of %i entries exactly once without double-booking a round",
    (count) => {
      const nodes = generateBracket(entrants(count), "round_robin");
      expect(nodes).toHaveLength((count * (count - 1)) / 2);
      expect(
        new Set(
          nodes.map((node) =>
            [node.entry_a_id, node.entry_b_id].sort().join(":"),
          ),
        ).size,
      ).toBe(nodes.length);
      for (const round of new Set(nodes.map((node) => node.round_no))) {
        const players = nodes
          .filter((node) => node.round_no === round)
          .flatMap((node) => [node.entry_a_id, node.entry_b_id]);
        expect(new Set(players).size).toBe(players.length);
      }
      expect(
        resolveBracket(nodes).every((node) => node.status === "ready"),
      ).toBe(true);
    },
  );
  it("rejects unsupported counts and duplicate entries", () => {
    expect(() => generateBracket(entrants(1), "single_elimination")).toThrow();
    expect(() => generateBracket(entrants(65), "double_elimination")).toThrow();
    expect(() => generateBracket(["same", "same"], "round_robin")).toThrow();
  });
  it("shuffles without changing the original array or dropping entries", () => {
    const original = entrants(16);
    const shuffled = shuffleEntries(original);
    expect(shuffled).not.toBe(original);
    expect(new Set(shuffled)).toEqual(new Set(original));
    expect(original).toEqual(entrants(16));
  });
});

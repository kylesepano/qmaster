import { describe, expect, it } from "vitest";
import { evaluateMatch, gameWinner, prepareNextGame } from "./scoring";

const games = (...scores: [number, number][]) =>
  scores.map(([score_a, score_b], index) => ({
    game_no: index + 1,
    score_a,
    score_b,
  }));

describe("badminton scoring", () => {
  it.each([
    [21, 0],
    [21, 19],
    [22, 20],
    [29, 27],
    [30, 28],
    [30, 29],
  ])("recognizes a legal winning score %i–%i", (a, b) => {
    expect(gameWinner(a, b)).toBe("a");
    expect(gameWinner(b, a)).toBe("b");
    expect(evaluateMatch(games([a, b]), 1)).toMatchObject({
      winner: "a",
      error: null,
    });
  });
  it.each([
    [20, 19],
    [20, 20],
    [21, 20],
    [28, 28],
    [29, 29],
  ])("keeps %i–%i in play", (a, b) => {
    expect(gameWinner(a, b)).toBeNull();
    expect(evaluateMatch(games([a, b]), 1)).toMatchObject({
      winner: null,
      error: null,
    });
  });
  it.each([
    [22, 18],
    [23, 20],
    [30, 27],
    [30, 30],
    [31, 29],
    [-1, 0],
    [20.5, 19],
  ])("rejects an impossible score %i–%i", (a, b) => {
    expect(evaluateMatch(games([a, b]), 1).error).toBeTruthy();
  });
  it("ends a best of three after the second win and rejects extra games", () => {
    expect(evaluateMatch(games([21, 17], [18, 21], [21, 15]), 3)).toEqual({
      winner: "a",
      gamesA: 2,
      gamesB: 1,
      error: null,
    });
    expect(evaluateMatch(games([21, 17], [21, 18]), 3)).toEqual({
      winner: "a",
      gamesA: 2,
      gamesB: 0,
      error: null,
    });
    expect(
      evaluateMatch(games([21, 17], [21, 18], [0, 0]), 3).error,
    ).toBeTruthy();
  });
  it("accepts a partial current game but not a partial earlier game", () => {
    expect(evaluateMatch(games([21, 17], [18, 20]), 3)).toMatchObject({
      winner: null,
      gamesA: 1,
      error: null,
    });
    expect(evaluateMatch(games([18, 20], [21, 17]), 3).error).toBeTruthy();
  });
  it("validates game sequence and maximum number of games", () => {
    expect(
      evaluateMatch([{ game_no: 2, score_a: 0, score_b: 0 }], 3).error,
    ).toBeTruthy();
    expect(evaluateMatch(games([21, 19], [19, 21]), 1).error).toBeTruthy();
  });
});

describe("automatic next game", () => {
  it("preserves a won game and creates a 0–0 second game without a phantom point", () => {
    const original = games([21, 19]);
    const next = prepareNextGame(original, 3);
    expect(next).toEqual(games([21, 19], [0, 0]));
    expect(original).toEqual(games([21, 19]));
    expect(evaluateMatch(next, 3)).toEqual({
      winner: null,
      gamesA: 1,
      gamesB: 0,
      error: null,
    });
    expect(prepareNextGame(next, 3)).toEqual(next);
  });
  it("starts a decider at zero after each side wins one game", () => {
    const next = prepareNextGame(games([21, 23], [30, 29]), 3);
    expect(next).toEqual(games([21, 23], [30, 29], [0, 0]));
    expect(evaluateMatch(next, 3)).toMatchObject({
      gamesA: 1,
      gamesB: 1,
      error: null,
    });
  });
  it("does not append a game after a match is won or after an invalid/unfinished score", () => {
    for (const [score, bestOf] of [
      [games([21, 18]), 1],
      [games([21, 18], [21, 17]), 3],
      [games([21, 20]), 3],
      [games([31, 1]), 3],
    ] as const)
      expect(prepareNextGame([...score], bestOf)).toEqual(score);
  });
});

describe("lenient first-to-31 scoring", () => {
  it.each([0, 1, 19, 21, 29, 30])(
    "accepts 31–%i without requiring a two-point lead",
    (opposing) => {
      expect(gameWinner(31, opposing, "lenient_31")).toBe("a");
      expect(gameWinner(opposing, 31, "lenient_31")).toBe("b");
      expect(
        evaluateMatch(games([31, opposing]), 1, "lenient_31"),
      ).toMatchObject({ winner: "a", error: null });
    },
  );
  it.each([
    [21, 0],
    [30, 0],
    [30, 30],
  ])("keeps %i–%i live until someone reaches 31", (a, b) => {
    expect(evaluateMatch(games([a, b]), 1, "lenient_31")).toMatchObject({
      winner: null,
      error: null,
    });
  });
  it.each([
    [31, 31],
    [32, 30],
    [-1, 0],
    [1.5, 0],
  ])("rejects invalid lenient score %i–%i", (a, b) =>
    expect(evaluateMatch(games([a, b]), 1, "lenient_31").error).toBeTruthy(),
  );
  it("resets after a 31-point game, respects best of three and preserves standard defaults", () => {
    expect(prepareNextGame(games([31, 1]), 3, "lenient_31")).toEqual(
      games([31, 1], [0, 0]),
    );
    expect(
      evaluateMatch(games([31, 1], [30, 31], [31, 30]), 3, "lenient_31"),
    ).toMatchObject({ winner: "a", gamesA: 2, gamesB: 1, error: null });
    expect(
      prepareNextGame(games([31, 1], [31, 30]), 3, "lenient_31"),
    ).toHaveLength(2);
    expect(evaluateMatch(games([31, 1]), 1).error).toBeTruthy();
  });
});

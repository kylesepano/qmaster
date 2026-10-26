import { describe, expect, it } from "vitest";
import { evaluateMatch, gameWinner } from "./scoring";

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

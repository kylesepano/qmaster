import type { Game, ScoringRule } from "../types";

export type Side = "a" | "b";

export const scoringRuleLabel = (rule?: ScoringRule) =>
  rule === "lenient_31" ? "Lenient · First to 31" : "Standard · 21, cap 30";
export const scoringMax = (rule?: ScoringRule) =>
  rule === "lenient_31" ? 31 : 30;

function scoreError(a: number, b: number, rule: ScoringRule): string | null {
  if (rule === "lenient_31") {
    if (![a, b].every(Number.isInteger) || a < 0 || b < 0 || a > 31 || b > 31)
      return "Lenient scores must be whole numbers from 0 to 31.";
    if (a === 31 && b === 31)
      return "The first side to reach 31 wins. Both sides cannot finish at 31.";
    return null;
  }
  if (a > 30 || b > 30)
    return "Standard 21-point games are capped at 30. At 29–29, the next point wins.";
  if (![a, b].every(Number.isInteger) || a < 0 || b < 0 || a > 30 || b > 30)
    return "Scores must be whole numbers from 0 to 30.";
  const high = Math.max(a, b);
  const low = Math.min(a, b);
  if (a === 30 && b === 30) return "At 29–29, the next point ends the game.";
  if (high > 21 && (low < 20 || high - low > 2))
    return "This score continues past the point at which the game would have ended.";
  return null;
}

/** Evaluate the selected event rule: standard 21/cap 30 or lenient first to 31. */
export function gameWinner(
  a: number,
  b: number,
  rule: ScoringRule = "standard_21",
): Side | null {
  if (scoreError(a, b, rule)) return null;
  if (rule === "lenient_31") return a === 31 ? "a" : b === 31 ? "b" : null;
  if ((Math.max(a, b) >= 21 && Math.abs(a - b) >= 2) || Math.max(a, b) === 30)
    return a > b ? "a" : "b";
  return null;
}

/** A partial last game is allowed for the live scoreboard. Earlier games must be final. */
export function evaluateMatch(
  games: Game[],
  bestOf: 1 | 3,
  rule: ScoringRule = "standard_21",
): {
  winner: Side | null;
  gamesA: number;
  gamesB: number;
  error: string | null;
} {
  const result = {
    winner: null as Side | null,
    gamesA: 0,
    gamesB: 0,
    error: null as string | null,
  };
  const fail = (message: string) => ({ ...result, error: message });
  if (bestOf !== 1 && bestOf !== 3)
    return fail("Choose a single game or best of three.");
  if (games.length > bestOf)
    return fail(
      `This match allows at most ${bestOf} game${bestOf > 1 ? "s" : ""}.`,
    );
  const needed = Math.ceil(bestOf / 2);
  for (let index = 0; index < games.length; index++) {
    const game = games[index];
    if (game.game_no !== index + 1)
      return fail("Game numbers must be consecutive, starting at 1.");
    if (result.winner)
      return fail("Remove games entered after the match was already won.");
    const error = scoreError(game.score_a, game.score_b, rule);
    if (error) return fail(`Game ${index + 1}: ${error}`);
    const winner = gameWinner(game.score_a, game.score_b, rule);
    if (!winner && index < games.length - 1)
      return fail(`Finish game ${index + 1} before entering another game.`);
    if (winner === "a") result.gamesA++;
    if (winner === "b") result.gamesB++;
    if (result.gamesA === needed) result.winner = "a";
    if (result.gamesB === needed) result.winner = "b";
  }
  return result;
}

/** Start the next game at zero as soon as a valid game ends, unless the match is won. */
export function prepareNextGame(
  games: Game[],
  bestOf: 1 | 3,
  rule: ScoringRule = "standard_21",
): Game[] {
  const next = games.map((game) => ({ ...game }));
  const result = evaluateMatch(next, bestOf, rule);
  const last = next.at(-1);
  if (
    last &&
    !result.error &&
    !result.winner &&
    gameWinner(last.score_a, last.score_b, rule) &&
    next.length < bestOf
  ) {
    next.push({ game_no: next.length + 1, score_a: 0, score_b: 0 });
  }
  return next;
}

import type { Game } from "../types";

export type Side = "a" | "b";

function scoreError(a: number, b: number): string | null {
  if (![a, b].every(Number.isInteger) || a < 0 || b < 0 || a > 30 || b > 30)
    return "Scores must be whole numbers from 0 to 30.";
  const high = Math.max(a, b);
  const low = Math.min(a, b);
  if (a === 30 && b === 30) return "At 29–29, the next point ends the game.";
  if (high > 21 && (low < 20 || high - low > 2))
    return "This score continues past the point at which the game would have ended.";
  return null;
}

/** Standard 21-point badminton scoring, win by two, capped at 30. */
export function gameWinner(a: number, b: number): Side | null {
  if (scoreError(a, b)) return null;
  if ((Math.max(a, b) >= 21 && Math.abs(a - b) >= 2) || Math.max(a, b) === 30)
    return a > b ? "a" : "b";
  return null;
}

/** A partial last game is allowed for the live scoreboard. Earlier games must be final. */
export function evaluateMatch(
  games: Game[],
  bestOf: 1 | 3,
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
    const error = scoreError(game.score_a, game.score_b);
    if (error) return fail(`Game ${index + 1}: ${error}`);
    const winner = gameWinner(game.score_a, game.score_b);
    if (!winner && index < games.length - 1)
      return fail(`Finish game ${index + 1} before entering another game.`);
    if (winner === "a") result.gamesA++;
    if (winner === "b") result.gamesB++;
    if (result.gamesA === needed) result.winner = "a";
    if (result.gamesB === needed) result.winner = "b";
  }
  return result;
}

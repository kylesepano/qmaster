import type { PlayType } from "../types";

/** Time is an estimate; reserve only enough games to give everyone an equal final count. */
export function estimateRotation(
  hours: number,
  minutes: number,
  courts: number,
  playType: PlayType,
  played: number[],
) {
  const slots = playType === "singles" ? 2 : 4;
  const empty = { capacity: 0, matches: 0, target: 0, unused: 0, error: "" };
  if (
    !Number.isFinite(hours) ||
    hours < 0.25 ||
    hours > 24 ||
    Math.abs(hours * 100 - Math.round(hours * 100)) > 0.000001 ||
    !Number.isInteger(minutes) ||
    minutes < 1 ||
    minutes > 180 ||
    !Number.isInteger(courts) ||
    courts < 1 ||
    courts > 32
  )
    return {
      ...empty,
      error: "Enter 0.25–24 hours and 1–180 minutes per match.",
    };
  if (played.length < slots || played.length > 256)
    return {
      ...empty,
      error: `Register ${slots}–256 players for this rotation.`,
    };
  const capacity =
    Math.floor((Math.round(hours * 100) * 60) / (minutes * 100)) *
    Math.min(courts, Math.floor(played.length / slots));
  const total = played.reduce((sum, count) => sum + count, 0);
  const largest = Math.max(...played),
    smallest = Math.min(...played);
  let target = Math.floor((capacity * slots + total) / played.length);
  while (target >= largest && target > 0) {
    const appearances = played.length * target - total;
    const matches = appearances / slots;
    if (
      appearances % slots === 0 &&
      matches > 0 &&
      target - smallest <= matches
    ) {
      if (matches > 1000)
        return {
          ...empty,
          capacity,
          error:
            "This plan exceeds 1,000 games. Shorten the session or increase the match estimate.",
        };
      return {
        capacity,
        matches,
        target,
        unused: capacity - matches,
        error: "",
      };
    }
    target--;
  }
  return {
    ...empty,
    capacity,
    error:
      "Not enough time for equal match counts. Add hours, shorten the match estimate, or adjust the roster.",
  };
}

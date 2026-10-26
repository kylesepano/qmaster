import type { PlayType, QueueMember } from "../types";

/** Stable FIFO, excluding every player already on any active court. */
export function suggestNextPlayers(
  members: QueueMember[],
  playType: PlayType,
  busyPlayerIds: Iterable<string> = [],
): QueueMember[] {
  const busy = new Set(busyPlayerIds);
  const seen = new Set<string>();
  const waiting = [...members]
    .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id))
    .filter((member) => {
      if (
        member.status !== "waiting" ||
        busy.has(member.player_id) ||
        seen.has(member.player_id)
      )
        return false;
      seen.add(member.player_id);
      return true;
    });
  const required = playType === "singles" ? 2 : 4;
  return waiting.length >= required ? waiting.slice(0, required) : [];
}

/** Remove finished players, then append only those who opted to rejoin, in match order. */
export function rotateQueue(
  members: QueueMember[],
  finishedPlayerIds: string[],
): QueueMember[] {
  const finished = new Set(finishedPlayerIds);
  const remaining = members.filter((member) => !finished.has(member.player_id));
  let lastPosition = Math.max(0, ...members.map((member) => member.position));
  const returning = [...new Set(finishedPlayerIds)].flatMap((playerId) => {
    const member = members.find((item) => item.player_id === playerId);
    return member?.rejoin
      ? [{ ...member, status: "waiting" as const, position: ++lastPosition }]
      : [];
  });
  return [...remaining, ...returning].sort((a, b) => a.position - b.position);
}

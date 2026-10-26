import { describe, expect, it } from "vitest";
import type { QueueMember } from "../types";
import { rotateQueue, suggestNextPlayers } from "./queue";

function members(count: number): QueueMember[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `m${index}`,
    player_id: `p${index}`,
    session_id: "s",
    position: index + 1,
    status: "waiting",
    rejoin: true,
  }));
}
describe("queue selection and rotation", () => {
  it("suggests only the oldest eligible players even when storage order changes", () => {
    const queue = members(6).reverse();
    queue.find((m) => m.player_id === "p1")!.status = "playing";
    expect(
      suggestNextPlayers(queue, "singles", ["p0"]).map((m) => m.player_id),
    ).toEqual(["p2", "p3"]);
  });
  it("requires four distinct available players for doubles", () => {
    const queue = members(4);
    expect(suggestNextPlayers([...queue, queue[0]], "doubles")).toHaveLength(4);
    expect(suggestNextPlayers(queue, "doubles", ["p0"])).toEqual([]);
  });
  it("rotates participating players behind all current waiting players", () => {
    const queue = members(6);
    queue[0].status = queue[1].status = "playing";
    const rotated = rotateQueue(queue, ["p0", "p1"]);
    expect(rotated.map((m) => m.player_id)).toEqual([
      "p2",
      "p3",
      "p4",
      "p5",
      "p0",
      "p1",
    ]);
    expect(rotated.slice(-2).every((m) => m.status === "waiting")).toBe(true);
    expect(queue[0].status).toBe("playing");
  });
  it("honors opt-outs and prevents duplicated returners", () => {
    const queue = members(4);
    queue[1].rejoin = false;
    expect(
      rotateQueue(queue, ["p0", "p1", "p0"]).map((m) => m.player_id),
    ).toEqual(["p2", "p3", "p0"]);
  });
});

import { describe, expect, it } from "vitest";
import { estimateRotation } from "./rotation";

describe("equal-play rotation capacity", () => {
  it("uses session hours, courts and the 15-minute match estimate", () => {
    expect(
      estimateRotation(2, 15, 2, "doubles", Array(8).fill(0)),
    ).toMatchObject({
      capacity: 16,
      matches: 16,
      target: 8,
      unused: 0,
      error: "",
    });
    expect(
      estimateRotation(1, 15, 2, "doubles", Array(8).fill(0)),
    ).toMatchObject({ capacity: 8, matches: 8, target: 4 });
    expect(
      estimateRotation(2, 30, 2, "doubles", Array(8).fill(0)),
    ).toMatchObject({ capacity: 8, matches: 8, target: 4 });
  });
  it("leaves spare capacity instead of giving some players extra matches", () => {
    expect(
      estimateRotation(2, 15, 2, "doubles", Array(10).fill(0)),
    ).toMatchObject({ capacity: 16, matches: 15, target: 6, unused: 1 });
    expect(
      estimateRotation(2, 15, 2, "doubles", Array(9).fill(0)),
    ).toMatchObject({ capacity: 16, matches: 9, target: 4, unused: 7 });
  });
  it("limits usable courts by roster size and handles singles", () => {
    expect(
      estimateRotation(1, 15, 3, "doubles", Array(4).fill(0)),
    ).toMatchObject({ capacity: 4, matches: 4, target: 4 });
    expect(
      estimateRotation(1, 15, 3, "singles", Array(6).fill(0)),
    ).toMatchObject({ capacity: 12, matches: 12, target: 4 });
  });
  it("counts previous session appearances toward the equal final target", () => {
    expect(
      estimateRotation(1, 15, 2, "doubles", [2, 2, 2, 2, 0, 0, 0, 0]),
    ).toMatchObject({ capacity: 8, matches: 8, target: 5 });
    expect(
      estimateRotation(0.25, 15, 1, "doubles", [8, 0, 0, 0, 0]),
    ).toMatchObject({ matches: 0 });
  });
  it("rejects impossible time budgets and invalid inputs", () => {
    for (const [hours, minutes] of [
      [0, 15],
      [25, 15],
      [2, 0],
      [2, 181],
      [2, 2.5],
      [NaN, 15],
    ])
      expect(
        estimateRotation(hours, minutes, 2, "doubles", [0, 0, 0, 0]).error,
      ).toBeTruthy();
    expect(estimateRotation(2, 15, 2, "doubles", [0, 0, 0]).error).toBeTruthy();
    expect(
      estimateRotation(0.25, 15, 1, "doubles", Array(5).fill(0)).error,
    ).toBeTruthy();
  });
  it("avoids decimal-hour rounding errors at exact match boundaries", () => {
    expect(estimateRotation(2.05, 3, 1, "singles", [0, 0])).toMatchObject({
      capacity: 41,
      matches: 41,
      target: 41,
    });
  });
});

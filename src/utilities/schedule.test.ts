import { describe, expect, it } from "vitest";
import {
  todayEventDate,
  eventStart,
  eventPhase,
  scheduleLabel,
  compareScheduledEvents,
} from "./schedule";

describe("public event schedules", () => {
  const now = Date.parse("2026-10-26T08:00:00Z");
  it("uses UTC+8 for dates and times, including UTC day boundaries", () => {
    expect(todayEventDate(new Date("2026-10-26T17:30:00Z"))).toBe("2026-10-27");
    expect(eventStart({ event_date: "2026-10-27", start_time: "00:30" })).toBe(
      Date.parse("2026-10-26T16:30:00Z"),
    );
    expect(
      scheduleLabel({ event_date: "2026-10-27", start_time: "19:30:00" }),
    ).toBe("Oct 27, 2026 · 7:30 PM (UTC+8)");
  });
  it("marks future sessions upcoming and preserves live and history states", () => {
    const event = {
      event_date: "2026-10-27",
      start_time: "19:30",
      status: "ongoing",
    };
    expect(eventPhase(event, false, now)).toBe("upcoming");
    expect(eventPhase(event, true, now)).toBe("ongoing");
    expect(eventPhase({ ...event, status: "completed" }, false, now)).toBe(
      "completed",
    );
    expect(
      eventPhase(
        { ...event, status: "draft" },
        false,
        Date.parse("2026-11-01"),
      ),
    ).toBe("upcoming");
    expect(eventPhase(event, false, Date.parse("2026-10-28"))).toBe("ongoing");
  });
  it("shows unknown legacy times without inventing schedules from creation timestamps", () => {
    expect(scheduleLabel({})).toBe("Schedule to be announced");
    expect(scheduleLabel({ event_date: "2026-10-27" })).toBe(
      "Oct 27, 2026 · Time to be announced",
    );
    expect(eventStart({ event_date: "invalid" })).toBeNull();
  });
  it("sorts upcoming events by nearest scheduled start instead of creation order", () => {
    const events = [
      {
        event_date: "2026-10-29",
        start_time: "08:00",
        phase: "upcoming" as const,
      },
      {
        event_date: "2026-10-28",
        start_time: "20:00",
        phase: "upcoming" as const,
      },
      {
        event_date: "2026-10-28",
        start_time: "09:00",
        phase: "upcoming" as const,
      },
    ];
    expect(
      events
        .sort(compareScheduledEvents)
        .map((e) => `${e.event_date} ${e.start_time}`),
    ).toEqual(["2026-10-28 09:00", "2026-10-28 20:00", "2026-10-29 08:00"]);
  });
});

export interface EventSchedule {
  event_date?: string | null;
  start_time?: string | null;
  status?: string;
}
export type EventPhase = "upcoming" | "ongoing" | "completed";
export const PHASE_LABELS: Record<EventPhase, string> = {
  upcoming: "Upcoming",
  ongoing: "Live now",
  completed: "Completed",
};

/** Event schedules use the club's explicit UTC+8 timezone, independent of the viewer's device. */
export function todayEventDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Singapore",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
export function eventStart(event: EventSchedule): number | null {
  if (!event.event_date) return null;
  const time = event.start_time ?? "00:00:00";
  const value = Date.parse(
    `${event.event_date}T${time.length === 5 ? `${time}:00` : time}+08:00`,
  );
  return Number.isFinite(value) ? value : null;
}
export function scheduleLabel(event: EventSchedule): string {
  const start = eventStart(event);
  if (start === null) return "Schedule to be announced";
  const date = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Singapore",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(start);
  if (!event.start_time) return `${date} · Time to be announced`;
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Singapore",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(start);
  return `${date} · ${time} (UTC+8)`;
}
export function eventPhase(
  event: EventSchedule,
  hasLiveMatch = false,
  now = Date.now(),
): EventPhase {
  if (event.status === "completed") return "completed";
  if (hasLiveMatch) return "ongoing";
  const start = eventStart(event);
  if (event.status === "draft" || (start !== null && start > now))
    return "upcoming";
  return "ongoing";
}
export function compareScheduledEvents(
  a: EventSchedule & { phase: EventPhase; created_at?: string },
  b: EventSchedule & { phase: EventPhase; created_at?: string },
) {
  const rank = { ongoing: 0, upcoming: 1, completed: 2 };
  const order = rank[a.phase] - rank[b.phase];
  if (order) return order;
  const av = eventStart(a),
    bv = eventStart(b);
  if (a.phase === "upcoming")
    return (
      (av ?? Infinity) - (bv ?? Infinity) ||
      (a.created_at ?? "").localeCompare(b.created_at ?? "")
    );
  return (
    (bv ?? (Date.parse(b.created_at ?? "") || 0)) -
    (av ?? (Date.parse(a.created_at ?? "") || 0))
  );
}

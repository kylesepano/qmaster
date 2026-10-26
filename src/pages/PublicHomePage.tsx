import { useCallback } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowRight,
  CalendarDays,
  Grid2X2,
  Search,
  Trophy,
  UsersRound,
} from "lucide-react";
import { PublicLayout } from "../components/PublicLayout";
import { Badge, EmptyState, dateLabel } from "../components/ui";
import { loadPublicDirectory, loadPublicSessions } from "../services/api";
import { usePublicData } from "../hooks/usePublicData";
import { FORMAT_LABELS } from "../types";

export function PublicHomePage() {
  const [params, setParams] = useSearchParams();
  const sessionsView = params.get("view") === "sessions";
  const status = params.get("status") ?? "all";
  const search = params.get("q") ?? "";
  const loader = useCallback(
    async () =>
      sessionsView
        ? { directory: null, sessions: await loadPublicSessions() }
        : { directory: await loadPublicDirectory(), sessions: null },
    [sessionsView],
  );
  const { data, error, loading, live, refresh } = usePublicData(
    loader,
    sessionsView
      ? ["queue_sessions"]
      : ["tournaments", "tournament_matches", "tournament_entries"],
  );
  function filter(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value && value !== "all") next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  }
  const visible = (item: { name: string; status: string }) =>
    item.name.toLowerCase().includes(search.toLowerCase()) &&
    (status === "all" || item.status === status);
  const rank: Record<string, number> = { ongoing: 0, draft: 1, completed: 2 };
  const tournaments = [...(data?.directory?.tournaments ?? [])]
    .filter(visible)
    .sort(
      (a, b) =>
        rank[a.status] - rank[b.status] ||
        b.event_date.localeCompare(a.event_date),
    );
  const sessions = [...(data?.sessions ?? [])]
    .filter(visible)
    .sort(
      (a, b) =>
        rank[a.status] - rank[b.status] ||
        b.created_at.localeCompare(a.created_at),
    );
  return (
    <PublicLayout live={live}>
      <section className="spectator-hero">
        <div>
          <span className="eyebrow">THE CLUB, AT A GLANCE</span>
          <h1>{sessionsView ? "Queue sessions" : "Tournaments"}</h1>
          <p>
            Follow the action, check the scores, and catch up on the results. No
            account needed.
          </p>
        </div>
        <div className="spectator-hero-mark">
          {sessionsView ? <Grid2X2 size={45} /> : <Trophy size={45} />}
        </div>
      </section>
      <div className="list-toolbar standalone public-filters">
        <div className="tab-buttons" aria-label="Event status">
          {[
            ["all", "All events"],
            ["ongoing", "Live now"],
            ...(!sessionsView ? [["draft", "Upcoming"]] : []),
            ["completed", "History"],
          ].map(([value, label]) => (
            <button
              key={value}
              className={status === value ? "selected" : ""}
              onClick={() => filter("status", value)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="search-input">
          <Search size={17} />
          <input
            aria-label="Search events"
            placeholder={
              sessionsView ? "Search sessions…" : "Search tournaments…"
            }
            value={search}
            onChange={(e) => filter("q", e.target.value)}
          />
        </div>
      </div>
      {loading ? (
        <div className="card empty-state" role="status">
          Loading events…
        </div>
      ) : error ? (
        <div className="error-banner" role="alert">
          <span>We couldn’t load the latest events. Please try again.</span>
          <button className="btn" onClick={() => void refresh()}>
            Retry
          </button>
        </div>
      ) : !(sessionsView ? sessions.length : tournaments.length) ? (
        <section className="card">
          <EmptyState
            title={
              search || status !== "all"
                ? "No events match your filters"
                : sessionsView
                  ? "No public sessions yet"
                  : "No public tournaments yet"
            }
          >
            {search || status !== "all"
              ? "Try another name or choose All events."
              : "Published events will appear here. Check back for the next game."}
          </EmptyState>
        </section>
      ) : (
        <div className="grid-3 public-event-grid">
          {sessionsView
            ? sessions.map((session) => {
                const playing = session.matches.filter(
                  (m) => m.status === "playing",
                ).length;
                const completed = session.matches.filter(
                  (m) => m.status === "completed",
                ).length;
                return (
                  <Link
                    key={session.id}
                    to={`/public/sessions/${session.id}`}
                    className="card public-event-card"
                  >
                    <div className="card-header">
                      <span className="event-icon">
                        <Grid2X2 size={23} />
                      </span>
                      <Badge tone={session.status === "ongoing" ? "green" : ""}>
                        {session.status === "ongoing"
                          ? "Live now"
                          : "Completed"}
                      </Badge>
                    </div>
                    <h2>{session.name}</h2>
                    <p className="muted">
                      {session.play_type} ·{" "}
                      {session.best_of === 3 ? "Best of 3" : "One game"}
                    </p>
                    <div className="tournament-meta">
                      <span>
                        <CalendarDays size={15} />
                        {dateLabel(session.created_at)}
                      </span>
                      <span>
                        <Grid2X2 size={15} />
                        {session.court_count} courts
                      </span>
                      <span>
                        <UsersRound size={15} />
                        {session.waiting.length} waiting
                      </span>
                    </div>
                    <div className="event-progress">
                      <strong>{playing} matches in play</strong>
                      <span>{completed} completed</span>
                    </div>
                    <div className="tournament-card-footer">
                      <span>Courts, queue & results</span>
                      <ArrowRight size={17} />
                    </div>
                  </Link>
                );
              })
            : tournaments.map((t) => {
                const entries = data!.directory!.entries.filter(
                  (e) => e.tournament_id === t.id,
                );
                const matches = data!.directory!.matches.filter(
                  (m) =>
                    m.tournament_id === t.id &&
                    !["bye", "skipped"].includes(m.status),
                );
                const played = matches.filter(
                  (m) => m.status === "completed",
                ).length;
                const champion = entries.find(
                  (e) => e.id === t.champion_entry_id,
                );
                return (
                  <Link
                    key={t.id}
                    to={`/public/tournaments/${t.id}`}
                    className="card public-event-card"
                  >
                    <div className="card-header">
                      <span className="event-icon">
                        <Trophy size={23} />
                      </span>
                      <Badge
                        tone={
                          t.status === "ongoing"
                            ? "green"
                            : t.status === "completed"
                              ? "blue"
                              : ""
                        }
                      >
                        {t.status === "ongoing"
                          ? "Live now"
                          : t.status === "draft"
                            ? "Upcoming"
                            : "Completed"}
                      </Badge>
                    </div>
                    <h2>{t.name}</h2>
                    <p className="muted">
                      {FORMAT_LABELS[t.format]} · {t.play_type}
                    </p>
                    <div className="tournament-meta">
                      <span>
                        <CalendarDays size={15} />
                        {dateLabel(t.event_date)}
                      </span>
                      <span>
                        <UsersRound size={15} />
                        {entries.length} entries
                      </span>
                      {t.venue && <span>{t.venue}</span>}
                    </div>
                    <div className="event-progress">
                      <strong>
                        {champion
                          ? `Champion: ${champion.name}`
                          : `${played} of ${matches.length} matches completed`}
                      </strong>
                      <span>
                        {matches.filter((m) => m.status === "playing").length}{" "}
                        live
                      </span>
                    </div>
                    <progress
                      className="event-progress-bar"
                      aria-label={`${t.name} progress`}
                      value={played}
                      max={Math.max(matches.length, 1)}
                    />
                    <div className="tournament-card-footer">
                      <span>View bracket & results</span>
                      <ArrowRight size={17} />
                    </div>
                  </Link>
                );
              })}
        </div>
      )}
      <p className="public-footnote">
        Live progress and past results are shared by the event organizer.
      </p>
    </PublicLayout>
  );
}

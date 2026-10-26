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
import { Badge, EmptyState } from "../components/ui";
import { loadPublicDirectory, loadPublicSessions } from "../services/api";
import { usePublicData } from "../hooks/usePublicData";
import { FORMAT_LABELS, SPORT_LABELS, type Sport } from "../types";
import { SportFilter } from "../components/SportField";
import { scoringRuleLabel } from "../utilities/scoring";
import {
  scheduleLabel,
  eventPhase,
  compareScheduledEvents,
  PHASE_LABELS,
  type EventPhase,
} from "../utilities/schedule";

export function PublicHomePage() {
  const [params, setParams] = useSearchParams();
  const sessionsView = params.get("view") === "sessions";
  const status = params.get("status") ?? "all";
  const search = params.get("q") ?? "";
  const sport = (params.get("sport") ?? "all") as Sport | "all";
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
  const visible = (item: { name: string; phase: EventPhase; sport?: Sport }) =>
    (sport === "all" || (item.sport ?? "badminton") === sport) &&
    item.name.toLowerCase().includes(search.toLowerCase()) &&
    (status === "all" ||
      item.phase === (status === "draft" ? "upcoming" : status));
  const tournaments = [...(data?.directory?.tournaments ?? [])]
    .map((t) => ({
      ...t,
      phase: eventPhase(
        t,
        data?.directory?.matches.some(
          (m) => m.tournament_id === t.id && m.status === "playing",
        ),
      ),
    }))
    .filter(visible)
    .sort(compareScheduledEvents);
  const sessions = [...(data?.sessions ?? [])]
    .map((s) => ({
      ...s,
      phase: eventPhase(
        s,
        s.matches.some((m) => m.status === "playing"),
      ),
    }))
    .filter(visible)
    .sort(compareScheduledEvents);
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
        <SportFilter
          value={sport}
          onChange={(value) => filter("sport", value)}
        />
        <div className="tab-buttons" aria-label="Event status">
          {[
            ["all", "All events"],
            ["ongoing", "Live now"],
            ["upcoming", "Upcoming"],
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
                      <Badge tone={session.phase === "ongoing" ? "green" : ""}>
                        {PHASE_LABELS[session.phase]}
                      </Badge>
                    </div>
                    <h2>{session.name}</h2>
                    <p className="muted">
                      {SPORT_LABELS[session.sport ?? "badminton"]} ·{" "}
                      {session.play_type} ·{" "}
                      {session.best_of === 3 ? "Best of 3" : "One game"} ·{" "}
                      {scoringRuleLabel(session.scoring_rule)}
                    </p>
                    {session.mode === "bracket" && (
                      <Badge tone="blue">
                        Bracket ·{" "}
                        {
                          FORMAT_LABELS[
                            session.bracket_format ?? "single_elimination"
                          ]
                        }
                      </Badge>
                    )}
                    <div className="tournament-meta">
                      <span>
                        <CalendarDays size={15} />
                        {scheduleLabel(session)}
                      </span>
                      <span>
                        <Grid2X2 size={15} />
                        {session.court_count} courts
                      </span>
                      <span>
                        <UsersRound size={15} />
                        {session.mode === "bracket"
                          ? `${session.teams?.length ?? 0} entries`
                          : `${session.waiting.length} waiting`}
                      </span>
                    </div>
                    <div className="event-progress">
                      <strong>{playing} matches in play</strong>
                      <span>{completed} completed</span>
                    </div>
                    <div className="tournament-card-footer">
                      <span>
                        {session.mode === "bracket"
                          ? "Bracket, courts & results"
                          : "Courts, queue & results"}
                      </span>
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
                          t.phase === "ongoing"
                            ? "green"
                            : t.status === "completed"
                              ? "blue"
                              : ""
                        }
                      >
                        {PHASE_LABELS[t.phase]}
                      </Badge>
                    </div>
                    <h2>{t.name}</h2>
                    <p className="muted">
                      {SPORT_LABELS[t.sport ?? "badminton"]} ·{" "}
                      {FORMAT_LABELS[t.format]} · {t.play_type}
                    </p>
                    <div className="tournament-meta">
                      <span>
                        <CalendarDays size={15} />
                        {scheduleLabel(t)}
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

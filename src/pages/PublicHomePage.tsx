import { Link, Navigate, useSearchParams } from "react-router-dom";
import { ArrowRight, CalendarDays, Grid2X2, Trophy, Radio } from "lucide-react";
import { PublicLayout } from "../components/PublicLayout";
import { Badge, EmptyState } from "../components/ui";
import { usePublicData } from "../hooks/usePublicData";
import { loadPublicDirectory, loadPublicSessions } from "../services/api";
import { SPORT_LABELS } from "../types";
import {
  eventPhase,
  scheduleLabel,
  compareScheduledEvents,
} from "../utilities/schedule";

async function loadHome() {
  const [directory, sessions] = await Promise.all([
    loadPublicDirectory(),
    loadPublicSessions(),
  ]);
  return [
    ...sessions.map((s) => ({
      ...s,
      kind: "Session",
      href: `/public/sessions/${s.id}`,
      playing: s.matches.filter((m) => m.status === "playing").length,
    })),
    ...directory.tournaments.map((t) => ({
      ...t,
      kind: "Tournament",
      href: `/public/tournaments/${t.id}`,
      playing: directory.matches.filter(
        (m) => m.tournament_id === t.id && m.status === "playing",
      ).length,
    })),
  ]
    .map((e) => ({ ...e, phase: eventPhase(e, e.playing > 0) }))
    .sort(compareScheduledEvents);
}

function HomeOverview() {
  const { data, loading, error, live, refresh } = usePublicData(loadHome, [
    "queue_sessions",
    "tournaments",
    "tournament_matches",
    "tournament_entries",
  ]);
  const ongoing = data?.filter((e) => e.phase === "ongoing") ?? [];
  const upcoming = data?.filter((e) => e.phase === "upcoming") ?? [];
  const liveGames = data?.reduce((sum, e) => sum + e.playing, 0) ?? 0;
  return (
    <PublicLayout live={live}>
      <section className="spectator-hero">
        <div>
          <span className="eyebrow">WELCOME TO THE COURT</span>
          <h1>Qmaster</h1>
          <p>
            Follow live games, find upcoming sessions and tournaments, and check
            player results.
          </p>
          <div className="button-row home-actions">
            <Link className="btn primary" to="/public/games">
              <Radio size={16} />
              View live games
            </Link>
            <Link className="btn" to="/public/sessions">
              Browse sessions <ArrowRight size={16} />
            </Link>
          </div>
        </div>
        <div className="spectator-hero-mark">
          <Grid2X2 size={45} />
        </div>
      </section>
      {loading ? (
        <div className="card empty-state" role="status">
          Loading events…
        </div>
      ) : error ? (
        <div className="error-banner" role="alert">
          We couldn’t load the latest events.
          <button className="btn small" onClick={() => void refresh()}>
            Retry
          </button>
        </div>
      ) : (
        <>
          <div className="grid-3 home-summary">
            <Link className="card public-event-card" to="/public/games">
              <span className="muted">Live games</span>
              <h2>{liveGames}</h2>
              <span className="text-link">
                See the scores <ArrowRight size={15} />
              </span>
            </Link>
            <Link
              className="card public-event-card"
              to="/public/sessions?status=upcoming"
            >
              <span className="muted">Upcoming sessions</span>
              <h2>{upcoming.filter((e) => e.kind === "Session").length}</h2>
              <span className="text-link">
                Find your next session <ArrowRight size={15} />
              </span>
            </Link>
            <Link className="card public-event-card" to="/public/tournaments">
              <span className="muted">Tournaments</span>
              <h2>
                {data?.filter((e) => e.kind === "Tournament").length ?? 0}
              </h2>
              <span className="text-link">
                Brackets & results <ArrowRight size={15} />
              </span>
            </Link>
          </div>
          {[
            {
              title: "On now",
              events: ongoing,
              empty: "No events in progress",
              description: "Live sessions and tournaments will appear here.",
            },
            {
              title: "Coming up",
              events: upcoming,
              empty: "No upcoming events yet",
              description: "Published event schedules will appear here.",
            },
          ].map((section) => (
            <section className="section-block" key={section.title}>
              <div className="section-heading">
                <h2>{section.title}</h2>
              </div>
              {section.events.length ? (
                <div className="grid-3 public-event-grid">
                  {section.events.slice(0, 6).map((e) => (
                    <Link
                      key={e.id}
                      to={e.href}
                      className="card public-event-card"
                    >
                      <div className="card-header">
                        <span className="event-icon">
                          {e.kind === "Tournament" ? (
                            <Trophy size={23} />
                          ) : (
                            <Grid2X2 size={23} />
                          )}
                        </span>
                        <Badge tone={e.phase === "ongoing" ? "green" : ""}>
                          {e.phase === "ongoing" ? "In progress" : "Upcoming"}
                        </Badge>
                      </div>
                      <h3>{e.name}</h3>
                      <p className="muted">
                        {SPORT_LABELS[e.sport ?? "badminton"]} · {e.kind}
                      </p>
                      <p className="muted">
                        <CalendarDays size={14} /> {scheduleLabel(e)}
                      </p>
                      <div className="tournament-card-footer">
                        <span>
                          {e.playing
                            ? `${e.playing} matches in play`
                            : "View event"}
                        </span>
                        <ArrowRight size={16} />
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="card">
                  <EmptyState title={section.empty}>
                    {section.description}
                  </EmptyState>
                </div>
              )}
            </section>
          ))}
          <div className="button-row">
            <Link className="btn" to="/public/players">
              Players & standings
            </Link>
            <Link className="btn" to="/public/sessions?status=completed">
              Session history
            </Link>
            <Link className="btn" to="/public/tournaments?status=completed">
              Tournament history
            </Link>
          </div>
        </>
      )}
    </PublicLayout>
  );
}

export function PublicHomePage() {
  const [params] = useSearchParams();
  // Keep links shared before directories moved off the home page working.
  if (
    params.has("view") ||
    params.has("status") ||
    params.has("q") ||
    params.has("sport")
  ) {
    const next = new URLSearchParams(params),
      sessions = params.get("view") === "sessions";
    next.delete("view");
    return (
      <Navigate
        replace
        to={`/public/${sessions ? "sessions" : "tournaments"}${next.size ? `?${next}` : ""}`}
      />
    );
  }
  return <HomeOverview />;
}

import { useCallback } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Grid2X2, UsersRound } from "lucide-react";
import { PublicLayout } from "../components/PublicLayout";
import { Badge, EmptyState, PageHeader, dateLabel } from "../components/ui";
import { loadPublicSessions } from "../services/api";
import { usePublicData } from "../hooks/usePublicData";
import type { PublicSessionMatch } from "../types";

function SessionMatch({ match }: { match: PublicSessionMatch }) {
  return (
    <article className="card public-match-result">
      <div className="card-header">
        <h3>Court {match.court_no}</h3>
        <Badge tone={match.status === "playing" ? "green" : ""}>
          {match.status === "playing" ? "Playing" : "Completed"}
        </Badge>
      </div>
      {(["a", "b"] as const).map((side) => (
        <div
          className={`public-score-row ${match.winner_side === side ? "winner-name" : ""}`}
          key={side}
        >
          <strong>{side === "a" ? match.side_a : match.side_b}</strong>
          <span>
            {match.games
              .map((g) => (side === "a" ? g.score_a : g.score_b))
              .join(" / ") || "–"}
          </span>
        </div>
      ))}
      {match.winner_side && (
        <p className="public-match-winner">
          {match.winner_side === "a" ? match.side_a : match.side_b} won
          {match.walkover ? " by walkover" : ""}
        </p>
      )}
      {match.completed_at && (
        <small className="muted">
          {dateLabel(match.completed_at)} ·{" "}
          {new Date(match.completed_at).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </small>
      )}
    </article>
  );
}
export function PublicSessionPage() {
  const { id } = useParams();
  const loader = useCallback(() => loadPublicSessions(id!), [id]);
  const { data, loading, error, live, refresh } = usePublicData(
    loader,
    ["queue_sessions"],
    `id=eq.${id}`,
  );
  const session = data?.[0];
  const active = session?.matches.filter((m) => m.status === "playing") ?? [];
  const completed =
    session?.matches
      .filter((m) => m.status === "completed")
      .sort((a, b) =>
        (b.completed_at ?? "").localeCompare(a.completed_at ?? ""),
      ) ?? [];
  return (
    <PublicLayout live={live}>
      <Link className="back-link" to="/?view=sessions">
        <ArrowLeft size={16} />
        All queue sessions
      </Link>
      {loading ? (
        <div className="empty-state">Loading session…</div>
      ) : error ? (
        <div className="error-banner" role="alert">
          We couldn’t load this session.
          <button className="btn" onClick={() => void refresh()}>
            Retry
          </button>
        </div>
      ) : !session ? (
        <section className="card">
          <EmptyState title="This session is private or unavailable">
            Ask the organizer to publish this session.
          </EmptyState>
        </section>
      ) : (
        <>
          <PageHeader
            title={session.name}
            subtitle={`${session.play_type} · ${session.best_of === 3 ? "Best of 3" : "One game"} · ${dateLabel(session.created_at)}`}
            eyebrow="QUEUE SESSION"
            actions={
              <Badge tone={session.status === "ongoing" ? "green" : ""}>
                {session.status === "ongoing" ? "Live now" : "Completed"}
              </Badge>
            }
          />
          <div className="section-heading">
            <h2>
              <Grid2X2 size={18} /> On court now
            </h2>
            <span className="muted small-text">
              {active.length} playing · {session.court_count - active.length}{" "}
              available
            </span>
          </div>
          <div className="court-grid">
            {Array.from({ length: session.court_count }, (_, i) => {
              const match = active.find((m) => m.court_no === i + 1);
              return match ? (
                <SessionMatch key={i} match={match} />
              ) : (
                <article className="card court-card" key={i}>
                  <div className="card-header">
                    <h3>Court {i + 1}</h3>
                    <Badge tone={session.status === "completed" ? "" : "green"}>
                      {session.status === "completed"
                        ? "Finished"
                        : "Available"}
                    </Badge>
                  </div>
                  <p className="muted">
                    {session.status === "completed"
                      ? "Session complete"
                      : "Ready for the next match"}
                  </p>
                </article>
              );
            })}
          </div>
          <section className="card section-block">
            <div className="card-header">
              <h2>
                <UsersRound size={18} />
                Waiting queue
              </h2>
              <Badge>{session.waiting.length} players</Badge>
            </div>
            {session.waiting.length ? (
              <ol className="public-waiting-list">
                {session.waiting.map((member, i) => (
                  <li key={i}>
                    <span className="seed-number">{i + 1}</span>
                    {member.name}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="muted">
                {session.status === "completed"
                  ? "This session has ended."
                  : "No players waiting."}
              </p>
            )}
          </section>
          <section className="section-block">
            <div className="section-heading">
              <h2>Match history</h2>
              <span className="muted small-text">
                {completed.length} completed
              </span>
            </div>
            {completed.length ? (
              <div className="grid-3">
                {completed.map((m) => (
                  <SessionMatch key={m.id} match={m} />
                ))}
              </div>
            ) : (
              <div className="card">
                <EmptyState title="Results are on their way">
                  Completed matches will appear here.
                </EmptyState>
              </div>
            )}
          </section>
        </>
      )}
    </PublicLayout>
  );
}

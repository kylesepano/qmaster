import { Link } from "react-router-dom";
import { PublicLayout } from "../components/PublicLayout";
import { Badge, EmptyState } from "../components/ui";
import { usePublicData } from "../hooks/usePublicData";
import {
  loadPublicDirectory,
  loadPublicSessions,
  loadPublicTournament,
} from "../services/api";

async function loadGames() {
  const [directory, sessions] = await Promise.all([
    loadPublicDirectory(),
    loadPublicSessions(),
  ]);
  const tournaments = await Promise.all(
    directory.tournaments
      .filter(
        (t) =>
          t.status === "ongoing" &&
          directory.matches.some(
            (m) => m.tournament_id === t.id && m.status === "playing",
          ),
      )
      .map((t) => loadPublicTournament(t.id)),
  );
  return [
    ...sessions
      .filter((s) => s.status === "ongoing")
      .flatMap((s) =>
        s.matches
          .filter((m) => m.status === "playing")
          .map((m) => ({
            id: m.id,
            event: s.name,
            href: `/public/sessions/${s.id}`,
            court: m.court_no,
            a: m.side_a,
            b: m.side_b,
            games: m.games,
          })),
      ),
    ...tournaments.flatMap((t) =>
      t.tournament?.published
        ? t.matches
            .filter((m) => m.status === "playing")
            .map((m) => ({
              id: m.id,
              event: t.tournament!.name,
              href: `/public/tournaments/${t.tournament!.id}`,
              court: m.court_no,
              a: t.entries.find((e) => e.id === m.entry_a_id)?.name ?? "Side A",
              b: t.entries.find((e) => e.id === m.entry_b_id)?.name ?? "Side B",
              games: t.games.filter((g) => g.tournament_match_id === m.id),
            }))
        : [],
    ),
  ];
}

export function PublicGamesPage() {
  const { data, loading, error, live, refresh } = usePublicData(loadGames, [
    "queue_sessions",
    "queue_matches",
    "tournaments",
    "tournament_entries",
    "tournament_matches",
    "match_games",
  ]);
  return (
    <PublicLayout live={live}>
      <section className="spectator-hero">
        <div>
          <span className="eyebrow">ON COURT NOW</span>
          <h1>Games</h1>
          <p>
            Follow live games and scores from public sessions and tournaments.
          </p>
        </div>
      </section>
      {loading ? (
        <div className="card empty-state" role="status">
          Loading games…
        </div>
      ) : error ? (
        <div className="error-banner" role="alert">
          We couldn’t load the live games.{" "}
          <button className="btn small" onClick={() => void refresh()}>
            Try again
          </button>
        </div>
      ) : !data?.length ? (
        <section className="card">
          <EmptyState title="No live games right now">
            Games appear here when a match starts in a published session or
            tournament.
          </EmptyState>
        </section>
      ) : (
        <div className="grid-3">
          {data.map((m) => (
            <Link key={m.id} to={m.href} className="card public-event-card">
              <div className="card-header">
                <h2>{m.event}</h2>
                <Badge tone="green">Playing</Badge>
              </div>
              <p className="muted">Court {m.court}</p>
              {(["a", "b"] as const).map((side) => (
                <div className="public-score-row" key={side}>
                  <strong>{m[side]}</strong>
                  <span>
                    {m.games
                      .map((g) => (side === "a" ? g.score_a : g.score_b))
                      .join(" / ") || "0"}
                  </span>
                </div>
              ))}
              <div className="tournament-card-footer">View event & results</div>
            </Link>
          ))}
        </div>
      )}
    </PublicLayout>
  );
}

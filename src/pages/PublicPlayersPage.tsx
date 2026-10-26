import { useCallback, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, Search, UsersRound } from "lucide-react";
import { PublicLayout } from "../components/PublicLayout";
import { Badge, EmptyState, PageHeader, dateLabel } from "../components/ui";
import { usePublicData } from "../hooks/usePublicData";
import { loadPublicPlayers } from "../services/api";
import type { PublicPlayer, PublicPlayerMatch } from "../types";

function Record({ player }: { player: PublicPlayer }) {
  const played = player.wins + player.losses;
  return (
    <div className="public-player-record">
      <div>
        <strong>{player.wins}</strong>
        <span>Wins</span>
      </div>
      <div>
        <strong>{player.losses}</strong>
        <span>Losses</span>
      </div>
      <div>
        <strong>{played}</strong>
        <span>Played</span>
      </div>
      <div>
        <strong>
          {played ? Math.round((player.wins / played) * 100) : 0}%
        </strong>
        <span>Win rate</span>
      </div>
    </div>
  );
}
function HistoryMatch({ match }: { match: PublicPlayerMatch }) {
  return (
    <article className="card player-history-match">
      <div className="card-header">
        <div>
          <h3>{match.event_name}</h3>
          <p>
            {match.kind === "queue" ? "Queue session" : "Tournament"} ·{" "}
            {match.play_type === "mixed" ? "Mixed doubles" : match.play_type} ·{" "}
            {dateLabel(match.completed_at)}
          </p>
        </div>
        <Badge tone={match.result === "win" ? "green" : ""}>
          {match.result === "win" ? "Win" : "Loss"}
        </Badge>
      </div>
      <div className="player-history-teams">
        <div>
          <strong>{match.side_a}</strong>
          <small>{match.players_a.join(" / ")}</small>
        </div>
        <span className="muted">vs</span>
        <div>
          <strong>{match.side_b}</strong>
          <small>{match.players_b.join(" / ")}</small>
        </div>
      </div>
      <div className="match-card-footer">
        <span>
          {match.walkover
            ? "Walkover"
            : match.games.map((g) => `${g.score_a}–${g.score_b}`).join(", ")}
          {match.court_no ? ` · Court ${match.court_no}` : ""}
        </span>
        <Link
          className="text-link"
          to={`/public/${match.kind === "queue" ? "sessions" : "tournaments"}/${match.event_id}`}
        >
          View event <ArrowRight size={14} />
        </Link>
      </div>
    </article>
  );
}
export function PublicPlayersPage() {
  const { id } = useParams();
  const loader = useCallback(() => loadPublicPlayers(id), [id]);
  const { data, loading, error, live, refresh } = usePublicData(loader, [
    "tournaments",
    "tournament_matches",
    "tournament_entries",
    "queue_sessions",
  ]);
  const [search, setSearch] = useState(""),
    [sort, setSort] = useState("name"),
    [result, setResult] = useState("all"),
    [kind, setKind] = useState("all");
  const players = [...(data ?? [])]
    .filter((p) => p.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) =>
      sort === "wins"
        ? b.wins - a.wins || a.losses - b.losses || a.name.localeCompare(b.name)
        : a.name.localeCompare(b.name),
    );
  const player = data?.[0];
  const matches =
    player?.matches.filter(
      (m) =>
        (result === "all" || m.result === result) &&
        (kind === "all" || m.kind === kind),
    ) ?? [];
  return (
    <PublicLayout live={live}>
      {id && (
        <Link className="back-link" to="/public/players">
          <ArrowLeft size={16} />
          All players
        </Link>
      )}
      {!id && (
        <section className="spectator-hero">
          <div>
            <span className="eyebrow">THE PEOPLE BEHIND THE POINTS</span>
            <h1>Players</h1>
            <p>
              Find your record. Follow your progress. Explore each player’s
              wins, losses, and match history.
            </p>
          </div>
          <div className="spectator-hero-mark">
            <UsersRound size={44} />
          </div>
        </section>
      )}
      {loading ? (
        <div className="card empty-state" role="status">
          Loading player records…
        </div>
      ) : error ? (
        <div className="error-banner" role="alert">
          We couldn’t load player records.
          <button className="btn" onClick={() => void refresh()}>
            Retry
          </button>
        </div>
      ) : id ? (
        !player ? (
          <div className="card">
            <EmptyState title="Player unavailable">
              This player may have been removed.
            </EmptyState>
          </div>
        ) : (
          <>
            <PageHeader
              title={player.name}
              subtitle="Public player record · Finalized matches from published events"
              eyebrow="PLAYER PROFILE"
              actions={
                player.archived ? <Badge>Archived player</Badge> : undefined
              }
            />
            <section className="card">
              <Record player={player} />
            </section>
            <section className="section-block">
              <div className="section-heading">
                <div>
                  <h2>Match history</h2>
                  <p className="muted">
                    Scores appear in Team A–Team B order. Your result is shown
                    beside each match.
                  </p>
                </div>
                <span className="muted small-text player-history-count">
                  {matches.length} {matches.length === 1 ? "match" : "matches"}
                </span>
              </div>
              <div className="list-toolbar standalone">
                <div className="tab-buttons">
                  {["all", "win", "loss"].map((r) => (
                    <button
                      className={result === r ? "selected" : ""}
                      key={r}
                      onClick={() => setResult(r)}
                    >
                      {r === "all"
                        ? "All results"
                        : r === "win"
                          ? "Wins"
                          : "Losses"}
                    </button>
                  ))}
                </div>
                <select
                  aria-label="Match history event type"
                  value={kind}
                  onChange={(e) => setKind(e.target.value)}
                >
                  <option value="all">All event types</option>
                  <option value="tournament">Tournaments</option>
                  <option value="queue">Queue sessions</option>
                </select>
              </div>
              {matches.length ? (
                <div className="grid-2">
                  {matches.map((m) => (
                    <HistoryMatch key={m.id} match={m} />
                  ))}
                </div>
              ) : (
                <div className="card">
                  <EmptyState title="No matches to show">
                    Finalized results from published tournaments and sessions
                    will appear here.
                  </EmptyState>
                </div>
              )}
            </section>
          </>
        )
      ) : (
        <>
          <div className="list-toolbar standalone">
            <div className="search-input">
              <Search size={17} />
              <input
                aria-label="Search public players"
                placeholder="Search players by name…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <select
              aria-label="Sort players"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
            >
              <option value="name">Name A–Z</option>
              <option value="wins">Most wins</option>
            </select>
          </div>
          {players.length ? (
            <div className="grid-3 public-player-grid">
              {players.map((p) => (
                <Link
                  key={p.id}
                  className="card public-player-card"
                  to={`/public/players/${p.id}`}
                >
                  <div className="card-header">
                    <span className="avatar large">
                      {p.name
                        .trim()
                        .split(/\s+/)
                        .slice(0, 2)
                        .map((s) => s[0])
                        .join("")
                        .toUpperCase()}
                    </span>
                    {p.archived && <Badge>Archived</Badge>}
                  </div>
                  <h2>{p.name}</h2>
                  <Record player={p} />
                  <span className="text-link">
                    Match history <ArrowRight size={15} />
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="card">
              <EmptyState
                title={
                  search ? "No players match your search" : "No players yet"
                }
              >
                {search
                  ? "Try a different name."
                  : "Registered players and their public records will appear here."}
              </EmptyState>
            </div>
          )}
        </>
      )}
      <p className="public-footnote">
        Records include finalized matches from published events. Walkovers
        count; BYEs and unfinished games do not.
      </p>
    </PublicLayout>
  );
}

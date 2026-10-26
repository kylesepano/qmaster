import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  Check,
  Clock3,
  Filter,
  Grid2X2,
  Swords,
  Trophy,
} from "lucide-react";
import { useApp } from "../hooks/useApp";
import { rpc } from "../services/api";
import { Scoreboard } from "../components/Scoreboard";
import type { Game, QueueMatch, TournamentMatch } from "../types";
import { matchGames, matchSides } from "../utilities/matchDisplay";

export function MatchesPage() {
  const { data } = useApp();
  const [params] = useSearchParams();
  const [status, setStatus] = useState(params.get("status") ?? "all");
  const [kind, setKind] = useState("all");
  const [event, setEvent] = useState("all");
  const [player, setPlayer] = useState("all");
  const [date, setDate] = useState("");
  const all: (TournamentMatch | QueueMatch)[] = [
    ...data.tournamentMatches,
    ...data.queueMatches,
  ];
  const matches = all
    .filter((match) => {
      const isTournament = "tournament_id" in match;
      if (match.status === "skipped" || match.status === "bye") return false;
      if (status !== "all" && match.status !== status) return false;
      if (kind !== "all" && kind !== (isTournament ? "tournament" : "queue"))
        return false;
      if (
        event !== "all" &&
        event !== (isTournament ? match.tournament_id : match.session_id)
      )
        return false;
      if (date) {
        const timestamp = match.completed_at ?? match.started_at;
        if (!timestamp) return false;
        const when = new Date(timestamp);
        const localDate = `${when.getFullYear()}-${String(when.getMonth() + 1).padStart(2, "0")}-${String(when.getDate()).padStart(2, "0")}`;
        if (localDate !== date) return false;
      }
      if (player !== "all") {
        if (isTournament) {
          if (
            !data.entries.some(
              (entry) =>
                (entry.id === match.entry_a_id ||
                  entry.id === match.entry_b_id) &&
                entry.player_ids.includes(player),
            )
          )
            return false;
        } else if (
          !data.queueMatchPlayers.some(
            (item) => item.match_id === match.id && item.player_id === player,
          )
        )
          return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (a.status === "playing" && b.status !== "playing") return -1;
      if (b.status === "playing" && a.status !== "playing") return 1;
      return (b.completed_at ?? b.started_at ?? "").localeCompare(
        a.completed_at ?? a.started_at ?? "",
      );
    });
  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <span className="eyebrow">SCORES & RESULTS</span>
          <h1>Match center</h1>
          <p className="muted">
            Live courts, upcoming matches, and every finished game.
          </p>
        </div>
        <div className="header-actions">
          <span className="badge blue">
            <span className="status-dot" />
            {all.filter((match) => match.status === "playing").length} live
          </span>
        </div>
      </div>
      <section className="card">
        <div className="card-header">
          <h2>
            <Filter size={17} />
            Filter matches
          </h2>
          <button
            className="btn ghost small"
            onClick={() => {
              setKind("all");
              setEvent("all");
              setPlayer("all");
              setDate("");
              setStatus("all");
            }}
          >
            Clear filters
          </button>
        </div>
        <div className="filter-grid">
          <label className="field">
            <span>Status</span>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="all">All matches</option>
              <option value="playing">Playing now</option>
              <option value="ready">Ready to play</option>
              <option value="pending">Upcoming</option>
              <option value="completed">Completed</option>
            </select>
          </label>
          <label className="field">
            <span>Match type</span>
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="all">All types</option>
              <option value="tournament">Tournament</option>
              <option value="queue">Queue session</option>
            </select>
          </label>
          <label className="field">
            <span>Event</span>
            <select value={event} onChange={(e) => setEvent(e.target.value)}>
              <option value="all">All events</option>
              <optgroup label="Tournaments">
                {data.tournaments.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Queue sessions">
                {data.queueSessions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </optgroup>
            </select>
          </label>
          <label className="field">
            <span>Player</span>
            <select value={player} onChange={(e) => setPlayer(e.target.value)}>
              <option value="all">All players</option>
              {data.players.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Date</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
        </div>
      </section>
      {matches.length ? (
        <section className="card">
          <div className="card-header">
            <h2>
              {matches.length} match{matches.length === 1 ? "" : "es"}
            </h2>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Players / teams</th>
                  <th>Event</th>
                  <th>Status</th>
                  <th>Score</th>
                  <th>Court</th>
                  <th>Finished</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {matches.map((match) => {
                  const tournament =
                    "tournament_id" in match
                      ? data.tournaments.find(
                          (item) => item.id === match.tournament_id,
                        )
                      : null;
                  const session =
                    "session_id" in match
                      ? data.queueSessions.find(
                          (item) => item.id === match.session_id,
                        )
                      : null;
                  const sides = matchSides(data, match);
                  const winner =
                    "winner_side" in match
                      ? match.winner_side
                      : match.winner_entry_id
                        ? match.winner_entry_id === match.entry_a_id
                          ? "a"
                          : "b"
                        : null;
                  const games = matchGames(data, match.id);
                  return (
                    <tr key={match.id}>
                      <td>
                        <div className="match-name-row">
                          <span className={winner === "a" ? "winner-name" : ""}>
                            {sides[0]}
                          </span>
                          <span className="muted">vs</span>
                          <span className={winner === "b" ? "winner-name" : ""}>
                            {sides[1]}
                          </span>
                        </div>
                      </td>
                      <td>
                        <strong>
                          {tournament?.name ?? session?.name ?? "Event"}
                        </strong>
                        <small className="muted">
                          {tournament
                            ? `Tournament · Round ${"round_no" in match ? match.round_no : ""}`
                            : "Queue session"}
                        </small>
                      </td>
                      <td>
                        <span
                          className={`badge ${match.status === "playing" ? "blue" : match.status === "completed" ? "green" : ""}`}
                        >
                          {match.status}
                        </span>
                      </td>
                      <td>
                        {match.walkover
                          ? "Walkover"
                          : games.length
                            ? games
                                .map(
                                  (game) => `${game.score_a}–${game.score_b}`,
                                )
                                .join(", ")
                            : "—"}
                      </td>
                      <td>
                        {match.court_no
                          ? `Court ${match.court_no}`
                          : "Unassigned"}
                      </td>
                      <td>
                        {match.completed_at
                          ? new Date(match.completed_at).toLocaleString([], {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "—"}
                      </td>
                      <td>
                        <Link className="text-link" to={`/matches/${match.id}`}>
                          {match.status === "playing" ? "Score" : "View"}
                          <ArrowRight size={15} />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <div className="card empty-state">
          <Swords size={36} />
          <h2>No matches found</h2>
          <p>
            Create a tournament bracket or start a queue match to see it here.
          </p>
          <div className="button-row">
            <Link className="btn" to="/tournaments">
              Tournaments
            </Link>
            <Link className="btn primary" to="/queue">
              Queue sessions
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

export function MatchDetailPage() {
  const { id } = useParams();
  const { data, act, busy, loading, refresh } = useApp();
  const [court, setCourt] = useState(1);
  const tournamentMatch = data.tournamentMatches.find(
    (match) => match.id === id,
  );
  const queueMatch = data.queueMatches.find((match) => match.id === id);
  const match = tournamentMatch ?? queueMatch;
  if (!match)
    return (
      <div className="card empty-state">
        <h2>{loading ? "Loading match…" : "Match unavailable"}</h2>
        <Link className="btn" to="/matches">
          Back to match center
        </Link>
      </div>
    );
  const tournament = tournamentMatch
    ? data.tournaments.find((item) => item.id === tournamentMatch.tournament_id)
    : null;
  const session = queueMatch
    ? data.queueSessions.find((item) => item.id === queueMatch.session_id)
    : null;
  const event = tournament ?? session;
  const sides = matchSides(data, match);
  const games = matchGames(data, id!);
  const availableCourts = tournament
    ? Array.from(
        { length: tournament.court_count },
        (_, index) => index + 1,
      ).filter(
        (number) =>
          !data.tournamentMatches.some(
            (item) =>
              item.tournament_id === tournament.id &&
              item.status === "playing" &&
              item.court_no === number,
          ),
      )
    : [];
  const selectedCourt = availableCourts.includes(court)
    ? court
    : (availableCourts[0] ?? 1);
  const winner = queueMatch
    ? queueMatch.winner_side
    : tournamentMatch?.winner_entry_id
      ? tournamentMatch.winner_entry_id === tournamentMatch.entry_a_id
        ? "a"
        : "b"
      : null;
  const inactive =
    match.status === "pending" ||
    match.status === "bye" ||
    match.status === "skipped";
  async function saveScore(
    next: Game[],
    finalize: boolean,
    walkover: "a" | "b" | null,
  ) {
    const ok = await act(
      () =>
        rpc("save_match_score", {
          p_match_id: id,
          p_kind: tournamentMatch ? "tournament" : "queue",
          p_games: next,
          p_expected_version: match!.version,
          p_finalize: finalize,
          p_walkover_side: walkover,
        }),
      finalize ? "Match result saved." : undefined,
    );
    if (!ok) await refresh();
    return ok;
  }
  return (
    <div className="stack">
      <Link
        className="back-link"
        to={
          tournament
            ? `/tournaments/${tournament.id}/bracket`
            : session
              ? `/queue/${session.id}`
              : "/matches"
        }
      >
        <ArrowLeft size={16} />
        {event?.name ?? "Match center"}
      </Link>
      <div className="page-header">
        <div>
          <span className="eyebrow">
            {tournament ? "TOURNAMENT MATCH" : "CASUAL MATCH"}
          </span>
          <h1>
            {sides[0]} <span className="muted">vs</span> {sides[1]}
          </h1>
          <p className="muted">
            {event?.name}
            {tournamentMatch
              ? ` · ${tournamentMatch.bracket === "lower" ? "Lower bracket" : tournamentMatch.bracket === "reset" ? "Grand final reset" : tournamentMatch.bracket === "final" ? "Final" : `Round ${tournamentMatch.round_no}`}`
              : ""}
          </p>
        </div>
        <span
          className={`badge ${match.status === "playing" ? "blue" : match.status === "completed" ? "green" : ""}`}
        >
          {match.status}
        </span>
      </div>
      <div className="match-meta">
        <span>
          <Grid2X2 size={17} />
          {match.court_no ? `Court ${match.court_no}` : "Court not assigned"}
        </span>
        <span>
          <Calendar size={17} />
          {tournament?.event_date ??
            (match.started_at
              ? new Date(match.started_at).toLocaleDateString()
              : "Not started")}
        </span>
        {match.completed_at && (
          <span>
            <Clock3 size={17} />
            Finished{" "}
            {new Date(match.completed_at).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        )}
      </div>
      {tournamentMatch?.status === "ready" && (
        <form
          className="card assignment-panel"
          onSubmit={(event) => {
            event.preventDefault();
            void act(
              () =>
                rpc("assign_tournament_court", {
                  p_match_id: id,
                  p_court_no: selectedCourt,
                }),
              "Match started on court.",
            );
          }}
        >
          <div>
            <h2>Assign a court</h2>
            <p className="muted">
              {tournament?.status === "draft"
                ? "Start the tournament before assigning a court."
                : "Both sides are ready. Choose a free court to start this match."}
            </p>
          </div>
          <label className="field">
            <span>Court</span>
            <select
              aria-label="Assign court"
              value={availableCourts.length ? selectedCourt : ""}
              onChange={(event) => setCourt(Number(event.target.value))}
            >
              {availableCourts.length ? (
                availableCourts.map((number) => (
                  <option key={number} value={number}>
                    Court {number}
                  </option>
                ))
              ) : (
                <option value="">No court available</option>
              )}
            </select>
          </label>
          <button
            className="btn primary"
            disabled={
              busy ||
              !availableCourts.length ||
              tournament?.status !== "ongoing"
            }
          >
            <Check size={16} />
            Start match
          </button>
        </form>
      )}
      {inactive ? (
        <section className="card empty-state">
          {match.status === "bye" ? <Trophy size={32} /> : <Swords size={32} />}
          <h2>
            {match.status === "bye"
              ? "Advanced through a BYE"
              : match.status === "skipped"
                ? "Reset final not required"
                : "Waiting for earlier results"}
          </h2>
          <p>
            {match.status === "bye"
              ? "The available entry advances automatically. No score is needed."
              : match.status === "skipped"
                ? "The upper-bracket winner won the grand final."
                : "The bracket will fill both sides automatically when their preceding matches finish."}
          </p>
        </section>
      ) : (
        <Scoreboard
          sideA={sides[0]}
          sideB={sides[1]}
          games={games}
          bestOf={event?.best_of ?? 1}
          version={match.version}
          completed={match.status === "completed"}
          locked={match.status !== "playing" && match.status !== "completed"}
          busy={busy}
          winner={winner}
          walkover={match.walkover}
          onSave={saveScore}
        />
      )}
      <p className="muted small-text">
        Scores save to Supabase. Finishing a match releases its court and
        updates the bracket or waiting queue. If someone else changes this
        match, refresh before retrying a conflicting update.
      </p>
    </div>
  );
}

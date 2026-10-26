import { Link } from "react-router-dom";
import { ArrowRight, Grid2X2, Trophy } from "lucide-react";
import type { AppData, QueueMatch, TournamentMatch } from "../types";
import { matchGames, matchSides } from "../utilities/matchDisplay";

export function MatchCard({
  match,
  data,
  eventName,
}: {
  match: TournamentMatch | QueueMatch;
  data: AppData;
  eventName?: string;
}) {
  const sides = matchSides(data, match);
  const games = matchGames(data, match.id);
  const winner =
    "winner_side" in match
      ? match.winner_side
      : match.winner_entry_id
        ? match.winner_entry_id === match.entry_a_id
          ? "a"
          : "b"
        : null;
  return (
    <article className="card match-card">
      <div className="card-header">
        <span className="muted">{eventName ?? "Match"}</span>
        <span
          className={`badge ${match.status === "playing" ? "blue" : match.status === "completed" ? "green" : ""}`}
        >
          {match.status}
        </span>
      </div>
      {sides.map((name, index) => (
        <div
          className={`match-card-side ${winner === (index === 0 ? "a" : "b") ? "winner-name" : ""}`}
          key={index}
        >
          <strong>{name}</strong>
          {winner === (index === 0 ? "a" : "b") && <Trophy size={15} />}
          <span>
            {games.length
              ? games
                  .map((game) => (index === 0 ? game.score_a : game.score_b))
                  .join(" · ")
              : "—"}
          </span>
        </div>
      ))}
      <div className="match-card-footer">
        <span className="muted">
          <Grid2X2 size={14} />
          {match.court_no ? `Court ${match.court_no}` : "Court unassigned"}
          {match.walkover ? " · Walkover" : ""}
        </span>
        <Link className="text-link" to={`/matches/${match.id}`}>
          {match.status === "playing" ? "Score match" : "View match"}
          <ArrowRight size={15} />
        </Link>
      </div>
    </article>
  );
}

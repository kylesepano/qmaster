import { Link } from "react-router-dom";
import { ArrowRight, Grid2X2 } from "lucide-react";
import type { AppData, QueueMatch, TournamentMatch } from "../types";
import { matchSides } from "../utilities/matchDisplay";

export function CourtCard({
  number,
  match,
  data,
  ended = false,
}: {
  number: number;
  match?: TournamentMatch | QueueMatch;
  data: AppData;
  ended?: boolean;
}) {
  const sides = match ? matchSides(data, match) : null;
  return (
    <article className={`card court-card ${match ? "occupied" : "available"}`}>
      <div className="card-header">
        <h3>
          <Grid2X2 size={18} />
          Court {number}
        </h3>
        <span className={`badge ${match ? "blue" : "green"}`}>
          {match ? "Playing" : "Available"}
        </span>
      </div>
      {match && sides ? (
        <>
          <p>
            <strong>{sides[0]}</strong>
            <span className="versus-label">vs</span>
            <strong>{sides[1]}</strong>
          </p>
          <Link className="btn primary small" to={`/matches/${match.id}`}>
            Score / finish match <ArrowRight size={14} />
          </Link>
        </>
      ) : (
        <p className="muted">
          {ended ? "Event complete" : "Ready for the next match"}
        </p>
      )}
    </article>
  );
}

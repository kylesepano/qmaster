import { Link } from "react-router-dom";
import { Check, Trophy } from "lucide-react";
import type {
  Entry,
  MatchGame,
  TournamentMatch,
  BracketLane,
  Tournament,
} from "../types";
import { calculateStandings } from "../utilities/standings";

const lanes: { id: BracketLane; label: string }[] = [
  { id: "upper", label: "Upper bracket" },
  { id: "lower", label: "Lower bracket" },
  { id: "final", label: "Final" },
  { id: "reset", label: "Grand final reset" },
  { id: "round_robin", label: "Round robin" },
];
export function BracketView({
  matches,
  entries,
  games,
  readOnly = false,
}: {
  matches: TournamentMatch[];
  entries: Entry[];
  games: MatchGame[];
  readOnly?: boolean;
}) {
  if (!matches.length) return null;
  return (
    <div className="bracket-lanes">
      {lanes
        .filter((l) => matches.some((m) => m.bracket === l.id))
        .map((lane) => {
          const laneMatches = matches.filter((m) => m.bracket === lane.id);
          const rounds = [...new Set(laneMatches.map((m) => m.round_no))].sort(
            (a, b) => a - b,
          );
          return (
            <section className="bracket-lane" key={lane.id}>
              <div className="bracket-lane-title">
                <span className={`lane-dot ${lane.id}`} />
                <h3>{lane.label}</h3>
                {lane.id === "reset" && (
                  <span className="muted small-text">
                    Only played if the lower-bracket finalist wins the first
                    final.
                  </span>
                )}
              </div>
              <div
                className="bracket-scroll"
                tabIndex={0}
                role="region"
                aria-label={`${lane.label} bracket`}
              >
                <div className="bracket-rounds">
                  {rounds.map((round) => (
                    <div className="bracket-round" key={round}>
                      <div className="round-title">
                        {lane.id === "final"
                          ? matches.some((m) => m.bracket === "lower")
                            ? "Grand final"
                            : "Final"
                          : lane.id === "reset"
                            ? "If required"
                            : `Round ${round}`}
                      </div>
                      <div className="round-matches">
                        {laneMatches
                          .filter((m) => m.round_no === round)
                          .sort((a, b) => a.position - b.position)
                          .map((match) => {
                            const scores = games
                              .filter((g) => g.tournament_match_id === match.id)
                              .sort((a, b) => a.game_no - b.game_no);
                            const body = (
                              <>
                                <div className="bracket-match-head">
                                  <span>
                                    M{match.position}
                                    {match.court_no &&
                                      ` · Court ${match.court_no}`}
                                  </span>
                                  <span
                                    className={
                                      match.status === "playing"
                                        ? "live-label"
                                        : ""
                                    }
                                  >
                                    {match.status === "skipped"
                                      ? "Not required"
                                      : match.status === "bye"
                                        ? "BYE"
                                        : match.status}
                                  </span>
                                </div>
                                {(["a", "b"] as const).map((side) => {
                                  const entryId =
                                    side === "a"
                                      ? match.entry_a_id
                                      : match.entry_b_id;
                                  const entry = entries.find(
                                    (e) => e.id === entryId,
                                  );
                                  const source =
                                    side === "a"
                                      ? match.source_a_match_id
                                      : match.source_b_match_id;
                                  return (
                                    <div
                                      key={side}
                                      className={`bracket-side ${entryId && match.winner_entry_id === entryId ? "won" : ""}`}
                                    >
                                      <span className="bracket-seed">
                                        {entry?.seed ?? "–"}
                                      </span>
                                      <span
                                        className={`bracket-name ${!entry ? "muted" : ""}`}
                                      >
                                        {entry?.name ??
                                          (source ? "TBD" : "BYE")}
                                      </span>
                                      {scores.map((s) => (
                                        <span
                                          className="bracket-score"
                                          key={s.id}
                                        >
                                          {side === "a" ? s.score_a : s.score_b}
                                        </span>
                                      ))}
                                      {match.walkover &&
                                        match.winner_entry_id === entryId && (
                                          <small>W/O</small>
                                        )}
                                      {entryId &&
                                        match.winner_entry_id === entryId && (
                                          <Check size={14} />
                                        )}
                                    </div>
                                  );
                                })}
                              </>
                            );
                            return readOnly ? (
                              <div
                                className={`bracket-match ${match.status}`}
                                key={match.id}
                              >
                                {body}
                              </div>
                            ) : (
                              <Link
                                className={`bracket-match ${match.status}`}
                                key={match.id}
                                to={`/matches/${match.id}`}
                              >
                                {body}
                              </Link>
                            );
                          })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          );
        })}
    </div>
  );
}
export function Standings({
  entries,
  matches,
  games,
  championId,
}: {
  entries: Entry[];
  matches: TournamentMatch[];
  games: MatchGame[];
  championId?: string | null;
}) {
  const rows = calculateStandings(entries, matches, games);
  return (
    <section className="card standings">
      <div className="card-header">
        <div>
          <h2>Standings</h2>
          <p>Ranked by wins, game difference, point difference, then seed.</p>
        </div>
        <Trophy size={20} />
      </div>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Rank</th>
              <th>Player / team</th>
              <th>Played</th>
              <th>Won</th>
              <th>Lost</th>
              <th>Game ±</th>
              <th>Points ±</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.entryId}>
                <td>{row.rank}</td>
                <td>
                  <strong>{row.name}</strong>
                  {row.entryId === championId && (
                    <Trophy className="champion-icon" size={15} />
                  )}
                </td>
                <td>{row.played}</td>
                <td>{row.wins}</td>
                <td>{row.losses}</td>
                <td>{row.gameDifference}</td>
                <td>{row.pointDifference}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

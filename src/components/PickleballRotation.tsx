import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useApp } from "../hooks/useApp";
import { rpc } from "../services/api";
import type { QueueSession } from "../types";
import { estimateRotation } from "../utilities/rotation";
import { SessionTiming } from "./SessionTiming";
import { ConfirmationDialog } from "./ui";

export function PickleballRotation({ session }: { session: QueueSession }) {
  const { data, act, busy } = useApp();
  const [hours, setHours] = useState(Number(session.session_hours ?? 2));
  const [minutes, setMinutes] = useState(session.estimated_match_minutes ?? 15);
  const [cancel, setCancel] = useState(false);
  useEffect(() => {
    setHours(Number(session.session_hours ?? 2));
    setMinutes(session.estimated_match_minutes ?? 15);
  }, [session.session_hours, session.estimated_match_minutes]);
  const rotation = data.queueRotations?.find(
    (r) => r.session_id === session.id,
  );
  const members = data.queueMembers.filter((m) => m.session_id === session.id);
  const games = (data.queueRotationGames ?? [])
    .filter((g) => g.session_id === session.id)
    .sort((a, b) => a.position - b.position);
  const matches = data.queueMatches.filter((m) => m.session_id === session.id);
  const completedIds = new Set(
    matches.filter((m) => m.status === "completed").map((m) => m.id),
  );
  const count = (id: string) =>
    data.queueMatchPlayers.filter(
      (p) => p.player_id === id && completedIds.has(p.match_id),
    ).length;
  const roster = rotation?.player_ids ?? members.map((m) => m.player_id);
  const estimate = estimateRotation(
    hours,
    minutes,
    session.court_count,
    session.play_type,
    roster.map(count),
  );
  const active = matches.some((m) => m.status === "playing");
  const done = games.filter(
    (g) => g.match_id && completedIds.has(g.match_id),
  ).length;
  const pending = games.filter((g) => !g.match_id).length;
  const name = (id: string) =>
    data.players.find((p) => p.id === id)?.name ?? "Player";
  return (
    <section className="card stack">
      <div className="card-header">
        <div>
          <h2>Balanced random rotation</h2>
          <p className="muted">
            Equal match counts with randomly mixed teammates. No bracket or
            elimination.
          </p>
        </div>
      </div>
      <SessionTiming
        hours={hours}
        minutes={minutes}
        courts={session.court_count}
        playType={session.play_type}
        played={roster.map(count)}
        onHours={setHours}
        onMinutes={setMinutes}
        disabled={!!rotation || session.status !== "ongoing"}
      />
      {rotation ? (
        <>
          <p className="callout">
            <strong>{rotation.target_matches} total matches per player</strong>{" "}
            when the rotation finishes. {done} of {games.length} planned matches
            completed · {pending} waiting to start.
          </p>
          <p className="muted">
            Teammates are mixed for each planned match, including players
            registered on fixed teams. Existing session results count toward the
            equal final total. Everyone automatically rejoins until the plan
            finishes.
          </p>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Player</th>
                  <th>Completed</th>
                  <th>Target</th>
                </tr>
              </thead>
              <tbody>
                {roster.map((id) => (
                  <tr key={id}>
                    <td>{name(id)}</td>
                    <td>{count(id)}</td>
                    <td>{rotation.target_matches}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {session.status === "ongoing" && (
            <div className="button-row">
              <button
                className="btn primary"
                disabled={busy || !pending}
                onClick={() =>
                  void act(async () => {
                    const n = await rpc("auto_fill_session_courts", {
                      p_session_id: session.id,
                    });
                    if (!n)
                      throw new Error(
                        "No planned match is ready. Finish active games or wait for players in other events.",
                      );
                  }, "Ready rotation matches called to court.")
                }
              >
                Fill available courts
              </button>
              <button
                className="btn danger"
                disabled={busy}
                onClick={() => setCancel(true)}
              >
                Cancel remaining rotation
              </button>
            </div>
          )}
          <details>
            <summary>View planned matches</summary>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Match</th>
                    <th>Side A</th>
                    <th>Side B</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {games.map((g) => (
                    <tr key={g.id}>
                      <td>{g.position}</td>
                      <td>
                        {g.player_ids
                          .slice(0, g.player_ids.length / 2)
                          .map(name)
                          .join(" / ")}
                      </td>
                      <td>
                        {g.player_ids
                          .slice(g.player_ids.length / 2)
                          .map(name)
                          .join(" / ")}
                      </td>
                      <td>
                        {g.match_id ? (
                          <Link to={`/matches/${g.match_id}`}>
                            {completedIds.has(g.match_id)
                              ? "Completed"
                              : "Playing"}
                          </Link>
                        ) : (
                          "Waiting"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      ) : (
        <>
          <p className="muted">
            Add all players below, then generate the full rotation. Courts fill
            automatically and the next available match starts after each
            finalized result. If everyone cannot receive the same count within
            the estimate, fewer matches are scheduled.
          </p>
          {session.status === "ongoing" && (
            <button
              className="btn primary"
              disabled={busy || !!estimate.error || active}
              onClick={() =>
                void act(
                  () =>
                    rpc("generate_pickleball_rotation", {
                      p_session_id: session.id,
                      p_hours: hours,
                      p_minutes: minutes,
                    }),
                  "Balanced rotation generated and available courts filled.",
                )
              }
            >
              Generate balanced rotation & fill courts
            </button>
          )}
          {active && (
            <small className="muted">
              Finish active session matches before generating a rotation.
            </small>
          )}
        </>
      )}
      {cancel && (
        <ConfirmationDialog
          title="Cancel the remaining rotation?"
          danger
          busy={busy}
          onClose={() => setCancel(false)}
          onConfirm={() =>
            void act(
              () =>
                rpc("cancel_pickleball_rotation", { p_session_id: session.id }),
              "Remaining rotation canceled. Started matches and results are kept.",
            ).then((ok) => {
              if (ok) setCancel(false);
            })
          }
        >
          Started matches continue and completed results stay in history.
          Unstarted games are removed. Change the roster or hours, then
          regenerate after active games finish. Equal final match counts apply
          only when a rotation is completed.
        </ConfirmationDialog>
      )}
    </section>
  );
}

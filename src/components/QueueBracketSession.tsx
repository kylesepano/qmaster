import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Shuffle, RotateCcw, Trophy } from "lucide-react";
import { useApp } from "../hooks/useApp";
import type { QueueSession } from "../types";
import { FORMAT_LABELS } from "../types";
import { rpc } from "../services/api";
import { generateBracket, shuffleEntries } from "../utilities/brackets";
import { scoringRuleLabel } from "../utilities/scoring";
import { BracketView, Standings } from "./BracketView";
import { CourtCard } from "./CourtCard";
import { DeleteButton } from "./DeleteButton";
import { PublishSessionButton } from "./PublishSessionButton";
import { QueueTeams } from "./QueueTeams";
import { Badge, ConfirmationDialog, PageHeader } from "./ui";

export function QueueBracketSession({ session }: { session: QueueSession }) {
  const { data, act, busy } = useApp();
  const navigate = useNavigate();
  const [random, setRandom] = useState(true),
    [reset, setReset] = useState(false);
  const teams = (data.queueTeams ?? [])
    .filter((t) => t.session_id === session.id)
    .sort((a, b) => a.position - b.position);
  const tournament = data.tournaments.find(
    (t) => t.queue_session_id === session.id,
  );
  const matches = data.tournamentMatches.filter(
    (m) => m.tournament_id === tournament?.id,
  );
  const entries = data.entries.filter(
    (e) => e.tournament_id === tournament?.id,
  );
  const games = data.games.filter((g) =>
    matches.some((m) => m.id === g.tournament_match_id),
  );
  const active = matches.filter((m) => m.status === "playing");
  const champion = entries.find((e) => e.id === tournament?.champion_entry_id);
  const format = session.bracket_format ?? "single_elimination";
  return (
    <div className="stack">
      <Link className="back-link" to="/queue">
        <ArrowLeft size={16} />
        Queue sessions
      </Link>
      <PageHeader
        title={session.name}
        subtitle={`${FORMAT_LABELS[format]} · ${session.play_type} · ${scoringRuleLabel(session.scoring_rule)}`}
        eyebrow="BRACKET SESSION"
        actions={
          <>
            <Badge tone={session.status === "ongoing" ? "green" : ""}>
              {session.status === "ongoing" ? "Active" : "Completed"}
            </Badge>
            <PublishSessionButton session={session} />
            <DeleteButton
              kind="session"
              id={session.id}
              name={session.name}
              onDeleted={() => navigate("/queue")}
            />
          </>
        }
      />
      {champion && (
        <div className="champion-banner">
          <Trophy size={34} />
          <div>
            <span className="eyebrow">SESSION CHAMPION</span>
            <h2>{champion.name}</h2>
          </div>
        </div>
      )}
      <div className="court-grid">
        {Array.from({ length: session.court_count }, (_, i) => (
          <CourtCard
            key={i}
            number={i + 1}
            match={active.find((m) => m.court_no === i + 1)}
            data={data}
            ended={session.status === "completed"}
          />
        ))}
      </div>
      <QueueTeams session={session} />
      {!tournament ? (
        <section className="card stack">
          <div>
            <h2>Generate the session draw</h2>
            <p className="muted">
              Register 2–64 entries. Matches will be generated, saved, and
              assigned to free courts automatically.
            </p>
          </div>
          <label className="check-label">
            <input
              type="checkbox"
              checked={random}
              onChange={(e) => setRandom(e.target.checked)}
            />
            Randomize the bracket
          </label>
          <p className="muted small-text">
            Turn randomization off to use the registered order. Move entries
            with the arrows to set matchups yourself.
          </p>
          <button
            className="btn primary"
            disabled={busy || teams.length < 2 || teams.length > 64}
            onClick={() =>
              void act(() => {
                const order = random
                  ? shuffleEntries(teams.map((t) => t.id))
                  : teams.map((t) => t.id);
                return rpc("generate_queue_bracket", {
                  p_session_id: session.id,
                  p_team_order: order,
                  p_matches: generateBracket(order, format),
                });
              }, "Session bracket generated and available courts filled.")
            }
          >
            <Shuffle size={16} />
            Generate bracket & fill courts
          </button>
        </section>
      ) : (
        <>
          <div className="section-heading">
            <div>
              <h2>Session bracket</h2>
              <p className="muted small-text">
                Winners advance automatically. Ready matches fill free courts
                after each result.
              </p>
            </div>
            <div className="button-row">
              <button
                className="btn"
                disabled={busy || session.status !== "ongoing"}
                onClick={() =>
                  void act(
                    () =>
                      rpc("auto_fill_session_courts", {
                        p_session_id: session.id,
                      }),
                    "Ready matches checked and free courts filled.",
                  )
                }
              >
                Fill available courts
              </button>
              <button
                className="btn small"
                disabled={busy || active.length > 0}
                title={
                  active.length
                    ? "Finish active matches before resetting"
                    : undefined
                }
                onClick={() => setReset(true)}
              >
                <RotateCcw size={14} />
                Reset bracket
              </button>
            </div>
          </div>
          {format === "round_robin" && (
            <Standings
              entries={entries}
              matches={matches}
              games={games}
              championId={tournament.champion_entry_id}
            />
          )}
          <BracketView entries={entries} matches={matches} games={games} />
        </>
      )}
      {reset && (
        <ConfirmationDialog
          title="Reset session bracket?"
          danger
          busy={busy}
          onClose={() => setReset(false)}
          onConfirm={() =>
            void act(
              () => rpc("reset_queue_bracket", { p_session_id: session.id }),
              "Session bracket reset. Teams are ready for a new draw.",
            ).then((ok) => {
              if (ok) setReset(false);
            })
          }
        >
          This permanently deletes this bracket and its scores. Registered teams
          are kept. Finish active games first.
        </ConfirmationDialog>
      )}
    </div>
  );
}

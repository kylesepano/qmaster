import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChevronDown,
  ChevronUp,
  Plus,
  Shuffle,
  Trash2,
  Play,
} from "lucide-react";
import type { QueueSession, QueueTeam } from "../types";
import { useApp } from "../hooks/useApp";
import { rpc } from "../services/api";
import { busyPlayerIds } from "../utilities/matchDisplay";
import { shuffleEntries } from "../utilities/brackets";
import { ConfirmationDialog, EmptyState, Modal } from "./ui";
import { PlayerMultiSelect } from "./PlayerMultiSelect";

export function QueueTeams({ session }: { session: QueueSession }) {
  const { data, act, busy } = useApp();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false),
    [name, setName] = useState(""),
    [selected, setSelected] = useState<string[]>([]),
    [removing, setRemoving] = useState<QueueTeam | null>(null);
  const [a, setA] = useState(""),
    [b, setB] = useState(""),
    [court, setCourt] = useState(1);
  const teams = (data.queueTeams ?? [])
    .filter((t) => t.session_id === session.id)
    .sort((x, y) => x.position - y.position);
  const linked = data.tournaments.find(
    (t) => t.queue_session_id === session.id,
  );
  const locked = !!linked || session.status !== "ongoing";
  const needed = session.play_type === "singles" ? 1 : 2;
  const used = new Set(teams.flatMap((t) => t.player_ids));
  const options = data.players.filter((p) => !p.archived && !used.has(p.id));
  const busyPlayers = busyPlayerIds(data);
  const eligible = teams.filter((t) =>
    t.player_ids.every(
      (id) =>
        !busyPlayers.has(id) &&
        data.queueMembers.some(
          (m) =>
            m.session_id === session.id &&
            m.player_id === id &&
            m.status === "waiting",
        ),
    ),
  );
  const courts = Array.from(
    { length: session.court_count },
    (_, i) => i + 1,
  ).filter(
    (n) =>
      !data.queueMatches.some(
        (m) =>
          m.session_id === session.id &&
          m.status === "playing" &&
          m.court_no === n,
      ),
  );
  async function seed(i: number, delta: number) {
    const ids = teams.map((t) => t.id);
    [ids[i], ids[i + delta]] = [ids[i + delta], ids[i]];
    await act(() =>
      rpc("seed_queue_teams", { p_session_id: session.id, p_team_ids: ids }),
    );
  }
  return (
    <section className="card stack">
      <div className="card-header">
        <div>
          <h2>Registered {needed === 1 ? "players" : "teams"}</h2>
          <p>
            {session.mode === "bracket"
              ? "Set the entries before generating the bracket. Use arrows for a manual seed order."
              : "Register fixed teams, then choose matchups or randomly fill available courts."}
          </p>
        </div>
        <button
          className="btn small"
          disabled={locked || busy}
          onClick={() => {
            setName("");
            setSelected([]);
            setOpen(true);
          }}
        >
          <Plus size={15} />
          Add {needed === 1 ? "player" : "team"}
        </button>
      </div>
      {teams.length ? (
        <div className="entry-list">
          {teams.map((team, i) => (
            <div className="entry-row" key={team.id}>
              <span className="seed-number">{i + 1}</span>
              <div>
                <strong>{team.name}</strong>
                <small>
                  {team.player_ids
                    .map(
                      (id) =>
                        data.players.find((p) => p.id === id)?.name ?? "Player",
                    )
                    .join(" / ")}
                </small>
              </div>
              {!locked && (
                <div className="entry-actions">
                  {session.mode === "bracket" && (
                    <>
                      <button
                        className="icon-btn"
                        disabled={busy || i === 0}
                        aria-label={`Move ${team.name} up`}
                        onClick={() => void seed(i, -1)}
                      >
                        <ChevronUp size={15} />
                      </button>
                      <button
                        className="icon-btn"
                        disabled={busy || i === teams.length - 1}
                        aria-label={`Move ${team.name} down`}
                        onClick={() => void seed(i, 1)}
                      >
                        <ChevronDown size={15} />
                      </button>
                    </>
                  )}
                  <button
                    className="icon-btn"
                    disabled={busy}
                    aria-label={`Remove team ${team.name}`}
                    onClick={() => setRemoving(team)}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          title={
            needed === 1 ? "Register session entries" : "Add your teams first"
          }
        >
          {needed === 1
            ? "Select a registered player for each entry."
            : "Give each team a name and choose exactly two registered players."}
        </EmptyState>
      )}
      {session.mode !== "bracket" &&
        session.status === "ongoing" &&
        teams.length >= 2 && (
          <form
            className="stack"
            onSubmit={async (e) => {
              e.preventDefault();
              let mid: unknown;
              if (
                await act(async () => {
                  mid = await rpc("start_registered_queue_match", {
                    p_team_a_id: a,
                    p_team_b_id: b,
                    p_court_no: courts.includes(court) ? court : courts[0],
                  });
                }, "Teams called to court.")
              ) {
                setA("");
                setB("");
                if (typeof mid === "string") navigate(`/matches/${mid}`);
              }
            }}
          >
            <div className="form-grid">
              <label className="field">
                Team A
                <select
                  value={a}
                  required
                  onChange={(e) => setA(e.target.value)}
                >
                  <option value="">Choose team</option>
                  {eligible
                    .filter((t) => t.id !== b)
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                </select>
              </label>
              <label className="field">
                Team B
                <select
                  value={b}
                  required
                  onChange={(e) => setB(e.target.value)}
                >
                  <option value="">Choose team</option>
                  {eligible
                    .filter((t) => t.id !== a)
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                </select>
              </label>
              <label className="field">
                Court for team match
                <select
                  value={courts.includes(court) ? court : (courts[0] ?? "")}
                  onChange={(e) => setCourt(Number(e.target.value))}
                >
                  {courts.length ? (
                    courts.map((n) => (
                      <option key={n} value={n}>
                        Court {n}
                      </option>
                    ))
                  ) : (
                    <option value="">No free court</option>
                  )}
                </select>
              </label>
            </div>
            <div className="button-row">
              <button
                type="button"
                className="btn"
                disabled={busy || eligible.length < 2}
                onClick={() => {
                  const ids = shuffleEntries(eligible.map((t) => t.id));
                  setA(ids[0]);
                  setB(ids[1]);
                }}
              >
                <Shuffle size={15} />
                Suggest random teams
              </button>
              <button
                className="btn primary"
                disabled={
                  busy ||
                  !a ||
                  !b ||
                  a === b ||
                  !eligible.some((t) => t.id === a) ||
                  !eligible.some((t) => t.id === b) ||
                  !courts.length
                }
              >
                <Play size={15} />
                Start team match
              </button>
              <button
                type="button"
                className="btn"
                disabled={busy || eligible.length < 2 || !courts.length}
                onClick={() =>
                  void act(async () => {
                    const n = await rpc("auto_fill_session_courts", {
                      p_session_id: session.id,
                    });
                    if (!n) throw new Error("No ready team pair is available.");
                  }, "Available courts filled with random team matches.")
                }
              >
                <Shuffle size={15} />
                Randomly fill courts
              </button>
            </div>
          </form>
        )}
      {open && (
        <Modal
          title={
            needed === 1
              ? "Register a session player"
              : "Register a session team"
          }
          onClose={() => setOpen(false)}
        >
          <form
            className="stack"
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                await act(
                  () =>
                    rpc("register_queue_team", {
                      p_session_id: session.id,
                      p_name:
                        name.trim() ||
                        selected
                          .map(
                            (id) => data.players.find((p) => p.id === id)!.name,
                          )
                          .join(" / ")
                          .slice(0, 150),
                      p_player_ids: selected,
                    }),
                  "Session entry registered.",
                )
              )
                setOpen(false);
            }}
          >
            {needed === 2 && (
              <label className="field">
                Team name
                <input
                  required
                  maxLength={150}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Shuttle Kings"
                />
              </label>
            )}
            <div className="field">
              <span>
                Select exactly {needed} {needed === 1 ? "player" : "players"}
              </span>
              <PlayerMultiSelect
                options={options}
                value={selected}
                onChange={setSelected}
                disabled={busy}
                maxSelected={needed}
                label="Players for session team"
              />
            </div>
            <p className="muted small-text">
              A player can belong to one registered team in this session.
              Selected players are added to the session roster automatically.
            </p>
            <div className="form-actions">
              <button
                type="button"
                className="btn"
                onClick={() => setOpen(false)}
              >
                Cancel
              </button>
              <button
                className="btn primary"
                disabled={
                  busy ||
                  selected.length !== needed ||
                  (needed === 2 && !name.trim())
                }
              >
                Register {needed === 1 ? "player" : "team"}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {removing && (
        <ConfirmationDialog
          title={`Remove ${removing.name}?`}
          danger
          busy={busy}
          onClose={() => setRemoving(null)}
          onConfirm={() =>
            void act(
              () => rpc("remove_queue_team", { p_team_id: removing.id }),
              "Team removed from this session.",
            ).then((ok) => {
              if (ok) setRemoving(null);
            })
          }
        >
          This removes the registered entry and its waiting roster membership.
          Existing completed match results remain.
        </ConfirmationDialog>
      )}
    </section>
  );
}

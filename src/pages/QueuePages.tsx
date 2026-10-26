import { useEffect, useState, type FormEvent } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Clock3,
  Grid2X2,
  ListOrdered,
  Play,
  Plus,
  RefreshCw,
  Trash2,
  Users,
} from "lucide-react";
import { useApp } from "../hooks/useApp";
import { db, rpc } from "../services/api";
import type { PlayType } from "../types";
import {
  busyPlayerIds,
  matchGames,
  matchSides,
} from "../utilities/matchDisplay";
import { suggestNextPlayers } from "../utilities/queue";
import { CourtCard } from "../components/CourtCard";

export function QueueListPage() {
  const { data, user, act, busy, configured } = useApp();
  const [params] = useSearchParams();
  const [creating, setCreating] = useState(params.get("new") === "1");
  const [name, setName] = useState("");
  const [playType, setPlayType] = useState<PlayType>("doubles");
  const [courts, setCourts] = useState(3);
  const [bestOf, setBestOf] = useState<1 | 3>(1);
  const navigate = useNavigate();
  const sessions = [...data.queueSessions].sort((a, b) =>
    b.created_at.localeCompare(a.created_at),
  );
  async function create(event: FormEvent) {
    event.preventDefault();
    if (!user) return;
    let newId = "";
    const ok = await act(async () => {
      const { data: session, error } = await db()
        .from("queue_sessions")
        .insert({
          organizer_id: user.id,
          name: name.trim(),
          play_type: playType,
          court_count: courts,
          best_of: bestOf,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      newId = session.id;
    }, "Queue session created.");
    if (ok) navigate(`/queue/${newId}`);
  }
  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <span className="eyebrow">CASUAL PLAY</span>
          <h1>Queue sessions</h1>
          <p className="muted">
            Keep courts moving and give everyone their turn.
          </p>
        </div>
        <div className="header-actions">
          <button
            className="btn primary"
            disabled={!configured || !user}
            onClick={() => setCreating(!creating)}
          >
            <Plus size={17} />
            Start queue session
          </button>
        </div>
      </div>
      {creating && (
        <form className="card stack" onSubmit={create}>
          <div className="card-header">
            <h2>New queue session</h2>
            <button
              className="btn ghost small"
              type="button"
              onClick={() => setCreating(false)}
            >
              Cancel
            </button>
          </div>
          <div className="form-grid">
            <label className="field">
              <span>Session name</span>
              <input
                required
                maxLength={100}
                placeholder="Friday evening games"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <label className="field">
              <span>Match type</span>
              <select
                value={playType}
                onChange={(event) =>
                  setPlayType(event.target.value as PlayType)
                }
              >
                <option value="singles">Singles · 1 vs 1</option>
                <option value="doubles">Doubles · 2 vs 2</option>
              </select>
            </label>
            <label className="field">
              <span>Number of courts</span>
              <input
                type="number"
                required
                min="1"
                max="32"
                value={courts}
                onChange={(event) => setCourts(Number(event.target.value))}
              />
            </label>
            <label className="field">
              <span>Match format</span>
              <select
                value={bestOf}
                onChange={(event) =>
                  setBestOf(Number(event.target.value) as 1 | 3)
                }
              >
                <option value="1">Single game</option>
                <option value="3">Best of 3</option>
              </select>
            </label>
          </div>
          <div>
            <button
              className="btn primary"
              disabled={busy || !name.trim() || !user || !configured}
            >
              <Check size={16} />
              Create session
            </button>
          </div>
        </form>
      )}
      {sessions.length ? (
        <div className="grid-3">
          {sessions.map((session) => {
            const waiting = data.queueMembers.filter(
              (member) =>
                member.session_id === session.id && member.status === "waiting",
            ).length;
            const playing = data.queueMatches.filter(
              (match) =>
                match.session_id === session.id && match.status === "playing",
            ).length;
            return (
              <Link
                className="card session-card"
                to={`/queue/${session.id}`}
                key={session.id}
              >
                <div className="card-header">
                  <span className="icon-tile">
                    <ListOrdered size={20} />
                  </span>
                  <span
                    className={`badge ${session.status === "ongoing" ? "green" : ""}`}
                  >
                    {session.status === "ongoing" ? "Active" : "Ended"}
                  </span>
                </div>
                <h2>{session.name}</h2>
                <p className="muted">
                  {session.play_type === "doubles" ? "Doubles" : "Singles"} ·{" "}
                  {session.court_count} courts ·{" "}
                  {session.best_of === 3 ? "Best of 3" : "Single game"}
                </p>
                <div className="session-stats">
                  <span>
                    <Users size={15} />
                    {waiting} waiting
                  </span>
                  <span>
                    <Grid2X2 size={15} />
                    {playing} playing
                  </span>
                </div>
                <span className="text-link">
                  Open session <ArrowRight size={15} />
                </span>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="card empty-state">
          <ListOrdered size={36} />
          <h2>No queue sessions yet</h2>
          <p>
            Start a session, add registered players, and call the next match
            onto an available court.
          </p>
          <button
            className="btn primary"
            disabled={!configured || !user}
            onClick={() => setCreating(true)}
          >
            <Plus size={16} />
            Start your first session
          </button>
        </div>
      )}
    </div>
  );
}

export function QueueDetailPage() {
  const { id } = useParams();
  const { data, act, busy, loading } = useApp();
  const session = data.queueSessions.find((item) => item.id === id);
  const [adding, setAdding] = useState<string[]>([]);
  const [selection, setSelection] = useState<string[]>([]);
  const [court, setCourt] = useState(1);
  const navigate = useNavigate();
  const members = data.queueMembers
    .filter((member) => member.session_id === id)
    .sort((a, b) => a.position - b.position);
  const waiting = members.filter((member) => member.status === "waiting");
  const matches = data.queueMatches
    .filter((match) => match.session_id === id)
    .sort((a, b) => b.started_at.localeCompare(a.started_at));
  const active = matches.filter((match) => match.status === "playing");
  const globallyBusy = busyPlayerIds(data);
  const eligible = waiting.filter(
    (member) => !globallyBusy.has(member.player_id),
  );
  const slots = session?.play_type === "doubles" ? 4 : 2;
  const availableCourts = Array.from(
    { length: session?.court_count ?? 0 },
    (_, index) => index + 1,
  ).filter((number) => !active.some((match) => match.court_no === number));
  const suggested = session
    ? suggestNextPlayers(waiting, session.play_type, globallyBusy).map(
        (member) => member.player_id,
      )
    : [];
  const choiceKey = eligible.map((member) => member.player_id).join(",");
  useEffect(() => {
    setSelection((previous) =>
      previous.length === slots &&
      previous.every((playerId) =>
        eligible.some((member) => member.player_id === playerId),
      )
        ? previous
        : suggested,
    );
  }, [choiceKey, slots]);
  useEffect(() => {
    if (!availableCourts.includes(court)) setCourt(availableCourts[0] ?? 1);
  }, [availableCourts.join(",")]);
  if (!session)
    return (
      <div className="card empty-state">
        <h2>{loading ? "Loading session…" : "Session unavailable"}</h2>
        <Link className="btn" to="/queue">
          Back to queue sessions
        </Link>
      </div>
    );
  const playerName = (playerId: string) =>
    data.players.find((player) => player.id === playerId)?.name ??
    "Archived player";
  const selectablePlayers = data.players.filter(
    (player) =>
      !player.archived &&
      !members.some((member) => member.player_id === player.id),
  );
  async function addPlayers(event: FormEvent) {
    event.preventDefault();
    if (
      await act(
        () =>
          rpc("add_queue_players", { p_session_id: id, p_player_ids: adding }),
        "Players added to the queue.",
      )
    )
      setAdding([]);
  }
  async function startMatch(event: FormEvent) {
    event.preventDefault();
    let matchId: unknown;
    if (
      await act(async () => {
        matchId = await rpc("start_queue_match", {
          p_session_id: id,
          p_player_ids: selection,
          p_court_no: court,
        });
      }, "Players called to court.")
    ) {
      setSelection([]);
      if (typeof matchId === "string") navigate(`/matches/${matchId}`);
    }
  }
  return (
    <div className="stack">
      <Link className="back-link" to="/queue">
        <ArrowLeft size={16} />
        Queue sessions
      </Link>
      <div className="page-header">
        <div>
          <span className="eyebrow">
            {session.play_type === "doubles" ? "DOUBLES" : "SINGLES"} QUEUE
          </span>
          <h1>{session.name}</h1>
          <p className="muted">
            {members.length} players · {waiting.length} waiting ·{" "}
            {active.length} courts occupied
          </p>
        </div>
        <div className="header-actions">
          <span
            className={`badge ${session.status === "ongoing" ? "green" : ""}`}
          >
            {session.status === "ongoing" ? "Active session" : "Session ended"}
          </span>
          {session.status === "ongoing" && (
            <button
              className="btn danger"
              disabled={busy || active.length > 0}
              title={
                active.length
                  ? "Finish active matches before ending this session"
                  : undefined
              }
              onClick={() => {
                if (
                  window.confirm(
                    "End this queue session? Completed matches will stay in history.",
                  )
                )
                  void act(
                    () => rpc("end_queue_session", { p_session_id: id }),
                    "Session ended.",
                  );
              }}
            >
              End session
            </button>
          )}
        </div>
      </div>
      <div className="court-grid">
        {Array.from({ length: session.court_count }, (_, index) => {
          const match = active.find((item) => item.court_no === index + 1);
          return (
            <CourtCard
              key={index}
              number={index + 1}
              match={match}
              data={data}
              ended={session.status === "completed"}
            />
          );
        })}
      </div>
      <div className="grid-2 queue-columns">
        <section className="card stack">
          <div className="card-header">
            <h2>
              <ListOrdered size={18} />
              Waiting queue
            </h2>
            <span className="badge">{waiting.length} players</span>
          </div>
          {session.status === "ongoing" && (
            <form className="stack" onSubmit={addPlayers}>
              <label className="field">
                <span>Add registered players</span>
                <select
                  multiple
                  size={Math.min(5, Math.max(2, selectablePlayers.length))}
                  value={adding}
                  onChange={(event) =>
                    setAdding(
                      Array.from(
                        event.target.selectedOptions,
                        (option) => option.value,
                      ),
                    )
                  }
                  aria-label="Players to add to queue"
                >
                  {selectablePlayers.map((player) => (
                    <option key={player.id} value={player.id}>
                      {player.name}
                    </option>
                  ))}
                </select>
                <small className="muted">
                  Select one or more players.{" "}
                  <Link to="/players">Register a new player</Link>
                </small>
              </label>
              <button className="btn small" disabled={busy || !adding.length}>
                <Plus size={15} />
                Add {adding.length || ""} player{adding.length === 1 ? "" : "s"}
              </button>
            </form>
          )}
          {waiting.length ? (
            <ol className="queue-list">
              {waiting.map((member, index) => (
                <li key={member.id}>
                  <span className="queue-position">{index + 1}</span>
                  <div className="queue-player">
                    <strong>{playerName(member.player_id)}</strong>
                    <small className="muted">
                      {globallyBusy.has(member.player_id)
                        ? "Playing in another event"
                        : "Waiting for a court"}
                    </small>
                  </div>
                  {session.status === "ongoing" && (
                    <>
                      <label
                        className="check-label"
                        title="Return to the end of this queue after the match"
                      >
                        <input
                          type="checkbox"
                          disabled={busy}
                          checked={member.rejoin}
                          onChange={(event) =>
                            void act(() =>
                              rpc("set_queue_rejoin", {
                                p_member_id: member.id,
                                p_rejoin: event.target.checked,
                              }),
                            )
                          }
                        />
                        Rejoin
                      </label>
                      <button
                        className="btn ghost icon-button"
                        aria-label={`Remove ${playerName(member.player_id)} from queue`}
                        disabled={busy}
                        onClick={() =>
                          void act(
                            () =>
                              rpc("remove_queue_player", {
                                p_member_id: member.id,
                              }),
                            "Player removed from the queue.",
                          )
                        }
                      >
                        <Trash2 size={16} />
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ol>
          ) : (
            <div className="empty-state compact">
              <Users size={26} />
              <p>No players waiting.</p>
            </div>
          )}
          {members.some((member) => member.status === "playing") && (
            <div className="stack">
              <h3>Currently playing</h3>
              {members
                .filter((member) => member.status === "playing")
                .map((member) => (
                  <div className="queue-playing-row" key={member.id}>
                    <span className="status-dot" />
                    <strong>{playerName(member.player_id)}</strong>
                    <label className="check-label">
                      <input
                        type="checkbox"
                        checked={member.rejoin}
                        disabled={busy}
                        onChange={(event) =>
                          void act(() =>
                            rpc("set_queue_rejoin", {
                              p_member_id: member.id,
                              p_rejoin: event.target.checked,
                            }),
                          )
                        }
                      />
                      Rejoin after match
                    </label>
                  </div>
                ))}
            </div>
          )}
        </section>
        <section className="card stack">
          <div className="card-header">
            <div>
              <h2>
                <Play size={18} />
                Call next players
              </h2>
              <p className="muted">
                FIFO suggestions. Adjust the teams before starting.
              </p>
            </div>
            <button
              className="btn ghost small"
              disabled={busy || session.status !== "ongoing"}
              onClick={() => setSelection(suggested)}
            >
              <RefreshCw size={14} />
              Suggest next
            </button>
          </div>
          {session.status === "ongoing" ? (
            <form onSubmit={startMatch} className="stack">
              <div className="form-grid">
                {Array.from({ length: slots }, (_, index) => (
                  <label className="field" key={index}>
                    <span>
                      Side {index < slots / 2 ? "A" : "B"}
                      {slots === 4 ? ` · Player ${(index % 2) + 1}` : ""}
                    </span>
                    <select
                      required
                      value={selection[index] ?? ""}
                      onChange={(event) => {
                        const next = Array.from(
                          { length: slots },
                          (_, item) => selection[item] ?? "",
                        );
                        next[index] = event.target.value;
                        setSelection(next);
                      }}
                    >
                      <option value="">Select player</option>
                      {eligible
                        .filter(
                          (member) =>
                            !selection.includes(member.player_id) ||
                            selection[index] === member.player_id,
                        )
                        .map((member) => (
                          <option value={member.player_id} key={member.id}>
                            {playerName(member.player_id)}
                          </option>
                        ))}
                    </select>
                  </label>
                ))}
              </div>
              <label className="field">
                <span>Available court</span>
                <select
                  required
                  value={availableCourts.length ? court : ""}
                  onChange={(event) => setCourt(Number(event.target.value))}
                >
                  {availableCourts.length ? (
                    availableCourts.map((number) => (
                      <option key={number} value={number}>
                        Court {number}
                      </option>
                    ))
                  ) : (
                    <option value="">All courts occupied</option>
                  )}
                </select>
              </label>
              <p className="muted">
                {eligible.length < slots
                  ? `Need ${slots - eligible.length} more available player${slots - eligible.length === 1 ? "" : "s"} for a ${session.play_type} match.`
                  : "Players who choose to rejoin return to the back of the queue."}
              </p>
              <button
                className="btn primary"
                disabled={
                  busy ||
                  !availableCourts.length ||
                  selection.filter(Boolean).length !== slots ||
                  new Set(selection).size !== slots
                }
              >
                <Play size={16} />
                Call players & start match
              </button>
            </form>
          ) : (
            <p className="muted">
              This session has ended. All results remain in match history.
            </p>
          )}
        </section>
      </div>
      <section className="card">
        <div className="card-header">
          <h2>
            <Clock3 size={18} />
            Completed matches
          </h2>
          <span className="badge">
            {matches.filter((match) => match.status === "completed").length}
          </span>
        </div>
        {matches.some((match) => match.status === "completed") ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Match</th>
                  <th>Score</th>
                  <th>Court</th>
                  <th>Completed</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {matches
                  .filter((match) => match.status === "completed")
                  .map((match) => {
                    const sides = matchSides(data, match);
                    return (
                      <tr key={match.id}>
                        <td>
                          <strong>
                            {match.winner_side === "a" ? sides[0] : sides[1]}
                          </strong>
                          <small className="muted">
                            {sides[0]} vs {sides[1]}
                          </small>
                        </td>
                        <td>
                          {match.walkover
                            ? "Walkover"
                            : matchGames(data, match.id)
                                .map(
                                  (game) => `${game.score_a}–${game.score_b}`,
                                )
                                .join(", ")}
                        </td>
                        <td>{match.court_no}</td>
                        <td>
                          {match.completed_at
                            ? new Date(match.completed_at).toLocaleTimeString(
                                [],
                                { hour: "2-digit", minute: "2-digit" },
                              )
                            : "—"}
                        </td>
                        <td>
                          <Link
                            className="text-link"
                            to={`/matches/${match.id}`}
                          >
                            View <ArrowRight size={14} />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state compact">
            <p>Finished matches will appear here.</p>
          </div>
        )}
      </section>
    </div>
  );
}

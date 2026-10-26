import { useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  Trophy,
  Plus,
  ArrowRight,
  CalendarDays,
  MapPin,
  UsersRound,
  Grid2X2,
  Pencil,
  Play,
  Shuffle,
  ListOrdered,
  ChevronUp,
  ChevronDown,
  Trash2,
  Share2,
  Eye,
  ArrowLeft,
  RotateCcw,
  Copy,
} from "lucide-react";
import { useApp } from "../hooks/useApp";
import { rpc } from "../services/api";
import { useMediaUrl } from "../hooks/useMediaUrl";
import {
  Badge,
  ConfirmationDialog,
  EmptyState,
  Modal,
  PageHeader,
  dateLabel,
} from "../components/ui";
import { TournamentForm } from "../components/TournamentForm";
import { BracketView, Standings } from "../components/BracketView";
import { CourtCard } from "../components/CourtCard";
import { MatchCard } from "../components/MatchCard";
import { generateBracket, shuffleEntries } from "../utilities/brackets";
import { FORMAT_LABELS } from "../types";
import { scoringRuleLabel } from "../utilities/scoring";
import type { Entry } from "../types";
import { DeleteButton } from "../components/DeleteButton";

export function TournamentsPage() {
  const { data, configured, user } = useApp();
  const [filter, setFilter] = useState("all"),
    [search, setSearch] = useState("");
  const tournaments = [...data.tournaments]
    .filter(
      (t) =>
        (filter === "all" || t.status === filter) &&
        t.name.toLowerCase().includes(search.toLowerCase()),
    )
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  return (
    <>
      <PageHeader
        title="Your tournaments"
        subtitle="Pick a format. Bring your players. Find your champion."
        eyebrow="EVERY BRACKET TELLS A STORY"
        actions={
          <Link className="btn primary" to="/tournaments/new">
            <Plus size={17} />
            Create tournament
          </Link>
        }
      />
      <div className="list-toolbar standalone">
        <div className="tab-buttons">
          {["all", "draft", "ongoing", "completed"].map((f) => (
            <button
              key={f}
              className={filter === f ? "selected" : ""}
              onClick={() => setFilter(f)}
            >
              {f === "all"
                ? "All tournaments"
                : f === "ongoing"
                  ? "In progress"
                  : f[0].toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <input
          aria-label="Search tournaments"
          placeholder="Search tournaments…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      {tournaments.length ? (
        <div className="grid-3">
          {tournaments.map((t) => (
            <article className="card tournament-card" key={t.id}>
              <div className="card-header">
                <span className="event-icon">
                  <Trophy size={24} />
                </span>
                <div className="button-row">
                  <DeleteButton
                    kind="tournament"
                    id={t.id}
                    name={t.name}
                    compact
                  />
                  <Badge
                    tone={
                      t.status === "ongoing"
                        ? "green"
                        : t.status === "completed"
                          ? "blue"
                          : ""
                    }
                  >
                    {t.status}
                  </Badge>
                </div>
              </div>
              <h2>
                <Link to={`/tournaments/${t.id}`}>{t.name}</Link>
              </h2>
              <p className="muted">
                {FORMAT_LABELS[t.format]} · {t.play_type}
              </p>
              <div className="tournament-meta">
                <span>
                  <CalendarDays size={15} />
                  {dateLabel(t.event_date)}
                </span>
                <span>
                  <UsersRound size={15} />
                  {
                    data.entries.filter((e) => e.tournament_id === t.id).length
                  }{" "}
                  entries
                </span>
                {t.venue && (
                  <span>
                    <MapPin size={15} />
                    {t.venue}
                  </span>
                )}
              </div>
              <div className="tournament-card-footer">
                <span>
                  {t.court_count} courts ·{" "}
                  {t.best_of === 3 ? "Best of 3" : "One game"}
                </span>
                <Link className="text-link" to={`/tournaments/${t.id}`}>
                  Open <ArrowRight size={17} />
                </Link>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <section className="card">
          <EmptyState
            title={
              search || filter !== "all"
                ? "No tournaments found"
                : "The next trophy could be yours"
            }
          >
            Single elimination, double elimination, or round robin. Create a
            tournament to get started.
            <Link
              className="btn primary"
              to={configured && user ? "/tournaments/new" : "/settings"}
            >
              <Plus size={16} />
              {configured && user
                ? "Create a tournament"
                : "Set up your workspace"}
            </Link>
          </EmptyState>
        </section>
      )}
    </>
  );
}
export function NewTournamentPage() {
  return (
    <>
      <Link className="back-link" to="/tournaments">
        <ArrowLeft size={16} />
        Tournaments
      </Link>
      <PageHeader
        title="Let’s build your tournament."
        subtitle="Start with the basics. You can add players and generate your bracket next."
        eyebrow="A NEW CHAMPION AWAITS"
      />
      <TournamentForm />
    </>
  );
}

export function TournamentDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams(),
    location = useLocation();
  const { data, loading, act, busy } = useApp();
  const tournament = data.tournaments.find((t) => t.id === id);
  const [editing, setEditing] = useState(false),
    [registering, setRegistering] = useState(false),
    [selected, setSelected] = useState<string[]>([]),
    [teamName, setTeamName] = useState("");
  const [generating, setGenerating] = useState(false),
    [random, setRandom] = useState(false),
    [resetting, setResetting] = useState(false),
    [publishing, setPublishing] = useState(false);
  const [removing, setRemoving] = useState<Entry | null>(null);
  const [renaming, setRenaming] = useState<Entry | null>(null);
  const [renamed, setRenamed] = useState("");
  const banner = useMediaUrl(tournament?.banner_path);
  if (!tournament)
    return (
      <section className="card">
        <EmptyState
          title={loading ? "Loading tournament…" : "Tournament unavailable"}
          action={
            <Link className="btn" to="/tournaments">
              Back to tournaments
            </Link>
          }
        />
      </section>
    );
  const entries = data.entries
    .filter((e) => e.tournament_id === id)
    .sort((a, b) => a.seed - b.seed);
  const matches = data.tournamentMatches.filter((m) => m.tournament_id === id);
  const games = data.games.filter((g) =>
    matches.some((m) => m.id === g.tournament_match_id),
  );
  const played = matches.filter((m) => m.status === "completed").length,
    playing = matches.filter((m) => m.status === "playing");
  const hasBracket = matches.length > 0,
    isBracket = location.pathname.endsWith("/bracket");
  const editableEntries = tournament.status === "draft" && !hasBracket;
  const registered = new Set(entries.flatMap((e) => e.player_ids));
  const available = data.players
    .filter((p) => !p.archived && !registered.has(p.id))
    .sort((a, b) => a.name.localeCompare(b.name));
  const slots = tournament.play_type !== "singles" ? 2 : 1;
  const champion = entries.find((e) => e.id === tournament.champion_entry_id);
  const publicUrl = `${window.location.origin}/public/tournaments/${id}`;
  async function move(index: number, delta: number) {
    const ids = entries.map((e) => e.id);
    [ids[index], ids[index + delta]] = [ids[index + delta], ids[index]];
    await act(() =>
      rpc("seed_entries", { p_tournament_id: id, p_entry_ids: ids }),
    );
  }
  return (
    <>
      <Link className="back-link" to="/tournaments">
        <ArrowLeft size={16} />
        Tournaments
      </Link>
      <PageHeader
        title={tournament.name}
        subtitle={
          tournament.description ??
          "Every round brings you closer to a champion."
        }
        eyebrow={FORMAT_LABELS[tournament.format].toUpperCase()}
        actions={
          <>
            <DeleteButton
              kind="tournament"
              id={tournament.id}
              name={tournament.name}
              onDeleted={() => navigate("/tournaments")}
            />
            <button className="btn" onClick={() => setEditing(true)}>
              <Pencil size={16} />
              Edit
            </button>
            <button className="btn" onClick={() => setPublishing(true)}>
              <Share2 size={16} />
              {tournament.published ? "Sharing" : "Publish results"}
            </button>
            {tournament.status === "draft" && hasBracket && (
              <button
                className="btn primary"
                disabled={busy}
                onClick={() =>
                  void act(
                    () => rpc("start_tournament", { p_tournament_id: id }),
                    "Tournament started. Assign a ready match to a court.",
                  )
                }
              >
                <Play size={16} />
                Start tournament
              </button>
            )}
          </>
        }
      />
      {banner && (
        <img
          className="tournament-banner"
          src={banner}
          alt="Tournament banner"
        />
      )}
      <div className="event-details-bar">
        <Badge
          tone={
            tournament.status === "ongoing"
              ? "green"
              : tournament.status === "completed"
                ? "blue"
                : ""
          }
        >
          {tournament.status}
        </Badge>
        <span>
          <CalendarDays size={16} />
          {dateLabel(tournament.event_date)}
        </span>
        {tournament.venue && (
          <span>
            <MapPin size={16} />
            {tournament.venue}
          </span>
        )}
        <span>
          <UsersRound size={16} />
          {entries.length}{" "}
          {tournament.play_type !== "singles" ? "teams" : "players"}
        </span>
        <span>
          <Grid2X2 size={16} />
          {tournament.court_count} courts
        </span>
        <span>
          {tournament.best_of === 3 ? "Best of 3" : "One game"} ·{" "}
          {scoringRuleLabel(tournament.scoring_rule)}
        </span>
        {tournament.published && (
          <Link className="text-link" to={`/public/tournaments/${id}`}>
            <Eye size={15} />
            Public view
          </Link>
        )}
      </div>
      {champion && (
        <div className="champion-banner">
          <span className="champion-trophy">
            <Trophy size={32} />
          </span>
          <div>
            <span className="eyebrow">YOUR CHAMPION</span>
            <h2>{champion.name}</h2>
            <p>Well played. Every point earned.</p>
          </div>
          <Badge tone="green">Tournament complete</Badge>
        </div>
      )}
      <div className="page-tabs">
        <Link to={`/tournaments/${id}`} className={!isBracket ? "active" : ""}>
          Overview & players
        </Link>
        <Link
          to={`/tournaments/${id}/bracket`}
          className={isBracket ? "active" : ""}
        >
          {tournament.format === "round_robin"
            ? "Schedule & standings"
            : "Bracket"}
          {hasBracket && <span>{played} played</span>}
        </Link>
      </div>
      {isBracket ? (
        hasBracket ? (
          <>
            <div className="section-heading">
              <div>
                <h2>
                  {tournament.format === "round_robin"
                    ? "Match schedule"
                    : "The road to the trophy"}
                </h2>
                <p className="muted">
                  Select a match to assign a court or enter scores. Scroll
                  across to explore each round.
                </p>
              </div>
              <button className="btn small" onClick={() => setResetting(true)}>
                <RotateCcw size={14} />
                Reset bracket
              </button>
            </div>
            {tournament.format === "round_robin" && (
              <Standings
                entries={entries}
                matches={matches}
                games={games}
                championId={tournament.champion_entry_id}
              />
            )}
            <BracketView matches={matches} entries={entries} games={games} />
          </>
        ) : (
          <section className="card">
            <EmptyState title="Your bracket is up next">
              Register at least two entries, then generate the draw.
              <button
                className="btn primary"
                disabled={entries.length < 2}
                onClick={() => setGenerating(true)}
              >
                <ListOrdered size={16} />
                Generate{" "}
                {tournament.format === "round_robin" ? "schedule" : "bracket"}
              </button>
            </EmptyState>
          </section>
        )
      ) : (
        <>
          <div className="grid-2 tournament-overview">
            <section className="card">
              <div className="card-header">
                <div>
                  <h2>
                    Registered{" "}
                    {tournament.play_type !== "singles" ? "teams" : "players"}{" "}
                    <span className="count-label">{entries.length}</span>
                  </h2>
                  <p>
                    {editableEntries
                      ? "Order your seeds before generating the draw."
                      : "Your registered tournament entries."}
                  </p>
                </div>
                {editableEntries && (
                  <button
                    className="btn small"
                    onClick={() => {
                      setSelected([]);
                      setTeamName("");
                      setRegistering(true);
                    }}
                  >
                    <Plus size={15} />
                    Add {tournament.play_type !== "singles" ? "team" : "player"}
                  </button>
                )}
              </div>
              {entries.length ? (
                <div className="entry-list">
                  {entries.map((entry, i) => (
                    <div key={entry.id} className="entry-row">
                      <span className="seed-number">{i + 1}</span>
                      <div>
                        <strong>{entry.name}</strong>
                        {tournament.play_type !== "singles" && (
                          <small>
                            {entry.player_ids
                              .map(
                                (pid) =>
                                  data.players.find((p) => p.id === pid)
                                    ?.name ?? "Player",
                              )
                              .join(" & ")}
                          </small>
                        )}
                      </div>
                      {tournament.play_type !== "singles" && (
                        <button
                          className="icon-btn"
                          aria-label={`Rename ${entry.name}`}
                          onClick={() => {
                            setRenaming(entry);
                            setRenamed(entry.name);
                          }}
                        >
                          <Pencil size={15} />
                        </button>
                      )}
                      {editableEntries && (
                        <div className="entry-actions">
                          <button
                            className="icon-btn"
                            aria-label={`Move ${entry.name} up`}
                            disabled={i === 0 || busy}
                            onClick={() => void move(i, -1)}
                          >
                            <ChevronUp size={16} />
                          </button>
                          <button
                            className="icon-btn"
                            aria-label={`Move ${entry.name} down`}
                            disabled={i === entries.length - 1 || busy}
                            onClick={() => void move(i, 1)}
                          >
                            <ChevronDown size={16} />
                          </button>
                          <button
                            className="icon-btn"
                            aria-label={`Remove ${entry.name}`}
                            onClick={() => setRemoving(entry)}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState title="Who’s playing?">
                  Choose from your registered players. Doubles teams need
                  exactly two players.
                  <button
                    className="btn"
                    onClick={() => {
                      setSelected([]);
                      setTeamName("");
                      setRegistering(true);
                    }}
                  >
                    <Plus size={15} />
                    Register participants
                  </button>
                </EmptyState>
              )}
            </section>
            <section className="card draw-card">
              <div className="card-header">
                <h2>{hasBracket ? "Your draw is ready" : "Build your draw"}</h2>
                <Trophy size={21} />
              </div>
              <span className="large-event-icon">
                <ListOrdered size={38} />
              </span>
              <h3>{FORMAT_LABELS[tournament.format]}</h3>
              <p className="muted">
                {tournament.format === "double_elimination"
                  ? "Two losses to be eliminated. Includes upper and lower brackets and a conditional grand final reset."
                  : tournament.format === "round_robin"
                    ? "Every entry plays every other entry once. Wins, game difference, point difference, then seed break ties."
                    : "Win and advance. Automatic BYEs keep every participant in the draw."}
              </p>
              {hasBracket ? (
                <>
                  <div className="draw-progress">
                    <span>{played} completed</span>
                    <span>
                      {
                        matches.filter(
                          (m) => !["bye", "skipped"].includes(m.status),
                        ).length
                      }{" "}
                      scheduled
                    </span>
                  </div>
                  <Link
                    className="btn primary"
                    to={`/tournaments/${id}/bracket`}
                  >
                    View{" "}
                    {tournament.format === "round_robin"
                      ? "schedule"
                      : "bracket"}
                    <ArrowRight size={16} />
                  </Link>
                </>
              ) : (
                <>
                  <button
                    className="btn primary"
                    disabled={entries.length < 2 || busy}
                    onClick={() => setGenerating(true)}
                  >
                    <Shuffle size={16} />
                    Generate{" "}
                    {tournament.format === "round_robin"
                      ? "schedule"
                      : "bracket"}
                  </button>
                  <small className="muted">
                    Register 2–64 entries to generate the draw.
                  </small>
                </>
              )}
            </section>
          </div>
          {hasBracket && (
            <section className="section-block">
              <div className="section-heading">
                <div>
                  <h2>Courts</h2>
                  <p className="muted">
                    {playing.length} playing ·{" "}
                    {tournament.court_count - playing.length} available
                  </p>
                </div>
                <Link className="text-link" to={`/tournaments/${id}/bracket`}>
                  Find a ready match <ArrowRight size={15} />
                </Link>
              </div>
              <div className="court-grid">
                {Array.from({ length: tournament.court_count }, (_, i) => (
                  <CourtCard
                    key={i}
                    number={i + 1}
                    match={playing.find((m) => m.court_no === i + 1)}
                    data={data}
                    ended={tournament.status === "completed"}
                  />
                ))}
              </div>
            </section>
          )}
          {!!playing.length && (
            <section className="section-block">
              <div className="section-heading">
                <h2>On court now</h2>
              </div>
              <div className="grid-3">
                {playing.map((m) => (
                  <MatchCard
                    key={m.id}
                    match={m}
                    data={data}
                    eventName={tournament.name}
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )}
      {editing && (
        <Modal title="Edit tournament" onClose={() => setEditing(false)}>
          <TournamentForm
            tournament={tournament}
            onDone={() => setEditing(false)}
          />
        </Modal>
      )}
      {registering && (
        <Modal
          title={
            slots === 2
              ? tournament.play_type === "mixed"
                ? "Register a mixed doubles team"
                : "Register a doubles team"
              : "Register a player"
          }
          onClose={() => setRegistering(false)}
        >
          <form
            className="stack"
            onSubmit={async (e) => {
              e.preventDefault();
              const names = selected
                .map((pid) => data.players.find((p) => p.id === pid)!.name)
                .join(" & ");
              if (
                await act(
                  () =>
                    rpc("register_entry", {
                      p_tournament_id: id,
                      p_name: teamName.trim() || names.slice(0, 150),
                      p_player_ids: selected,
                    }),
                  "Entry registered.",
                )
              ) {
                setSelected([]);
                setTeamName("");
                setRegistering(false);
              }
            }}
          >
            <p className="muted">
              Select exactly {slots} {slots === 1 ? "player" : "players"}. A
              player can only be registered once per tournament.
            </p>
            {available.length ? (
              <div className="player-picker">
                {available.map((p) => (
                  <label
                    key={p.id}
                    className={`picker-row ${selected.includes(p.id) ? "selected" : ""}`}
                  >
                    <input
                      type="checkbox"
                      aria-label={p.name}
                      checked={selected.includes(p.id)}
                      disabled={
                        !selected.includes(p.id) && selected.length >= slots
                      }
                      onChange={(e) =>
                        setSelected((prev) =>
                          e.target.checked
                            ? [...prev, p.id]
                            : prev.filter((x) => x !== p.id),
                        )
                      }
                    />
                    <span className="avatar small" aria-hidden="true">
                      {p.name[0]?.toUpperCase()}
                    </span>
                    <span>{p.name}</span>
                  </label>
                ))}
              </div>
            ) : (
              <EmptyState title="No available players">
                Add players first, or check whether they are already registered.
                <Link to="/players?add=1" className="btn">
                  Add players
                </Link>
              </EmptyState>
            )}
            {slots === 2 && (
              <label className="field">
                Team name <span className="muted">(optional)</span>
                <input
                  maxLength={150}
                  placeholder="Defaults to both player names"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                />
              </label>
            )}
            <div className="form-actions">
              <button
                className="btn"
                type="button"
                onClick={() => setRegistering(false)}
              >
                Cancel
              </button>
              <button
                className="btn primary"
                disabled={selected.length !== slots || busy}
              >
                Register {slots === 2 ? "team" : "player"}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {generating && (
        <Modal title="Generate the draw" onClose={() => setGenerating(false)}>
          <div className="stack">
            <p className="muted">
              {entries.length} entries · {FORMAT_LABELS[tournament.format]}.
              BYEs are assigned automatically where needed.
            </p>
            <label className="check-label">
              <input
                type="radio"
                name="draw"
                checked={!random}
                onChange={() => setRandom(false)}
              />
              Use the current seed order
            </label>
            <label className="check-label">
              <input
                type="radio"
                name="draw"
                checked={random}
                onChange={() => setRandom(true)}
              />
              Randomize the entries
            </label>
            <p className="callout small-text">
              Registration locks after the draw is generated. Resetting the
              bracket requires confirmation and removes existing results.
            </p>
            <div className="form-actions">
              <button className="btn" onClick={() => setGenerating(false)}>
                Cancel
              </button>
              <button
                className="btn primary"
                disabled={busy}
                onClick={() =>
                  void act(async () => {
                    const ids = random
                      ? shuffleEntries(entries.map((e) => e.id))
                      : entries.map((e) => e.id);
                    if (random)
                      await rpc("seed_entries", {
                        p_tournament_id: id,
                        p_entry_ids: ids,
                      });
                    await rpc("generate_bracket", {
                      p_tournament_id: id,
                      p_matches: generateBracket(ids, tournament.format),
                    });
                  }, "Draw generated. Start the tournament when you’re ready.").then(
                    (ok) => {
                      if (ok) setGenerating(false);
                    },
                  )
                }
              >
                {busy ? "Generating…" : "Generate draw"}
              </button>
            </div>
          </div>
        </Modal>
      )}
      {resetting && (
        <ConfirmationDialog
          title="Reset this bracket?"
          danger
          busy={busy}
          onClose={() => setResetting(false)}
          onConfirm={() =>
            void act(
              () => rpc("reset_bracket", { p_tournament_id: id }),
              "Bracket reset.",
            ).then((ok) => {
              if (ok) setResetting(false);
            })
          }
        >
          This permanently removes the bracket and all its game scores, clears
          the champion, and returns the tournament to Draft. Finish any active
          matches first.
        </ConfirmationDialog>
      )}
      {removing && (
        <ConfirmationDialog
          title={`Remove ${removing.name}?`}
          busy={busy}
          danger
          onClose={() => setRemoving(null)}
          onConfirm={() =>
            void act(
              () => rpc("remove_entry", { p_entry_id: removing.id }),
              "Entry removed.",
            ).then((ok) => {
              if (ok) setRemoving(null);
            })
          }
        >
          This removes the entry from the draft tournament. The player records
          remain available.
        </ConfirmationDialog>
      )}
      {renaming && (
        <Modal title="Rename tournament team" onClose={() => setRenaming(null)}>
          <form
            className="stack"
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                await act(
                  () =>
                    rpc("rename_tournament_team", {
                      p_entry_id: renaming.id,
                      p_name: renamed.trim(),
                    }),
                  "Team name updated.",
                )
              )
                setRenaming(null);
            }}
          >
            <label className="field">
              Team name
              <input
                autoFocus
                required
                maxLength={150}
                value={renamed}
                onChange={(e) => setRenamed(e.target.value)}
              />
            </label>
            <div className="form-actions">
              <button
                type="button"
                className="btn"
                onClick={() => setRenaming(null)}
              >
                Cancel
              </button>
              <button
                className="btn primary"
                disabled={busy || !renamed.trim()}
              >
                Save team name
              </button>
            </div>
          </form>
        </Modal>
      )}
      {publishing && (
        <Modal
          title="Share your tournament"
          onClose={() => setPublishing(false)}
        >
          <div className="stack">
            <p className="muted">
              Published tournaments appear on the public home page with event
              details, entry names, brackets, and scores. Players can follow
              live progress and past results without an account.
            </p>
            {tournament.published && (
              <>
                <label className="field">
                  Public results link
                  <input readOnly value={publicUrl} />
                </label>
                <div className="button-row">
                  <button
                    className="btn"
                    onClick={() =>
                      void act(async () => {
                        await navigator.clipboard.writeText(publicUrl);
                      }, "Public link copied.")
                    }
                  >
                    <Copy size={16} />
                    Copy link
                  </button>
                  <Link className="btn" to={`/public/tournaments/${id}`}>
                    <Eye size={16} />
                    Open public view
                  </Link>
                </div>
              </>
            )}
            <div className="form-actions">
              <button className="btn" onClick={() => setPublishing(false)}>
                Close
              </button>
              <button
                className={`btn ${tournament.published ? "" : "primary"}`}
                disabled={busy}
                onClick={() =>
                  void act(
                    () =>
                      rpc("publish_tournament", {
                        p_tournament_id: id,
                        p_published: !tournament.published,
                      }),
                    tournament.published
                      ? "Tournament is now private."
                      : "Public results are live.",
                  ).then((ok) => {
                    if (ok && tournament.published) setPublishing(false);
                  })
                }
              >
                {tournament.published ? "Make private" : "Publish tournament"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

import { Link } from "react-router-dom";
import {
  UsersRound,
  Trophy,
  Swords,
  ListOrdered,
  Plus,
  ArrowUpRight,
  ArrowRight,
  Circle,
  CalendarDays,
  MapPin,
  ChevronRight,
} from "lucide-react";
import { useApp } from "../hooks/useApp";
import { Badge, EmptyState, PageHeader, dateLabel } from "../components/ui";
import { FORMAT_LABELS } from "../types";
import { scheduleLabel } from "../utilities/schedule";

export function DashboardPage() {
  const { data } = useApp();
  const activeTournaments = data.tournaments.filter(
    (t) => t.status === "ongoing" && !t.queue_session_id,
  );
  const activeQueues = data.queueSessions.filter((t) => t.status === "ongoing");
  const playingT = data.tournamentMatches.filter((m) => m.status === "playing");
  const playingQ = data.queueMatches.filter((m) => m.status === "playing");
  const waiting = data.queueMembers.filter(
    (m) =>
      m.status === "waiting" &&
      data.queueSessions.some(
        (s) => s.id === m.session_id && s.mode !== "bracket",
      ),
  ).length;
  const totalCourts = [...activeTournaments, ...activeQueues].reduce(
    (sum, e) => sum + e.court_count,
    0,
  );
  const occupied = playingT.length + playingQ.length;
  const recent = [
    ...data.tournamentMatches
      .filter((m) => m.status === "completed")
      .map((m) => ({
        id: m.id,
        date: m.completed_at!,
        a: data.entries.find((e) => e.id === m.entry_a_id)?.name ?? "—",
        b: data.entries.find((e) => e.id === m.entry_b_id)?.name ?? "—",
        event: data.tournaments.find((t) => t.id === m.tournament_id)?.name,
        winner: data.entries.find((e) => e.id === m.winner_entry_id)?.name,
      })),
    ...data.queueMatches
      .filter((m) => m.status === "completed")
      .map((m) => {
        const names = (side: string) =>
          data.queueMatchPlayers
            .filter((p) => p.match_id === m.id && p.side === side)
            .map(
              (p) =>
                data.players.find((x) => x.id === p.player_id)?.name ??
                "Player",
            )
            .join(" & ");
        return {
          id: m.id,
          date: m.completed_at!,
          a: names("a"),
          b: names("b"),
          event: data.queueSessions.find((q) => q.id === m.session_id)?.name,
          winner: names(m.winner_side!),
        };
      }),
  ]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 4);
  const stats = [
    {
      label: "Registered players",
      value: data.players.filter((p) => !p.archived).length,
      detail: "Ready to step on court",
      icon: UsersRound,
      color: "blue",
      to: "/players",
    },
    {
      label: "Active tournaments",
      value: activeTournaments.length,
      detail: `${data.tournaments.filter((t) => t.status === "completed" && !t.queue_session_id).length} completed tournaments`,
      icon: Trophy,
      color: "violet",
      to: "/tournaments",
    },
    {
      label: "Matches in play",
      value: occupied,
      detail: "Across your active courts",
      icon: Swords,
      color: "green",
      to: "/matches?status=playing",
    },
    {
      label: "Players in queue",
      value: waiting,
      detail: `${activeQueues.length} active queue sessions`,
      icon: ListOrdered,
      color: "orange",
      to: "/queue",
    },
  ];
  return (
    <>
      <PageHeader
        title="Let’s get the games going."
        subtitle="Your players, courts, and tournaments. All in one place."
        eyebrow="YOUR GAME, ORGANIZED"
        actions={
          <>
            <Link className="btn" to="/players?add=1">
              <Plus size={17} />
              Add player
            </Link>
            <Link className="btn primary" to="/tournaments/new">
              <Plus size={17} />
              Create tournament
            </Link>
          </>
        }
      />
      <div className="stats-grid">
        {stats.map((s) => (
          <Link key={s.label} to={s.to} className="stat-card">
            <div className="stat-top">
              <span>{s.label}</span>
              <span className={`stat-icon ${s.color}`}>
                <s.icon size={19} />
              </span>
            </div>
            <strong className="stat-value">
              {s.value}
              <ArrowUpRight size={18} />
            </strong>
            <span className="stat-detail">{s.detail}</span>
          </Link>
        ))}
      </div>
      <div className="dashboard-grid">
        <section className="card court-overview">
          <div className="card-header">
            <div>
              <h2>Court overview</h2>
              <p>A little less waiting. A lot more play.</p>
            </div>
            <Badge tone={occupied ? "green" : ""}>
              <span className="tiny-dot" />
              {occupied ? `${occupied} in play` : "All clear"}
            </Badge>
          </div>
          <div className="court-summary">
            <div>
              <strong>{totalCourts - occupied}</strong>
              <span>
                <i className="dot green-dot" />
                Available courts
              </span>
            </div>
            <div>
              <strong>{occupied}</strong>
              <span>
                <i className="dot blue-dot" />
                Occupied courts
              </span>
            </div>
            <div>
              <strong>{totalCourts}</strong>
              <span>
                <i className="dot gray-dot" />
                Total courts
              </span>
            </div>
          </div>
          {totalCourts ? (
            <div className="court-mini-grid">
              {[
                ...activeTournaments.map((t) => ({
                  ...t,
                  path: `/tournaments/${t.id}`,
                  matches: playingT.filter((m) => m.tournament_id === t.id),
                })),
                ...activeQueues.map((q) => ({
                  ...q,
                  path: `/queue/${q.id}`,
                  matches: [
                    ...playingQ.filter((m) => m.session_id === q.id),
                    ...playingT.filter((m) =>
                      data.tournaments.some(
                        (t) =>
                          t.id === m.tournament_id &&
                          t.queue_session_id === q.id,
                      ),
                    ),
                  ],
                })),
              ].flatMap((e) =>
                Array.from({ length: e.court_count }, (_, i) => (
                  <Link
                    key={`${e.id}-${i}`}
                    className={`court-tile ${e.matches.some((m) => m.court_no === i + 1) ? "occupied" : ""}`}
                    to={e.path}
                  >
                    <div className="court-lines">
                      <span />
                    </div>
                    <strong>Court {i + 1}</strong>
                    <small>{e.name}</small>
                    <Badge
                      tone={
                        e.matches.some((m) => m.court_no === i + 1)
                          ? "blue"
                          : "green"
                      }
                    >
                      {e.matches.some((m) => m.court_no === i + 1)
                        ? "Playing"
                        : "Available"}
                    </Badge>
                  </Link>
                )),
              )}
            </div>
          ) : (
            <div className="court-idle">
              <div className="court-illustration">
                <span className="court-net" />
                <span className="court-mid" />
                <Circle size={18} />
              </div>
              <div>
                <h3>Your next rally starts here</h3>
                <p>
                  Create a queue session or tournament to bring your courts
                  online.
                </p>
              </div>
              <Link to="/queue?new=1" className="btn">
                <Plus size={16} />
                Start queue session
              </Link>
            </div>
          )}
        </section>
        <section className="card quick-start">
          <div className="card-header">
            <h2>Make it a match</h2>
            <span className="subtle-icon">
              <Swords size={20} />
            </span>
          </div>
          <p className="muted">
            A friendly game or a tournament to remember. You’re in control.
          </p>
          <Link className="quick-action" to="/queue?new=1">
            <span className="action-icon green">
              <ListOrdered size={20} />
            </span>
            <div>
              <strong>Start a queue session</strong>
              <small>Call players, rotate, repeat</small>
            </div>
            <ChevronRight size={17} />
          </Link>
          <Link className="quick-action" to="/tournaments/new">
            <span className="action-icon blue">
              <Trophy size={20} />
            </span>
            <div>
              <strong>Build a tournament</strong>
              <small>Three formats. One champion.</small>
            </div>
            <ChevronRight size={17} />
          </Link>
          <Link className="quick-action" to="/matches?status=playing">
            <span className="action-icon violet">
              <Swords size={20} />
            </span>
            <div>
              <strong>Head to live matches</strong>
              <small>Every point, as it happens</small>
            </div>
            <ChevronRight size={17} />
          </Link>
        </section>
      </div>
      <div className="dashboard-grid lower-grid">
        <section className="card">
          <div className="card-header">
            <div>
              <h2>Your tournaments</h2>
              <p>From the opening round to the podium.</p>
            </div>
            <Link className="text-link" to="/tournaments">
              View all <ArrowRight size={15} />
            </Link>
          </div>
          {data.tournaments.some((t) => !t.queue_session_id) ? (
            <div className="event-list">
              {data.tournaments
                .filter((t) => !t.queue_session_id)
                .slice(0, 3)
                .map((t) => (
                  <Link
                    className="event-row"
                    to={`/tournaments/${t.id}`}
                    key={t.id}
                  >
                    <span className="event-icon">
                      <Trophy size={22} />
                    </span>
                    <div className="event-info">
                      <strong>{t.name}</strong>
                      <span>
                        <CalendarDays size={12} />
                        {scheduleLabel(t)}
                        <span>·</span>
                        {FORMAT_LABELS[t.format]}
                      </span>
                    </div>
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
                    <ChevronRight size={16} />
                  </Link>
                ))}
            </div>
          ) : (
            <EmptyState title="A champion is waiting to be crowned">
              Set up your first singles or doubles tournament.
              <Link to="/tournaments/new" className="text-link centered">
                Create your first tournament <ArrowRight size={15} />
              </Link>
            </EmptyState>
          )}
        </section>
        <section className="card">
          <div className="card-header">
            <div>
              <h2>Latest results</h2>
              <p>The final points. The well-earned wins.</p>
            </div>
            <Link className="text-link" to="/matches">
              View all <ArrowRight size={15} />
            </Link>
          </div>
          {recent.length ? (
            <div className="event-list">
              {recent.map((m) => (
                <Link to={`/matches/${m.id}`} className="event-row" key={m.id}>
                  <span className="result-icon">
                    <Swords size={19} />
                  </span>
                  <div className="event-info">
                    <strong>
                      {m.a} <span className="muted">vs</span> {m.b}
                    </strong>
                    <span>
                      {m.event} · {dateLabel(m.date)}
                    </span>
                    <small className="winner-label">{m.winner} won</small>
                  </div>
                  <ChevronRight size={16} />
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState title="The scoreboard is a clean slate">
              Completed matches and winners will appear here.
              <Link to="/matches" className="text-link centered">
                Explore matches <ArrowRight size={15} />
              </Link>
            </EmptyState>
          )}
        </section>
      </div>
      <div className="dashboard-tip">
        <span>GOOD TO KNOW</span>
        <p>
          Playing doubles? Register your players once, then pair them into teams
          for any tournament.
        </p>
        <Link to="/players">
          Meet your players <ArrowRight size={15} />
        </Link>
      </div>
    </>
  );
}

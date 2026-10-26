import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { CalendarDays, MapPin, Radio, Trophy, LockKeyhole } from "lucide-react";
import { Brand } from "../layouts/AppLayout";
import { loadPublicTournament } from "../services/api";
import { supabase } from "../lib/supabase";
import { BracketView, Standings } from "../components/BracketView";
import { Badge, dateLabel, EmptyState } from "../components/ui";
import { FORMAT_LABELS } from "../types";

export function PublicTournamentPage() {
  const { id } = useParams();
  const [data, setData] = useState<Awaited<
    ReturnType<typeof loadPublicTournament>
  > | null>(null);
  const [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [live, setLive] = useState(false);
  const request = useRef(0);
  const fetchData = useCallback(async () => {
    const current = ++request.current;
    try {
      const result = await loadPublicTournament(id!);
      if (current === request.current) {
        setData(result);
        setError("");
      }
    } catch (e) {
      if (current === request.current)
        setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (current === request.current) setLoading(false);
    }
  }, [id]);
  useEffect(() => {
    void fetchData();
    if (!supabase) return;
    let timer: ReturnType<typeof setTimeout>;
    const update = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void fetchData(), 150);
    };
    const channel = supabase
      .channel(`public-tournament-${id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tournaments",
          filter: `id=eq.${id}`,
        },
        update,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tournament_matches",
          filter: `tournament_id=eq.${id}`,
        },
        update,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tournament_entries",
          filter: `tournament_id=eq.${id}`,
        },
        update,
      )
      .subscribe((status) => {
        setLive(status === "SUBSCRIBED");
        if (status === "SUBSCRIBED") void fetchData();
      });
    const interval = setInterval(() => void fetchData(), 20000);
    window.addEventListener("focus", update);
    return () => {
      request.current++;
      clearTimeout(timer);
      clearInterval(interval);
      window.removeEventListener("focus", update);
      void supabase!.removeChannel(channel);
    };
  }, [id, fetchData]);
  const tournament = data?.tournament,
    champion = data?.entries.find(
      (e) => e.id === tournament?.champion_entry_id,
    );
  return (
    <div className="public-page">
      <header className="public-header">
        <Brand />
        <span className={`connection ${live ? "connected" : ""}`}>
          <span />
          {live ? "Live results" : "Public results"}
        </span>
        <Link className="btn small" to="/login">
          Organizer sign in
        </Link>
      </header>
      <main className="public-content">
        {loading ? (
          <div className="empty-state">Loading tournament…</div>
        ) : error ? (
          <div role="alert" className="error-banner">
            {error}
            <button className="btn" onClick={() => void fetchData()}>
              Retry
            </button>
          </div>
        ) : !tournament ? (
          <div className="card">
            <EmptyState title="This tournament is private or unavailable">
              Ask the organizer to publish the tournament and share its results
              link.
            </EmptyState>
          </div>
        ) : (
          <>
            <div className="public-title">
              <span className="eyebrow">
                {FORMAT_LABELS[tournament.format].toUpperCase()}
              </span>
              <h1>{tournament.name}</h1>
              {tournament.description && (
                <p className="muted">{tournament.description}</p>
              )}
              <div className="event-details-bar">
                <Badge tone={tournament.status === "ongoing" ? "green" : ""}>
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
                  {tournament.play_type} ·{" "}
                  {tournament.best_of === 3 ? "Best of 3" : "One game"}
                </span>
                <span>
                  <LockKeyhole size={14} />
                  Spectator view
                </span>
              </div>
            </div>
            {champion && (
              <div className="champion-banner">
                <Trophy size={38} />
                <div>
                  <span className="eyebrow">TOURNAMENT CHAMPION</span>
                  <h2>{champion.name}</h2>
                </div>
              </div>
            )}
            {tournament.format === "round_robin" && (
              <Standings
                entries={data!.entries}
                matches={data!.matches}
                games={data!.games}
                championId={tournament.champion_entry_id}
              />
            )}
            <section className="card public-bracket">
              {data!.matches.length ? (
                <BracketView
                  matches={data!.matches}
                  entries={data!.entries}
                  games={data!.games}
                  readOnly
                />
              ) : (
                <EmptyState title="The draw is coming soon">
                  Registered entries: {data!.entries.length}. Check back when
                  the organizer generates the bracket.
                </EmptyState>
              )}
            </section>
            <p className="public-footnote">
              <Radio size={14} />
              Scores update automatically. Tournament data is maintained by the
              organizer.
            </p>
          </>
        )}
      </main>
      <footer className="public-footer">Qmaster · Badminton, organized.</footer>
    </div>
  );
}

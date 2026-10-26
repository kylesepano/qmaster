import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { Brand } from "../layouts/AppLayout";
import { useApp } from "../hooks/useApp";

export function PublicLayout({
  children,
  live = false,
}: {
  children: ReactNode;
  live?: boolean;
}) {
  const { user } = useApp();
  const location = useLocation();
  const sessions = location.pathname.startsWith("/public/sessions");
  const players = location.pathname.startsWith("/public/players");
  const games = location.pathname === "/public/games";
  return (
    <div className="public-page">
      <header className="public-header event-header">
        <Brand />
        <nav aria-label="Public navigation">
          <Link className={location.pathname === "/" ? "active" : ""} to="/">
            Home
          </Link>
          <Link className={games ? "active" : ""} to="/public/games">
            Games
          </Link>
          <Link className={players ? "active" : ""} to="/public/players">
            Players
          </Link>
          <Link className={sessions ? "active" : ""} to="/public/sessions">
            Sessions
          </Link>
          <Link
            className={
              location.pathname.startsWith("/public/tournaments")
                ? "active"
                : ""
            }
            to="/public/tournaments"
          >
            Tournaments
          </Link>
        </nav>
        <span className={`connection ${live ? "connected" : ""}`}>
          <span />
          {live ? "Live updates" : "Event updates"}
        </span>
        <Link className="btn small" to={user ? "/dashboard" : "/login"}>
          {user ? "Admin dashboard" : "Admin login"}
        </Link>
      </header>
      <main className="public-content">{children}</main>
      <footer className="public-footer">Qmaster</footer>
    </div>
  );
}

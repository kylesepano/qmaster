import type { ReactNode } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
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
  const [params] = useSearchParams();
  const location = useLocation();
  const sessions =
    params.get("view") === "sessions" ||
    location.pathname.startsWith("/public/sessions/");
  return (
    <div className="public-page">
      <header className="public-header event-header">
        <Brand />
        <nav aria-label="Public navigation">
          <Link className={!sessions ? "active" : ""} to="/">
            Tournaments
          </Link>
          <Link className={sessions ? "active" : ""} to="/?view=sessions">
            Queue sessions
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
      <footer className="public-footer">Qmaster · Badminton, organized.</footer>
    </div>
  );
}

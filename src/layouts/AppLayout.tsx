import { NavLink, Outlet, Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  UsersRound,
  ListOrdered,
  Trophy,
  Swords,
  Settings,
  LogOut,
  Menu,
  X,
  ChevronRight,
  Radio,
  CircleHelp,
} from "lucide-react";
import { useState } from "react";
import { useApp } from "../hooks/useApp";
import { db } from "../services/api";

const links = [
  { to: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { to: "/players", label: "Players", icon: UsersRound },
  { to: "/queue", label: "Queue sessions", icon: ListOrdered },
  { to: "/tournaments", label: "Tournaments", icon: Trophy },
  { to: "/matches", label: "Matches & results", icon: Swords },
];
export function Brand({ to = "/" }: { to?: string }) {
  return (
    <Link to={to} className="brand">
      <img src="/favicon.svg" alt="" />
      <span>
        Qmaster<span className="brand-dot">.</span>
      </span>
    </Link>
  );
}
export function AppLayout() {
  const {
    user,
    configured,
    live,
    notice,
    clearNotice,
    error,
    refresh,
    loading,
    act,
  } = useApp();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const section =
    [...links, { to: "/settings", label: "Settings" }].find((l) =>
      location.pathname.startsWith(l.to),
    )?.label ?? "Workspace";
  return (
    <div className="app-shell">
      {open && <div className="nav-scrim" onClick={() => setOpen(false)} />}
      <aside className={`sidebar ${open ? "is-open" : ""}`}>
        <div className="sidebar-brand">
          <Brand to="/dashboard" />
          <button
            className="icon-btn mobile-only"
            onClick={() => setOpen(false)}
            aria-label="Close navigation"
          >
            <X size={20} />
          </button>
        </div>
        <div className="workspace-label">
          <span className="workspace-mark">Q</span>
          <div>
            <strong>Your workspace</strong>
            <small>Badminton management</small>
          </div>
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav aria-label="Main navigation">
          {links.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `nav-item ${isActive ? "active" : ""}`
              }
            >
              <Icon size={19} />
              <span>{label}</span>
              {to === "/tournaments" && (
                <span className="nav-new">3 formats</span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <NavLink
            className="nav-item"
            to="/settings"
            onClick={() => setOpen(false)}
          >
            <Settings size={19} />
            <span>Settings</span>
          </NavLink>
          <div className="sidebar-footer">
            <span className="tiny-dot" />
            Made for the love of the game
          </div>
        </div>
      </aside>
      <div className="workspace-main">
        <header className="topbar">
          <div className="breadcrumbs">
            <button
              className="icon-btn mobile-only"
              aria-label="Open navigation"
              onClick={() => setOpen(true)}
            >
              <Menu size={21} />
            </button>
            <span className="desktop-only">Workspace</span>
            <ChevronRight className="desktop-only" size={14} />
            <strong>{section}</strong>
          </div>
          <div className="topbar-right">
            <span className={`connection ${live ? "connected" : ""}`}>
              <span />
              {!configured
                ? "Setup required"
                : live
                  ? "Live updates on"
                  : "Reconnecting"}
            </span>
            <Link
              className="icon-btn help-button"
              to="/settings"
              title="Settings"
            >
              <CircleHelp size={19} />
            </Link>
            <span className="topbar-divider" />
            <div
              className="organizer-avatar"
              title={user?.email ?? "Organizer"}
            >
              {user?.email?.[0]?.toUpperCase() ?? "O"}
            </div>
            <div className="organizer-label">
              <strong>Organizer</strong>
              <small>{user?.email ?? "Your workspace"}</small>
            </div>
            {user && (
              <button
                className="icon-btn"
                aria-label="Sign out"
                onClick={() =>
                  void act(async () => {
                    const { error } = await db().auth.signOut();
                    if (error) throw error;
                  })
                }
              >
                <LogOut size={17} />
              </button>
            )}
          </div>
        </header>
        <main className="main-content">
          {!configured && (
            <div className="setup-banner">
              <Radio size={17} />
              <span>
                Your workspace is ready to connect. Add your Supabase
                credentials to start saving data.
              </span>
              <Link to="/">
                Public homepage <ChevronRight size={15} />
              </Link>
            </div>
          )}
          {error && (
            <div role="alert" className="error-banner">
              {error}
              <button className="btn small" onClick={() => void refresh()}>
                Retry
              </button>
            </div>
          )}
          {loading && (
            <div className="loading-line" aria-label="Refreshing workspace" />
          )}
          <Outlet />
        </main>
        <footer className="app-footer">
          <span>
            Qmaster <span className="muted">/</span> Badminton, organized.
          </span>
          <span>One point at a time.</span>
        </footer>
      </div>
      {notice && (
        <div
          className={`toast ${notice.error ? "toast-error" : ""}`}
          role={notice.error ? "alert" : "status"}
        >
          <span>{notice.text}</span>
          <button
            className="icon-btn"
            aria-label="Dismiss notification"
            onClick={clearNotice}
          >
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

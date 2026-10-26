import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { AppLayout } from "../layouts/AppLayout";
import { useApp } from "../hooks/useApp";
import { DashboardPage } from "../pages/DashboardPage";
import { LoginPage } from "../pages/LoginPage";
import { PlayersPage } from "../pages/PlayersPage";
import { SettingsPage } from "../pages/SettingsPage";
import { QueueListPage, QueueDetailPage } from "../pages/QueuePages";
import { MatchesPage, MatchDetailPage } from "../pages/MatchPages";
import {
  TournamentsPage,
  NewTournamentPage,
  TournamentDetailPage,
} from "../pages/TournamentPages";
import { PublicTournamentPage } from "../pages/PublicTournamentPage";
import { PublicHomePage } from "../pages/PublicHomePage";
import { PublicGamesPage } from "../pages/PublicGamesPage";
import { PublicSessionPage } from "../pages/PublicSessionPage";
import { PublicPlayersPage } from "../pages/PublicPlayersPage";

function Protected() {
  const { user, authLoading, configured } = useApp();
  return authLoading ? (
    <div className="boot-loading">
      <img src="/favicon.svg" alt="" />
      <p>Opening Qmaster…</p>
    </div>
  ) : configured && !user ? (
    <Navigate to="/login" replace />
  ) : (
    <Outlet />
  );
}
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<PublicHomePage />} />
      <Route path="/public/games" element={<PublicGamesPage />} />
      <Route path="/public/sessions/:id" element={<PublicSessionPage />} />
      <Route path="/public/players" element={<PublicPlayersPage />} />
      <Route path="/public/players/:id" element={<PublicPlayersPage />} />
      <Route
        path="/public/tournaments/:id"
        element={<PublicTournamentPage />}
      />
      <Route element={<Protected />}>
        <Route element={<AppLayout />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/players" element={<PlayersPage />} />
          <Route path="/queue" element={<QueueListPage />} />
          <Route path="/queue/:id" element={<QueueDetailPage />} />
          <Route path="/tournaments" element={<TournamentsPage />} />
          <Route path="/tournaments/new" element={<NewTournamentPage />} />
          <Route path="/tournaments/:id" element={<TournamentDetailPage />} />
          <Route
            path="/tournaments/:id/bracket"
            element={<TournamentDetailPage />}
          />
          <Route path="/matches" element={<MatchesPage />} />
          <Route path="/matches/:id" element={<MatchDetailPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Route>
      <Route
        path="*"
        element={
          <div className="not-found">
            <h1>Out of bounds.</h1>
            <p>This page doesn’t exist.</p>
            <a className="btn primary" href="/">
              Back to Qmaster
            </a>
          </div>
        }
      />
    </Routes>
  );
}

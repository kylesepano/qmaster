import { useState } from "react";
import { Navigate, Link } from "react-router-dom";
import { ArrowRight, ShieldCheck, Trophy } from "lucide-react";
import { Brand } from "../layouts/AppLayout";
import { useApp } from "../hooks/useApp";
import { db } from "../services/api";

export function LoginPage() {
  const { user, configured, authLoading } = useApp();
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  if (user) return <Navigate to="/dashboard" replace />;
  return (
    <div className="login-page">
      <div className="login-art">
        <Brand />
        <div className="login-message">
          <span className="eyebrow">LESS ADMIN. MORE PLAY.</span>
          <h1>
            Every great game
            <br />
            starts with a<br />
            <em>little organization.</em>
          </h1>
          <p>
            Queues that keep moving. Brackets that make sense. Every point, in
            its place.
          </p>
          <div className="login-court">
            <div className="court-illustration">
              <span className="court-net" />
              <span className="court-mid" />
            </div>
          </div>
          <span className="login-art-footer">
            <Trophy size={17} />
            Your next champion starts here.
          </span>
        </div>
      </div>
      <div className="login-form-wrap">
        <div className="login-form">
          <span className="eyebrow">WELCOME TO QMASTER</span>
          <h2>Back in the game.</h2>
          <p className="muted">Sign in to manage your Qmaster workspace.</p>
          {!configured ? (
            <div className="setup-card">
              <ShieldCheck size={26} />
              <h3>Admin sign-in is unavailable</h3>
              <p>Please contact the organizer to enable admin access.</p>
              <Link className="btn primary" to="/">
                View tournaments <ArrowRight size={16} />
              </Link>
            </div>
          ) : (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                setError("");
                try {
                  const { error } = await db().auth.signInWithPassword({
                    email,
                    password,
                  });
                  if (error) throw error;
                } catch (e) {
                  setError(e instanceof Error ? e.message : String(e));
                } finally {
                  setBusy(false);
                }
              }}
              className="stack"
            >
              <label className="field">
                Email address
                <input
                  type="email"
                  autoComplete="username"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </label>
              <label className="field">
                Password
                <input
                  type="password"
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </label>
              {error && (
                <p role="alert" className="form-error">
                  {error}
                </p>
              )}
              <button
                className="btn primary full-width"
                disabled={busy || authLoading}
              >
                {busy ? "Signing in…" : "Sign in to Qmaster"}
                <ArrowRight size={17} />
              </button>
            </form>
          )}
          <p className="login-footnote">
            <ShieldCheck size={15} />
            Organizer access only. Players don’t need an account.
          </p>
        </div>
      </div>
    </div>
  );
}

import { useState } from "react";
import {
  CheckCircle2,
  Database,
  UserRound,
  Radio,
  CloudUpload,
  ClipboardList,
  Trash2,
} from "lucide-react";
import { useApp } from "../hooks/useApp";
import { Badge, Modal, PageHeader } from "../components/ui";
import { rpc } from "../services/api";

export function SettingsPage() {
  const { configured, user, live, busy, act, data } = useApp();
  const [clearing, setClearing] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  return (
    <>
      <PageHeader
        title="Settings"
        subtitle="Manage your workspace and test data."
        eyebrow="YOUR WORKSPACE"
      />
      <div className="grid-2 settings-grid">
        <section className="card">
          <div className="card-header">
            <h2>Workspace connection</h2>
            <Badge tone={configured ? "green" : "orange"}>
              {configured ? "Configured" : "Action needed"}
            </Badge>
          </div>
          <div className="settings-status">
            <div>
              <Database size={19} />
              <span>Supabase credentials</span>
              <strong>{configured ? "Added" : "Not added"}</strong>
            </div>
            <div>
              <UserRound size={19} />
              <span>Organizer</span>
              <strong>{user?.email ?? "Not signed in"}</strong>
            </div>
            <div>
              <Radio size={19} />
              <span>Realtime</span>
              <strong>{live ? "Connected" : "Not connected"}</strong>
            </div>
          </div>
          <p className="callout">
            Your database is the source of truth. This app does not save
            tournaments or queues to temporary browser storage.
          </p>
        </section>
        <section className="card">
          <div className="card-header">
            <h2>What you enter on game day</h2>
            <ClipboardList size={20} />
          </div>
          <ul className="checklist">
            <li>
              <CheckCircle2 />
              <span>
                <strong>Players:</strong> their names. Photos are optional.
              </span>
            </li>
            <li>
              <CheckCircle2 />
              <span>
                <strong>Tournaments:</strong> name, date, singles/doubles/mixed,
                bracket format, court count, and one game/best of three.
              </span>
            </li>
            <li>
              <CheckCircle2 />
              <span>
                <strong>Participants:</strong> select players, form pairs for
                doubles, and choose the seeding order.
              </span>
            </li>
            <li>
              <CheckCircle2 />
              <span>
                <strong>Queues:</strong> session name, courts, play type, and
                who wants to play.
              </span>
            </li>
            <li>
              <CheckCircle2 />
              <span>
                <strong>Matches:</strong> available court, points or completed
                game scores, and confirmation of the result.
              </span>
            </li>
          </ul>
        </section>
      </div>
      <section className="card section-block" style={{ marginBottom: 24 }}>
        <div className="card-header">
          <div>
            <h2>Clear test data</h2>
            <p>Start again with an empty workspace.</p>
          </div>
          <Trash2 size={20} />
        </div>
        <p className="muted">
          Permanently remove your players, tournaments, queue sessions, matches,
          and scores. Active games are canceled. Your organizer login,
          configuration, and uploaded files are kept.
        </p>
        <div className="form-actions">
          <button
            className="btn danger"
            disabled={!configured || !user || busy}
            onClick={() => {
              setConfirmation("");
              setClearing(true);
            }}
          >
            <Trash2 size={16} />
            Clear all test data
          </button>
        </div>
      </section>
      {clearing && (
        <Modal
          title="Clear all test data?"
          onClose={() => {
            if (!busy) setClearing(false);
          }}
        >
          <form
            className="stack"
            onSubmit={async (e) => {
              e.preventDefault();
              if (confirmation !== "DELETE ALL") return;
              if (
                await act(
                  () =>
                    rpc("clear_test_data", { p_confirmation: confirmation }),
                  "Test data cleared. Your workspace is empty.",
                )
              )
                setClearing(false);
            }}
          >
            <p className="muted">
              This permanently deletes {data.players.length} players,{" "}
              {data.tournaments.length} tournaments, {data.queueSessions.length}{" "}
              queue sessions, and all their matches and scores from your
              workspace. This cannot be undone. Your login and uploaded files
              stay available.
            </p>
            <label className="field">
              Type DELETE ALL to confirm
              <input
                autoFocus
                autoComplete="off"
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                placeholder="DELETE ALL"
                required
              />
            </label>
            <div className="form-actions">
              <button
                className="btn"
                type="button"
                disabled={busy}
                onClick={() => setClearing(false)}
              >
                Cancel
              </button>
              <button
                className="btn danger"
                disabled={busy || confirmation !== "DELETE ALL"}
              >
                {busy ? "Clearing…" : "Permanently clear workspace"}
              </button>
            </div>
          </form>
        </Modal>
      )}
      <div className="callout">
        <CloudUpload size={18} />
        <span>
          Images are optional. JPG, PNG, and WebP files up to 3 MB use the
          private Supabase Storage bucket. You can run every game without
          uploading anything.
        </span>
      </div>
    </>
  );
}

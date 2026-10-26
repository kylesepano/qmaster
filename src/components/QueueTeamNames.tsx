import { useState } from "react";
import { Pencil } from "lucide-react";
import type { QueueMatch } from "../types";
import { useApp } from "../hooks/useApp";
import { rpc } from "../services/api";
import { Modal } from "./ui";

export function QueueTeamNames({ match }: { match: QueueMatch }) {
  const { act, busy } = useApp();
  const [open, setOpen] = useState(false);
  const [a, setA] = useState(""),
    [b, setB] = useState("");
  return (
    <>
      <button
        className="btn"
        onClick={() => {
          setA(match.team_a_name ?? "");
          setB(match.team_b_name ?? "");
          setOpen(true);
        }}
      >
        <Pencil size={16} />
        Edit team names
      </button>
      {open && (
        <Modal title="Match team names" onClose={() => setOpen(false)}>
          <form
            className="stack"
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                await act(
                  () =>
                    rpc("rename_queue_teams", {
                      p_match_id: match.id,
                      p_team_a_name: a.trim() || null,
                      p_team_b_name: b.trim() || null,
                    }),
                  "Team names updated.",
                )
              )
                setOpen(false);
            }}
          >
            <label className="field">
              Team A name
              <input
                maxLength={150}
                value={a}
                onChange={(e) => setA(e.target.value)}
                placeholder="Defaults to player names"
              />
            </label>
            <label className="field">
              Team B name
              <input
                maxLength={150}
                value={b}
                onChange={(e) => setB(e.target.value)}
                placeholder="Defaults to player names"
              />
            </label>
            <p className="muted small-text">
              Names apply to this match. The selected players and their win/loss
              records stay the same.
            </p>
            <div className="form-actions">
              <button
                type="button"
                className="btn"
                onClick={() => setOpen(false)}
              >
                Cancel
              </button>
              <button className="btn primary" disabled={busy}>
                Save team names
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

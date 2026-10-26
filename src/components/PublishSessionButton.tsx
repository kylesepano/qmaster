import { useState } from "react";
import { Link } from "react-router-dom";
import { Copy, Eye, Share2 } from "lucide-react";
import { useApp } from "../hooks/useApp";
import { rpc } from "../services/api";
import { Modal } from "./ui";
import type { QueueSession } from "../types";

export function PublishSessionButton({ session }: { session: QueueSession }) {
  const [open, setOpen] = useState(false);
  const { busy, act } = useApp();
  const url = `${window.location.origin}/public/sessions/${session.id}`;
  return (
    <>
      <button className="btn" onClick={() => setOpen(true)}>
        <Share2 size={16} />
        {session.published ? "Sharing" : "Publish session"}
      </button>
      {open && (
        <Modal title="Share your queue session" onClose={() => setOpen(false)}>
          <div className="stack">
            <p className="muted">
              Publishing lists this session on the public home page. Players can
              see courts, waiting player names, live scores, and match history
              without signing in.
            </p>
            {session.published && (
              <>
                <label className="field">
                  Public session link
                  <input readOnly value={url} />
                </label>
                <div className="button-row">
                  <button
                    className="btn"
                    onClick={() =>
                      void act(
                        async () => navigator.clipboard.writeText(url),
                        "Session link copied.",
                      )
                    }
                  >
                    <Copy size={16} />
                    Copy link
                  </button>
                  <Link className="btn" to={`/public/sessions/${session.id}`}>
                    <Eye size={16} />
                    Open public view
                  </Link>
                </div>
              </>
            )}
            <div className="form-actions">
              <button className="btn" onClick={() => setOpen(false)}>
                Close
              </button>
              <button
                className={`btn ${session.published ? "" : "primary"}`}
                disabled={busy}
                onClick={() =>
                  void act(
                    () =>
                      rpc("publish_queue_session", {
                        p_session_id: session.id,
                        p_published: !session.published,
                      }),
                    session.published
                      ? "Session is now private."
                      : "Session published on the home page.",
                  ).then((ok) => {
                    if (ok && session.published) setOpen(false);
                  })
                }
              >
                {session.published ? "Make private" : "Publish session"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

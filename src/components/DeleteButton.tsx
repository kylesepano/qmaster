import { useState } from "react";
import { Trash2 } from "lucide-react";
import { useApp } from "../hooks/useApp";
import { deleteWithMediaCleanup } from "../services/mediaCleanup";
import { ConfirmationDialog } from "./ui";

export function DeleteButton({
  kind,
  id,
  name,
  onDeleted,
  compact = false,
}: {
  kind: "tournament" | "session" | "player";
  id: string;
  name: string;
  onDeleted?: () => void;
  compact?: boolean;
}) {
  const { act, busy } = useApp();
  const [open, setOpen] = useState(false);
  const rpcName =
    kind === "tournament"
      ? "delete_tournament"
      : kind === "session"
        ? "delete_queue_session"
        : "purge_player";
  const arg =
    kind === "tournament"
      ? "p_tournament_id"
      : kind === "session"
        ? "p_session_id"
        : "p_player_id";
  const success = `${kind === "player" ? "Player" : kind === "session" ? "Queue session" : "Tournament"} permanently deleted.`;
  return (
    <>
      <button
        type="button"
        className={compact ? "icon-btn" : "btn danger"}
        aria-label={`Delete ${name}`}
        disabled={busy}
        onClick={() => setOpen(true)}
      >
        <Trash2 size={compact ? 15 : 16} />
        {!compact && "Delete"}
      </button>
      {open && (
        <ConfirmationDialog
          title={`Delete ${name}?`}
          danger
          busy={busy}
          onClose={() => setOpen(false)}
          onConfirm={() =>
            void act(
              () => deleteWithMediaCleanup(rpcName, { [arg]: id }, success),
              success,
            ).then((ok) => {
              if (ok) {
                setOpen(false);
                onDeleted?.();
              }
            })
          }
        >
          {kind === "player"
            ? "Permanently delete this player, their uploaded photo, and their waiting-queue memberships? If the player has tournament registrations or match history, delete those tournaments/sessions first, or archive the player instead."
            : `Permanently delete this ${kind === "session" ? "queue session" : "tournament"}, including all its matches, scores, ${kind === "session" ? "waiting queue" : "bracket and registrations"}? Active matches will be canceled. Player records are kept. This cannot be undone.`}
        </ConfirmationDialog>
      )}
    </>
  );
}

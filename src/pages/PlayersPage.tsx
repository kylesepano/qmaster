import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Search,
  Plus,
  Pencil,
  UsersRound,
  ImagePlus,
  ArchiveRestore,
  Archive,
} from "lucide-react";
import { useApp } from "../hooks/useApp";
import { db, write } from "../services/api";
import { uploadMedia } from "../services/media";
import { cleanupFeedback, discardUpload } from "../services/mediaCleanup";
import {
  ConfirmationDialog,
  EmptyState,
  Modal,
  PageHeader,
  PlayerAvatar,
  dateLabel,
} from "../components/ui";
import type { Player } from "../types";
import { DeleteButton } from "../components/DeleteButton";
import { playerRecords } from "../utilities/playerRecords";

export function PlayersPage() {
  const { data, user, configured, act, busy } = useApp();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(""),
    [filter, setFilter] = useState("active");
  const [editing, setEditing] = useState<Player | null | undefined>(
    params.get("add") ? null : undefined,
  );
  const [name, setName] = useState(""),
    [photo, setPhoto] = useState<File | null>(null);
  const [removing, setRemoving] = useState<Player | null>(null);
  const records = playerRecords(data);
  const players = data.players
    .filter(
      (p) =>
        (filter === "all" ||
          (filter === "archived" ? p.archived : !p.archived)) &&
        p.name.toLowerCase().includes(search.toLowerCase()),
    )
    .sort((a, b) => a.name.localeCompare(b.name));
  function edit(player: Player | null) {
    setEditing(player);
    setName(player?.name ?? "");
    setPhoto(null);
  }
  function close() {
    setEditing(undefined);
    if (params.has("add")) {
      params.delete("add");
      setParams(params, { replace: true });
    }
  }
  return (
    <>
      <PageHeader
        title="Your players"
        subtitle="Register once. Play in any queue or tournament."
        eyebrow="THE PEOPLE BEHIND THE POINTS"
        actions={
          <button
            className="btn primary"
            disabled={!configured || !user}
            onClick={() => edit(null)}
          >
            <Plus size={17} />
            Add player
          </button>
        }
      />
      <section className="card">
        <div className="list-toolbar">
          <div className="search-input">
            <Search size={17} />
            <input
              aria-label="Search players"
              placeholder="Search players by name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="toolbar-right">
            <span className="muted small-text">{players.length} players</span>
            <select
              aria-label="Player status"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option value="active">Active players</option>
              <option value="archived">Archived players</option>
              <option value="all">All players</option>
            </select>
          </div>
        </div>
        {players.length ? (
          <div className="player-grid">
            {players.map((p) => (
              <article className="player-card" key={p.id}>
                <div className="player-card-top">
                  <PlayerAvatar
                    name={p.name}
                    path={p.photo_path}
                    size="large"
                  />
                  <div className="button-row">
                    <button
                      className="icon-btn"
                      aria-label={`Edit ${p.name}`}
                      onClick={() => edit(p)}
                    >
                      <Pencil size={15} />
                    </button>
                    {p.archived ? (
                      <button
                        className="icon-btn"
                        title="Restore player"
                        aria-label={`Restore ${p.name}`}
                        onClick={() =>
                          void act(
                            () =>
                              write(
                                db()
                                  .from("players")
                                  .update({ archived: false })
                                  .eq("id", p.id),
                              ),
                            "Player restored.",
                          )
                        }
                      >
                        <ArchiveRestore size={16} />
                      </button>
                    ) : (
                      <button
                        className="icon-btn"
                        aria-label={`Archive ${p.name}`}
                        onClick={() => setRemoving(p)}
                      >
                        <Archive size={15} />
                      </button>
                    )}
                    <DeleteButton
                      kind="player"
                      id={p.id}
                      name={p.name}
                      compact
                    />
                  </div>
                </div>
                <h3>{p.name}</h3>
                <div className="player-record">
                  <span>
                    <strong>{records.get(p.id)?.wins ?? 0}</strong> Wins
                  </span>
                  <span>
                    <strong>{records.get(p.id)?.losses ?? 0}</strong> Losses
                  </span>
                </div>
                <small className="muted">All finalized matches</small>
                <p>
                  {p.archived
                    ? "Archived · History preserved"
                    : `Added ${dateLabel(p.created_at)}`}
                </p>
                <span className={`badge ${p.archived ? "" : "green"}`}>
                  <span className="tiny-dot" />
                  {p.archived ? "Archived" : "Active player"}
                </span>
                <Link
                  className="text-link player-profile-link"
                  to={`/public/players/${p.id}`}
                >
                  Public profile & history →
                </Link>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            title={
              search
                ? "No players match your search"
                : "Good games start with good company"
            }
          >
            {search
              ? "Try a different name or filter."
              : "Add your first player. All you need is a name."}
            {!search && (
              <button
                className="btn primary"
                disabled={!configured || !user}
                onClick={() => edit(null)}
              >
                <Plus size={16} />
                Add your first player
              </button>
            )}
          </EmptyState>
        )}
      </section>
      <div className="callout">
        <UsersRound size={19} />
        <span>
          Players don’t need accounts. You manage registration, teams, and
          scores from your organizer workspace.
        </span>
      </div>
      {editing !== undefined && (
        <Modal title={editing ? "Edit player" : "Add a player"} onClose={close}>
          <form
            className="stack"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!user) return;
              const ok = await act(
                async () => {
                  let photoPath = editing?.photo_path ?? null;
                  if (photo) photoPath = await uploadMedia(photo, user.id);
                  const values = { name: name.trim(), photo_path: photoPath };
                  try {
                    await write(
                      editing
                        ? db()
                            .from("players")
                            .update(values)
                            .eq("id", editing.id)
                        : db()
                            .from("players")
                            .insert({ ...values, organizer_id: user.id }),
                    );
                  } catch (error) {
                    if (photo && photoPath)
                      await discardUpload(photoPath).catch(() => undefined);
                    throw error;
                  }
                  if (photo)
                    return await cleanupFeedback(
                      editing ? "Player updated." : "Player added.",
                    );
                },
                editing ? "Player updated." : "Player added.",
              );
              if (ok) close();
            }}
          >
            <label className="field">
              Player name
              <input
                autoFocus
                required
                maxLength={100}
                placeholder="e.g. Alex Santos"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label className="field">
              <span>
                <ImagePlus size={15} />
                Profile picture <span className="muted">(optional)</span>
              </span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
              />
              <small>JPG, PNG, or WebP. Up to 3 MB.</small>
            </label>
            <div className="form-actions">
              <button className="btn" type="button" onClick={close}>
                Cancel
              </button>
              <button
                className="btn primary"
                disabled={busy || !name.trim() || !user}
              >
                {busy ? "Saving…" : editing ? "Save changes" : "Add player"}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {removing && (
        <ConfirmationDialog
          title={`Archive ${removing.name}?`}
          danger
          busy={busy}
          onClose={() => setRemoving(null)}
          onConfirm={() =>
            void act(
              () =>
                write(
                  db()
                    .from("players")
                    .update({ archived: true })
                    .eq("id", removing.id),
                ),
              "Player archived. History preserved.",
            ).then((ok) => {
              if (ok) setRemoving(null);
            })
          }
        >
          Hide this player from active registration lists while keeping existing
          games and results. You can restore them from the Archived players
          filter.
        </ConfirmationDialog>
      )}
    </>
  );
}

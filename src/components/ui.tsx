import { useEffect, useId, useRef } from "react";
import type { ReactNode, FormEvent } from "react";
import { X, UserRound, Inbox } from "lucide-react";
import { useMediaUrl } from "../hooks/useMediaUrl";

export function PageHeader({
  title,
  subtitle,
  actions,
  eyebrow,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  eyebrow?: string;
}) {
  return (
    <div className="page-header">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions && <div className="header-actions">{actions}</div>}
    </div>
  );
}
export function Badge({
  children,
  tone = "",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <Inbox size={25} />
      </div>
      <h3>{title}</h3>
      {children && <div className="empty-description">{children}</div>}
      {action}
    </div>
  );
}
export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const el = dialog.current!;
    el.showModal();
    return () => el.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="modal"
      aria-labelledby={id}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === dialog.current) onClose();
      }}
    >
      <div className="modal-header">
        <h2 id={id}>{title}</h2>
        <button
          type="button"
          aria-label="Close dialog"
          className="icon-btn"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function ConfirmationDialog({
  title,
  children,
  onConfirm,
  onClose,
  busy = false,
  danger = false,
}: {
  title: string;
  children: ReactNode;
  onConfirm: () => void;
  onClose: () => void;
  busy?: boolean;
  danger?: boolean;
}) {
  return (
    <Modal title={title} onClose={onClose}>
      <p className="muted">{children}</p>
      <div className="form-actions">
        <button className="btn" disabled={busy} onClick={onClose}>
          Cancel
        </button>
        <button
          className={`btn ${danger ? "danger" : "primary"}`}
          disabled={busy}
          onClick={onConfirm}
        >
          {busy ? "Working…" : "Confirm"}
        </button>
      </div>
    </Modal>
  );
}
export function PlayerAvatar({
  name,
  path,
  size = "",
}: {
  name: string;
  path?: string | null;
  size?: string;
}) {
  const src = useMediaUrl(path);
  return (
    <span className={`avatar ${size}`}>
      {src ? (
        <img src={src} alt="" />
      ) : name ? (
        name
          .trim()
          .split(/\s+/)
          .slice(0, 2)
          .map((s) => s[0])
          .join("")
          .toUpperCase()
      ) : (
        <UserRound size={18} />
      )}
    </span>
  );
}
export function submit(
  action: (e: FormEvent<HTMLFormElement>) => Promise<void>,
) {
  return (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    void action(e);
  };
}
export function dateLabel(date?: string | null) {
  return date
    ? new Date(
        date.length === 10 ? `${date}T12:00:00` : date,
      ).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "—";
}

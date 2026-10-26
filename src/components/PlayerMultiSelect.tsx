import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown, Search, Square, X } from "lucide-react";

interface Option {
  id: string;
  name: string;
}

export function PlayerMultiSelect({
  options,
  value,
  onChange,
  disabled = false,
  label = "Players to add to queue",
  maxSelected,
}: {
  options: Option[];
  value: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
  label?: string;
  maxSelected?: number;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const selected = new Set(value);
  const sorted = [...options].sort((a, b) => a.name.localeCompare(b.name));
  const filtered = sorted.filter((p) =>
    p.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  );
  const allFilteredSelected =
    filtered.length > 0 && filtered.every((p) => selected.has(p.id));
  function close() {
    setOpen(false);
    setQuery("");
    setActive(-1);
  }
  function toggle(id: string) {
    if (
      !selected.has(id) &&
      maxSelected !== undefined &&
      value.length >= maxSelected
    )
      return;
    onChange(selected.has(id) ? value.filter((x) => x !== id) : [...value, id]);
  }
  useEffect(() => {
    function outside(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) close();
    }
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, []);
  useEffect(() => {
    if (open && active >= 0)
      document
        .getElementById(`${listId}-${active}`)
        ?.scrollIntoView({ block: "nearest" });
  }, [active, open, listId]);
  return (
    <div
      className="player-multiselect"
      ref={root}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          close();
      }}
    >
      {value.length > 0 && (
        <div className="player-selection-summary">
          <strong aria-live="polite">
            {value.length} {value.length === 1 ? "player" : "players"} selected
          </strong>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange([])}
          >
            Clear selection
          </button>
        </div>
      )}
      {value.length > 0 && (
        <div className="player-selection-chips">
          {value.slice(0, 6).map((id) => (
            <span key={id}>
              {options.find((p) => p.id === id)?.name ?? "Selected player"}
              <button
                type="button"
                aria-label={`Deselect ${options.find((p) => p.id === id)?.name ?? "player"}`}
                disabled={disabled}
                onClick={() => toggle(id)}
              >
                <X size={12} />
              </button>
            </span>
          ))}
          {value.length > 6 && (
            <span className="more-selected">+{value.length - 6} more</span>
          )}
        </div>
      )}
      <div className="player-select-search">
        <Search size={16} />
        <input
          ref={input}
          role="combobox"
          aria-label={label}
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={
            open && active >= 0 && active < filtered.length
              ? `${listId}-${active}`
              : undefined
          }
          autoComplete="off"
          placeholder={
            options.length
              ? "Search and select players…"
              : "No more registered players to add"
          }
          value={query}
          disabled={disabled || !options.length}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              close();
            } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              setOpen(true);
              if (filtered.length)
                setActive((previous) =>
                  e.key === "ArrowDown"
                    ? (previous + 1) % filtered.length
                    : previous <= 0
                      ? filtered.length - 1
                      : previous - 1,
                );
            } else if (e.key === "Enter") {
              e.preventDefault();
              if (open && filtered[active]) toggle(filtered[active].id);
              else {
                setOpen(true);
                if (filtered.length === 1) toggle(filtered[0].id);
              }
            }
          }}
        />
        <button
          type="button"
          className="icon-btn"
          aria-label={open ? "Close player options" : "Open player options"}
          disabled={disabled || !options.length}
          onClick={() => {
            if (open) close();
            else input.current?.focus();
          }}
        >
          <ChevronDown size={16} />
        </button>
      </div>
      {open && !disabled && (
        <div className="player-select-dropdown">
          <div className="player-select-toolbar">
            <span>
              {filtered.length} {query ? "matching" : "available"}
            </span>
            {maxSelected === undefined && (
              <button
                type="button"
                disabled={!filtered.length || allFilteredSelected}
                onClick={() =>
                  onChange([
                    ...new Set([...value, ...filtered.map((p) => p.id)]),
                  ])
                }
              >
                {query ? "Select all matches" : "Select all"}
              </button>
            )}
          </div>
          <div
            id={listId}
            role="listbox"
            aria-label="Available players"
            aria-multiselectable="true"
            className="player-select-options"
          >
            {filtered.map((player, i) => (
              <button
                type="button"
                role="option"
                id={`${listId}-${i}`}
                aria-selected={selected.has(player.id)}
                disabled={
                  maxSelected !== undefined &&
                  value.length >= maxSelected &&
                  !selected.has(player.id)
                }
                tabIndex={-1}
                key={player.id}
                className={`${selected.has(player.id) ? "selected" : ""} ${active === i ? "active" : ""}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setActive(i);
                  toggle(player.id);
                }}
              >
                {selected.has(player.id) ? (
                  <Check size={17} />
                ) : (
                  <Square size={17} />
                )}
                <span>{player.name}</span>
              </button>
            ))}
            {!filtered.length && (
              <p className="player-select-empty">
                No players match your search.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

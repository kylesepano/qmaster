import { SPORT_LABELS, type Sport } from "../types";

export function SportField({
  value,
  onChange,
  disabled = false,
  label = "Sport",
}: {
  value: Sport;
  onChange: (sport: Sport) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <label className="field">
      {label}
      <select
        aria-label={label}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as Sport)}
      >
        {Object.entries(SPORT_LABELS).map(([id, name]) => (
          <option key={id} value={id}>
            {name}
          </option>
        ))}
      </select>
    </label>
  );
}

export function SportFilter({
  value,
  onChange,
}: {
  value: Sport | "all";
  onChange: (sport: Sport | "all") => void;
}) {
  return (
    <select
      aria-label="Filter by sport"
      value={value}
      onChange={(e) => onChange(e.target.value as Sport | "all")}
    >
      <option value="all">All sports</option>
      {Object.entries(SPORT_LABELS).map(([id, name]) => (
        <option key={id} value={id}>
          {name}
        </option>
      ))}
    </select>
  );
}

import type { ScoringRule } from "../types";

export function ScoringRuleField({
  value,
  onChange,
  disabled = false,
}: {
  value: ScoringRule;
  onChange: (rule: ScoringRule) => void;
  disabled?: boolean;
}) {
  return (
    <label className="field">
      Scoring rules
      <select
        aria-label="Scoring rules"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as ScoringRule)}
      >
        <option value="standard_21">Standard — 21 points, capped at 30</option>
        <option value="lenient_31">Lenient — first to 31, no deuce</option>
      </select>
      <small>
        {value === "lenient_31"
          ? "The first side to 31 wins, even at 31–30. Scores such as 31–1 are allowed. No two-point lead required."
          : "First to 21, win by two. At 29–29, the next point wins."}
      </small>
    </label>
  );
}

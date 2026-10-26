import type { ScoringRule, Sport } from "../types";

export function ScoringRuleField({
  value,
  onChange,
  disabled = false,
  sport = "badminton",
}: {
  value: ScoringRule;
  onChange: (rule: ScoringRule) => void;
  disabled?: boolean;
  sport?: Sport;
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
        {sport === "pickleball" ? (
          <>
            <option value="pickleball_11_sudden_death">
              11 points — sudden death, no deuce
            </option>
            <option value="pickleball_11_deuce">
              11 points — deuce, win by two
            </option>
          </>
        ) : (
          <>
            <option value="standard_21">
              Standard — 21 points, capped at 30
            </option>
            <option value="lenient_31">Lenient — first to 31, no deuce</option>
          </>
        )}
      </select>
      <small>
        {value === "pickleball_11_sudden_death"
          ? "First to 11 wins, including 11–10. No two-point lead required."
          : value === "pickleball_11_deuce"
            ? "Reach 11 and lead by two. At 10–10, continue until one side leads by two; no score cap."
            : value === "lenient_31"
              ? "The first side to 31 wins, even at 31–30. Scores such as 31–1 are allowed. No two-point lead required."
              : "First to 21, win by two. At 29–29, the next point wins."}
      </small>
    </label>
  );
}

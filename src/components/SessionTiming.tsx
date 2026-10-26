import { estimateRotation } from "../utilities/rotation";
import type { PlayType } from "../types";

export function SessionTiming({
  hours,
  minutes,
  courts,
  playType,
  played,
  onHours,
  onMinutes,
  disabled = false,
}: {
  hours: number;
  minutes: number;
  courts: number;
  playType: PlayType;
  played: number[];
  onHours: (hours: number) => void;
  onMinutes: (minutes: number) => void;
  disabled?: boolean;
}) {
  const estimate = estimateRotation(hours, minutes, courts, playType, played);
  return (
    <div className="stack">
      <div className="form-grid">
        <label className="field">
          Session hours
          <input
            type="number"
            min="0.25"
            max="24"
            step="0.01"
            required
            value={hours}
            disabled={disabled}
            onChange={(e) => onHours(Number(e.target.value))}
          />
        </label>
        <label className="field">
          Estimated minutes per match
          <input
            type="number"
            min="1"
            max="180"
            step="1"
            required
            value={minutes}
            disabled={disabled}
            onChange={(e) => onMinutes(Number(e.target.value))}
          />
        </label>
      </div>
      {!disabled && (
        <div className="callout" aria-live="polite">
          {estimate.error || (
            <>
              <strong>
                {estimate.matches} planned matches · {estimate.target} total
                matches per player
              </strong>
              <br />
              {estimate.capacity} estimated match slots across available courts.{" "}
              {estimate.unused > 0
                ? `${estimate.unused} slots left unused to keep counts equal.`
                : "All estimated slots used."}
            </>
          )}
        </div>
      )}
      <small className="muted">
        Include breaks and changeover in the minutes per match. This estimates
        capacity; match lengths, shared players and court availability can
        extend the session. Hours describe the time budget for this plan, not an
        automatic timer.
      </small>
    </div>
  );
}

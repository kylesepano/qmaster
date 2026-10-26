export function ScheduleFields({
  date,
  time,
  onDate,
  onTime,
}: {
  date: string;
  time: string;
  onDate: (date: string) => void;
  onTime: (time: string) => void;
}) {
  return (
    <>
      <label className="field">
        Event date
        <input
          type="date"
          required
          value={date}
          onChange={(e) => onDate(e.target.value)}
        />
      </label>
      <label className="field">
        Start time (UTC+8)
        <input
          type="time"
        aria-label="Start time (UTC+8)"
          required
          value={time}
          onChange={(e) => onTime(e.target.value)}
        />
        <small>
          Singapore / Manila time, shown consistently to all visitors.
        </small>
      </label>
    </>
  );
}

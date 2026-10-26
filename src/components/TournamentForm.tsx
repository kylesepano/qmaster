import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Trophy, ImagePlus, ArrowRight } from "lucide-react";
import { useApp } from "../hooks/useApp";
import { db, rpc } from "../services/api";
import { uploadMedia } from "../services/media";
import { cleanupFeedback, discardUpload } from "../services/mediaCleanup";
import type {
  Tournament,
  PlayType,
  BracketFormat,
  ScoringRule,
  Sport,
} from "../types";
import { ScoringRuleField } from "./ScoringRuleField";
import { SportField } from "./SportField";
import { FORMAT_LABELS } from "../types";
import { ScheduleFields } from "./ScheduleFields";
import { todayEventDate } from "../utilities/schedule";

export function TournamentForm({
  tournament,
  onDone,
}: {
  tournament?: Tournament;
  onDone?: () => void;
}) {
  const { user, data, busy, act, configured } = useApp();
  const navigate = useNavigate();
  const [name, setName] = useState(tournament?.name ?? "");
  const [sport, setSport] = useState<Sport>(tournament?.sport ?? "badminton");
  const [date, setDate] = useState(tournament?.event_date ?? todayEventDate());
  const [startTime, setStartTime] = useState(
    tournament?.start_time?.slice(0, 5) ?? "09:00",
  );
  const [venue, setVenue] = useState(tournament?.venue ?? ""),
    [description, setDescription] = useState(tournament?.description ?? "");
  const [playType, setPlayType] = useState<PlayType>(
    tournament?.play_type ?? "singles",
  );
  const [format, setFormat] = useState<BracketFormat>(
    tournament?.format ?? "single_elimination",
  );
  const [courtCount, setCourtCount] = useState(tournament?.court_count ?? 3),
    [bestOf, setBestOf] = useState<1 | 3>(tournament?.best_of ?? 1);
  const [banner, setBanner] = useState<File | null>(null);
  const [scoringRule, setScoringRule] = useState<ScoringRule>(
    tournament?.scoring_rule ?? "standard_21",
  );
  const formatLocked =
    !!tournament &&
    (tournament.status !== "draft" ||
      data.entries.some((e) => e.tournament_id === tournament.id) ||
      data.tournamentMatches.some((m) => m.tournament_id === tournament.id));
  const descriptions: Record<BracketFormat, string> = {
    single_elimination:
      "One loss ends the run. A quick, classic knockout bracket with automatic BYEs.",
    double_elimination:
      "Everyone gets a second chance. Upper and lower brackets, plus a grand final reset when needed.",
    round_robin:
      "Every entry plays every other entry once. Standings decide the champion.",
  };
  return (
    <form
      className="stack"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!user) return;
        let newId = "";
        const ok = await act(
          async () => {
            const banner_path = banner
              ? await uploadMedia(banner, user.id)
              : (tournament?.banner_path ?? null);
            const values = {
              name: name.trim(),
              event_date: date,
              start_time: startTime,
              venue: venue.trim() || null,
              description: description.trim() || null,
              play_type: playType,
              format,
              court_count: courtCount,
              best_of: bestOf,
              scoring_rule: scoringRule,
              sport,
              banner_path,
            };
            try {
              if (tournament)
                await rpc("update_tournament", {
                  p_tournament_id: tournament.id,
                  p_details: values,
                });
              else {
                const { data, error } = await db()
                  .from("tournaments")
                  .insert({ ...values, organizer_id: user.id })
                  .select("id")
                  .single();
                if (error) throw error;
                newId = data.id;
              }
            } catch (error) {
              if (banner && banner_path)
                await discardUpload(banner_path).catch(() => undefined);
              throw error;
            }
            if (banner)
              return await cleanupFeedback(
                tournament ? "Tournament updated." : "Tournament created.",
              );
          },
          tournament
            ? "Tournament updated."
            : "Tournament created. Add your participants next.",
        );
        if (ok) {
          if (onDone) onDone();
          else navigate(`/tournaments/${newId}`);
        }
      }}
    >
      <section className={tournament ? "stack" : "card stack"}>
        {!tournament && (
          <div className="card-header">
            <div>
              <h2>The essentials</h2>
              <p>Give your next tournament a name and a place.</p>
            </div>
            <Trophy size={21} />
          </div>
        )}
        <div className="form-grid">
          <SportField
            value={sport}
            disabled={formatLocked}
            onChange={(next) => {
              setSport(next);
              setScoringRule(
                next === "pickleball"
                  ? "pickleball_11_sudden_death"
                  : "standard_21",
              );
            }}
          />
          <label className="field">
            Tournament name
            <input
              autoFocus
              required
              maxLength={150}
              placeholder="e.g. Weekend Smash Cup"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <ScheduleFields
            date={date}
            time={startTime}
            onDate={setDate}
            onTime={setStartTime}
          />
          <label className="field">
            Venue <span className="muted">(optional)</span>
            <input
              maxLength={200}
              placeholder="e.g. Community Sports Hall"
              value={venue}
              onChange={(e) => setVenue(e.target.value)}
            />
          </label>
          <label className="field">
            Available courts
            <input
              type="number"
              min={1}
              max={32}
              required
              value={courtCount}
              onChange={(e) => setCourtCount(Number(e.target.value))}
            />
          </label>
        </div>
        <label className="field">
          Description <span className="muted">(optional)</span>
          <textarea
            rows={2}
            maxLength={2000}
            placeholder="Anything your players should know?"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
      </section>
      <section className={tournament ? "stack" : "card stack"}>
        {!tournament && (
          <div className="card-header">
            <div>
              <h2>How are we playing?</h2>
              <p>Choose your teams, scoring, and path to the podium.</p>
            </div>
          </div>
        )}
        <div className="form-grid">
          <label className="field">
            Play type
            <select
              disabled={formatLocked}
              value={playType}
              onChange={(e) => setPlayType(e.target.value as PlayType)}
            >
              <option value="singles">Singles · 1 vs 1</option>
              <option value="doubles">Doubles · 2 vs 2</option>
              <option value="mixed">Mixed doubles · 2 vs 2</option>
            </select>
          </label>
          <label className="field">
            Match format
            <select
              disabled={formatLocked}
              value={bestOf}
              onChange={(e) => setBestOf(Number(e.target.value) as 1 | 3)}
            >
              <option value={1}>One game</option>
              <option value={3}>Best of 3 games</option>
            </select>
          </label>
        </div>
        <ScoringRuleField
          sport={sport}
          value={scoringRule}
          onChange={setScoringRule}
          disabled={formatLocked}
        />
        <fieldset className="format-fieldset" disabled={formatLocked}>
          <legend>Bracket format</legend>
          <div className="format-options">
            {(Object.keys(FORMAT_LABELS) as BracketFormat[]).map((f) => (
              <label
                key={f}
                className={`format-option ${format === f ? "selected" : ""}`}
              >
                <input
                  type="radio"
                  name="format"
                  value={f}
                  checked={format === f}
                  onChange={() => setFormat(f)}
                />
                <strong>{FORMAT_LABELS[f]}</strong>
                <p>{descriptions[f]}</p>
              </label>
            ))}
          </div>
        </fieldset>
        {formatLocked && (
          <small className="muted">
            Play type, match format, and bracket format are locked after
            participants are registered.
          </small>
        )}
        <div className="callout small-text">
          {scoringRule === "lenient_31"
            ? "Lenient games go to 31, with no deuce."
            : "Standard games go to 21, win by two, capped at 30."}{" "}
          Brackets support 2–64 entries, including automatic BYEs.
        </div>
      </section>
      <label className="field">
        <span>
          <ImagePlus size={16} />
          Tournament banner <span className="muted">(optional)</span>
        </span>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(e) => setBanner(e.target.files?.[0] ?? null)}
        />
        <small>
          JPG, PNG, or WebP. Up to 3 MB. Visible in your organizer workspace.
        </small>
      </label>
      <div className="form-actions">
        {onDone && (
          <button type="button" className="btn" onClick={onDone}>
            Cancel
          </button>
        )}
        <button
          className="btn primary"
          disabled={busy || !name.trim() || !user || !configured}
        >
          {busy ? "Saving…" : tournament ? "Save changes" : "Create tournament"}
          <ArrowRight size={17} />
        </button>
      </div>
    </form>
  );
}

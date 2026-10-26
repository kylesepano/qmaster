import { useEffect, useState } from "react";
import {
  Check,
  ChevronRight,
  Minus,
  Pencil,
  Plus,
  Save,
  Trophy,
} from "lucide-react";
import type { Game, ScoringRule } from "../types";
import {
  evaluateMatch,
  gameWinner,
  prepareNextGame,
  scoringMax,
  scoringRuleLabel,
} from "../utilities/scoring";

interface ScoreboardProps {
  sideA: string;
  sideB: string;
  games: Game[];
  bestOf: 1 | 3;
  scoringRule?: ScoringRule;
  version: number;
  completed: boolean;
  locked?: boolean;
  busy?: boolean;
  winner?: "a" | "b" | null;
  walkover?: boolean;
  onSave: (
    games: Game[],
    finalize: boolean,
    walkover: "a" | "b" | null,
  ) => Promise<boolean>;
}

const cleanGames = (games: Game[]): Game[] =>
  games.length
    ? games
        .map(({ game_no, score_a, score_b }) => ({ game_no, score_a, score_b }))
        .sort((a, b) => a.game_no - b.game_no)
    : [{ game_no: 1, score_a: 0, score_b: 0 }];

export function Scoreboard(props: ScoreboardProps) {
  const rule = props.scoringRule ?? "standard_21";
  const maxScore = scoringMax(rule);
  const savedGames = () =>
    props.completed
      ? cleanGames(props.games)
      : prepareNextGame(cleanGames(props.games), props.bestOf, rule);
  const [draft, setDraft] = useState<Game[]>(savedGames);
  const [quick, setQuick] = useState(false);
  const [correcting, setCorrecting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    setDraft(savedGames());
    setMessage("");
  }, [
    props.version,
    props.bestOf,
    rule,
    props.completed,
    props.games
      .map((game) => `${game.game_no}:${game.score_a}:${game.score_b}`)
      .join(","),
  ]);
  const evaluation = evaluateMatch(draft, props.bestOf, rule);
  const last = draft[draft.length - 1];
  const committed = evaluateMatch(props.games, props.bestOf, rule);
  const lastWon = [...props.games]
    .sort((a, b) => b.game_no - a.game_no)
    .find((game) => gameWinner(game.score_a, game.score_b, rule));
  const gameWinnerLabel =
    lastWon &&
    (gameWinner(lastWon.score_a, lastWon.score_b, rule) === "a"
      ? props.sideA
      : props.sideB);
  const pendingWinnerLabel =
    committed.winner === "a" ? props.sideA : props.sideB;
  const editable = !props.locked && (!props.completed || correcting);
  const disabled = saving || props.busy || !editable;
  const winnerLabel =
    props.winner === "a"
      ? props.sideA
      : props.winner === "b"
        ? props.sideB
        : null;

  async function save(
    next: Game[],
    finalize = false,
    walkover: "a" | "b" | null = null,
  ) {
    if (saving || props.busy) return;
    setSaving(true);
    setMessage("");
    try {
      const prepared =
        !finalize && !walkover
          ? prepareNextGame(next, props.bestOf, rule)
          : next;
      if (await props.onSave(prepared, finalize, walkover)) {
        setDraft(prepared.length ? cleanGames(prepared) : cleanGames([]));
        setMessage(finalize ? "Result saved." : "Live score saved.");
        if (finalize) setCorrecting(false);
      } else
        setMessage(
          "Score was not saved. Review the latest score and try again.",
        );
    } finally {
      setSaving(false);
    }
  }

  function point(side: "a" | "b", delta: number) {
    if (disabled || (delta > 0 && evaluation.winner)) return;
    const next = cleanGames(draft);
    const index = next.length - 1;
    const key = side === "a" ? "score_a" : "score_b";
    next[index] = {
      ...next[index],
      [key]: Math.max(0, Math.min(maxScore, next[index][key] + delta)),
    };
    setDraft(next);
    void save(next, props.completed);
  }

  function finalize() {
    const result = evaluateMatch(draft, props.bestOf, rule);
    if (result.error || !result.winner) {
      setMessage(
        result.error || "Finish the required games before finalizing.",
      );
      return;
    }
    const name = result.winner === "a" ? props.sideA : props.sideB;
    if (
      window.confirm(
        `Finalize this match? ${name} wins ${result.gamesA}–${result.gamesB}. The court will be released and the result recorded.`,
      )
    )
      void save(draft, true);
  }

  function walkover(side: "a" | "b") {
    const name = side === "a" ? props.sideA : props.sideB;
    if (
      window.confirm(
        `Award a walkover win to ${name}? This finalizes the match without game scores.`,
      )
    )
      void save([], true, side);
  }

  return (
    <section className="card scoreboard">
      <div className="card-header">
        <div>
          <h2>Match scoreboard</h2>
          <p className="muted">
            {props.bestOf === 3 ? "Best of 3 games" : "Single game"} ·{" "}
            {scoringRuleLabel(rule)}
          </p>
        </div>
        <span className="badge">
          {props.completed ? "Final result" : "Live scoring"}
        </span>
      </div>
      {props.completed && (
        <div className="result-banner">
          <Trophy size={20} />
          <strong>
            {winnerLabel ?? "Winner recorded"}
            {props.walkover ? " wins by walkover" : " wins"}
          </strong>
        </div>
      )}
      {!props.completed && !committed.error && committed.winner && (
        <div className="result-banner score-win-notice" role="status">
          <Trophy size={22} />
          <div>
            <strong>
              {pendingWinnerLabel} has won the match {committed.gamesA}–
              {committed.gamesB}.
            </strong>
            <p>
              Confirm the result with Finalize match. No more points are needed.
            </p>
          </div>
        </div>
      )}
      {!props.completed && !committed.error && !committed.winner && lastWon && (
        <div className="result-banner score-win-notice" role="status">
          <Check size={22} />
          <div>
            <strong>
              Game {lastWon.game_no} won by {gameWinnerLabel}, {lastWon.score_a}
              –{lastWon.score_b}.
            </strong>
            <p>
              {last.score_a === 0 && last.score_b === 0
                ? `Game ${last.game_no} is ready at 0–0.`
                : `Game ${last.game_no} is in progress.`}
            </p>
          </div>
        </div>
      )}
      {props.locked && !props.completed && (
        <p className="notice">
          Assign this match to a court before recording scores.
        </p>
      )}
      <div className="score-teams">
        {(["a", "b"] as const).map((side, index) => (
          <div
            className={`score-side ${props.winner === side ? "winner" : ""}`}
            key={side}
          >
            <div className="score-side-label">
              <span className="eyebrow">
                Game {last.game_no} · Side {side.toUpperCase()}
              </span>
              <h3>{side === "a" ? props.sideA : props.sideB}</h3>
            </div>
            <div className="score-controls">
              <button
                className="btn score-adjust"
                disabled={
                  disabled || last[side === "a" ? "score_a" : "score_b"] === 0
                }
                onClick={() => point(side, -1)}
                aria-label={`Remove point from ${index === 0 ? props.sideA : props.sideB}`}
              >
                <Minus size={20} />
              </button>
              <strong className="score-number">
                {last[side === "a" ? "score_a" : "score_b"]}
              </strong>
              <button
                className="btn primary score-adjust"
                disabled={disabled || !!evaluation.winner}
                onClick={() => point(side, 1)}
                aria-label={`Add point to ${index === 0 ? props.sideA : props.sideB}`}
              >
                <Plus size={24} />
              </button>
            </div>
            <span className="muted">
              {side === "a" ? evaluation.gamesA : evaluation.gamesB} game
              {(side === "a" ? evaluation.gamesA : evaluation.gamesB) === 1
                ? ""
                : "s"}{" "}
              won
            </span>
          </div>
        ))}
      </div>
      <div className="game-score-row">
        {draft.map((game) => (
          <div className="game-score" key={game.game_no}>
            <span className="muted">Game {game.game_no}</span>
            <strong>
              {game.score_a} – {game.score_b}
            </strong>
            {gameWinner(game.score_a, game.score_b, rule) && (
              <Check size={14} />
            )}
          </div>
        ))}
      </div>
      {evaluation.error && (
        <p className="form-error" role="alert">
          {evaluation.error}
        </p>
      )}
      {message && (
        <p className="muted" role="status">
          {message}
        </p>
      )}
      {props.completed && !correcting && !props.locked && (
        <button
          className="btn"
          onClick={() => {
            if (
              window.confirm(
                "Correct this finalized result? Changes are recorded immediately when saved. A winner change is rejected if a later match has already started.",
              )
            ) {
              setCorrecting(true);
              setQuick(true);
            }
          }}
        >
          <Pencil size={16} />
          Correct result
        </button>
      )}
      {editable && (
        <div className="stack">
          <div className="button-row">
            <button
              className="btn"
              disabled={disabled}
              onClick={() => setQuick(!quick)}
            >
              <Pencil size={16} />
              {quick ? "Hide quick entry" : "Quick score entry"}
            </button>
            <button
              className="btn"
              disabled={disabled || !!evaluation.error}
              onClick={() => void save(draft, props.completed)}
            >
              <Save size={16} />
              Save {props.completed ? "correction" : "live score"}
            </button>
            {!props.completed && (
              <button
                className="btn primary"
                disabled={disabled || !evaluation.winner || !!evaluation.error}
                onClick={finalize}
              >
                <Check size={16} />
                Finalize match
              </button>
            )}
          </div>
          {quick && (
            <div className="quick-score-panel">
              <p className="muted">
                Enter each game in order. Completed games must have valid scores
                for the selected rules.
              </p>
              {draft.map((game, index) => (
                <div className="quick-score-row" key={game.game_no}>
                  <span>Game {game.game_no}</span>
                  {(["score_a", "score_b"] as const).map((key, sideIndex) => (
                    <label className="field" key={key}>
                      <span>{sideIndex === 0 ? props.sideA : props.sideB}</span>
                      <input
                        aria-label={`Game ${game.game_no}, ${sideIndex === 0 ? props.sideA : props.sideB} score`}
                        type="number"
                        min="0"
                        max={maxScore}
                        value={game[key]}
                        disabled={disabled}
                        onChange={(event) => {
                          const next = cleanGames(draft);
                          next[index][key] = Number(event.target.value);
                          setDraft(next);
                        }}
                      />
                    </label>
                  ))}
                  {index === draft.length - 1 && draft.length > 1 && (
                    <button
                      className="btn ghost small"
                      disabled={disabled}
                      onClick={() => setDraft(draft.slice(0, -1))}
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
              {draft.length < props.bestOf && (
                <button
                  className="btn small"
                  disabled={
                    disabled ||
                    !!evaluation.error ||
                    !!evaluation.winner ||
                    !gameWinner(last.score_a, last.score_b, rule)
                  }
                  onClick={() =>
                    setDraft([
                      ...draft,
                      { game_no: draft.length + 1, score_a: 0, score_b: 0 },
                    ])
                  }
                >
                  <Plus size={14} />
                  Add game
                </button>
              )}
            </div>
          )}
          {!props.completed && (
            <details className="walkover-options">
              <summary>
                Award a walkover <ChevronRight size={14} />
              </summary>
              <p className="muted">
                Use when a side cannot play. Confirmation is required.
              </p>
              <div className="button-row">
                <button
                  className="btn small"
                  disabled={disabled}
                  onClick={() => walkover("a")}
                >
                  {props.sideA} wins
                </button>
                <button
                  className="btn small"
                  disabled={disabled}
                  onClick={() => walkover("b")}
                >
                  {props.sideB} wins
                </button>
              </div>
            </details>
          )}
          {correcting && (
            <button
              className="btn ghost"
              onClick={() => {
                setCorrecting(false);
                setDraft(savedGames());
              }}
            >
              Cancel correction
            </button>
          )}
        </div>
      )}
    </section>
  );
}

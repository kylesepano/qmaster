import type { BracketFormat, BracketLane, MatchStatus } from "../types";

export interface BracketNode {
  id: string;
  bracket: BracketLane;
  round_no: number;
  position: number;
  entry_a_id: string | null;
  entry_b_id: string | null;
  source_a_match_id: string | null;
  source_a_outcome: "winner" | "loser" | null;
  source_b_match_id: string | null;
  source_b_outcome: "winner" | "loser" | null;
}
export interface ResolvedBracketNode extends BracketNode {
  status: MatchStatus;
  winner_entry_id: string | null;
  loser_entry_id: string | null;
}
type Feed = {
  entry?: string | null;
  match?: string;
  outcome?: "winner" | "loser";
};
const winner = (node: BracketNode): Feed => ({
  match: node.id,
  outcome: "winner",
});
const loser = (node: BracketNode): Feed => ({
  match: node.id,
  outcome: "loser",
});

/** Standard balanced seeding: 1 meets the last seed; top seeds get non-power-of-two BYEs. */
export function seedOrder(size: number): number[] {
  if (
    !Number.isInteger(size) ||
    size < 2 ||
    size > 64 ||
    (size & (size - 1)) !== 0
  )
    throw new Error("Bracket size must be a power of two between 2 and 64.");
  let seeds = [1, 2];
  while (seeds.length < size) {
    const next = seeds.length * 2 + 1;
    seeds = seeds.flatMap((seed) => [seed, next - seed]);
  }
  return seeds;
}

/** Generate an acyclic graph; the database persists, resolves BYEs and advances both outcomes. */
export function generateBracket(
  entryIds: string[],
  format: BracketFormat,
): BracketNode[] {
  if (entryIds.length < 2 || entryIds.length > 64)
    throw new Error(
      "Register between 2 and 64 entries before generating a bracket.",
    );
  if (new Set(entryIds).size !== entryIds.length || entryIds.some((id) => !id))
    throw new Error("Each tournament entry must be unique.");
  if (
    !["single_elimination", "double_elimination", "round_robin"].includes(
      format,
    )
  )
    throw new Error("Unsupported bracket format.");
  const nodes: BracketNode[] = [];
  const add = (
    bracket: BracketLane,
    round: number,
    position: number,
    a: Feed,
    b: Feed,
  ): BracketNode => {
    const node: BracketNode = {
      id: crypto.randomUUID(),
      bracket,
      round_no: round,
      position,
      entry_a_id: a.entry ?? null,
      entry_b_id: b.entry ?? null,
      source_a_match_id: a.match ?? null,
      source_a_outcome: a.outcome ?? null,
      source_b_match_id: b.match ?? null,
      source_b_outcome: b.outcome ?? null,
    };
    nodes.push(node);
    return node;
  };

  if (format === "round_robin") {
    const rotating: (string | null)[] = [...entryIds];
    if (rotating.length % 2) rotating.push(null);
    for (let round = 1; round < rotating.length; round++) {
      let position = 0;
      for (let index = 0; index < rotating.length / 2; index++) {
        const a = rotating[index];
        const b = rotating[rotating.length - index - 1];
        if (a && b)
          add("round_robin", round, ++position, { entry: a }, { entry: b });
      }
      rotating.splice(1, 0, rotating.pop()!);
    }
    return nodes;
  }

  const size = 2 ** Math.ceil(Math.log2(entryIds.length));
  const rounds = Math.log2(size);
  const seeds = seedOrder(size).map((seed) => entryIds[seed - 1] ?? null);
  const upper: BracketNode[][] = [];
  for (let round = 1; round <= rounds; round++) {
    const matches: BracketNode[] = [];
    for (let index = 0; index < size / 2 ** round; index++) {
      const a =
        round === 1
          ? { entry: seeds[index * 2] }
          : winner(upper[round - 2][index * 2]);
      const b =
        round === 1
          ? { entry: seeds[index * 2 + 1] }
          : winner(upper[round - 2][index * 2 + 1]);
      matches.push(
        add(
          format === "single_elimination" && round === rounds
            ? "final"
            : "upper",
          round,
          index + 1,
          a,
          b,
        ),
      );
    }
    upper.push(matches);
  }
  if (format === "single_elimination") return nodes;

  let lower: BracketNode[] = [];
  if (rounds > 1) {
    for (let index = 0; index < upper[0].length / 2; index++)
      lower.push(
        add(
          "lower",
          1,
          index + 1,
          loser(upper[0][index * 2]),
          loser(upper[0][index * 2 + 1]),
        ),
      );
    for (let upperRound = 2; upperRound <= rounds; upperRound++) {
      const dropouts = [...upper[upperRound - 1]].reverse();
      lower = lower.map((node, index) =>
        add(
          "lower",
          upperRound * 2 - 2,
          index + 1,
          winner(node),
          loser(dropouts[index]),
        ),
      );
      if (upperRound < rounds) {
        const reduced: BracketNode[] = [];
        for (let index = 0; index < lower.length / 2; index++)
          reduced.push(
            add(
              "lower",
              upperRound * 2 - 1,
              index + 1,
              winner(lower[index * 2]),
              winner(lower[index * 2 + 1]),
            ),
          );
        lower = reduced;
      }
    }
  }
  const upperFinal = upper.at(-1)![0];
  const grandFinal = add(
    "final",
    1,
    1,
    winner(upperFinal),
    rounds === 1 ? loser(upperFinal) : winner(lower[0]),
  );
  add("reset", 1, 1, winner(grandFinal), loser(grandFinal));
  return nodes;
}

/** Pure reference resolver used in domain tests; authoritative progression runs atomically in SQL. */
export function resolveBracket(
  nodes: BracketNode[],
  results: Record<string, "a" | "b"> = {},
): ResolvedBracketNode[] {
  const resolved = nodes.map((node) => ({
    ...node,
    status: "pending" as MatchStatus,
    winner_entry_id: null as string | null,
    loser_entry_id: null as string | null,
  }));
  const lookup = new Map(resolved.map((node) => [node.id, node]));
  if (lookup.size !== nodes.length)
    throw new Error("Duplicate match identifiers.");
  const terminal = (node: ResolvedBracketNode) =>
    ["completed", "bye", "skipped"].includes(node.status);
  for (let pass = 0; pass < nodes.length + 1; pass++) {
    let changed = false;
    for (const node of resolved) {
      if (terminal(node)) continue;
      if (node.bracket === "reset") {
        const final = node.source_a_match_id
          ? lookup.get(node.source_a_match_id)
          : undefined;
        if (!final || !terminal(final)) continue;
        if (final.winner_entry_id === final.entry_a_id) {
          node.status = "skipped";
          changed = true;
          continue;
        }
      }
      const read = (
        side: "a" | "b",
      ): { ready: boolean; entry: string | null } => {
        const sourceId = node[`source_${side}_match_id`];
        if (!sourceId) return { ready: true, entry: node[`entry_${side}_id`] };
        const source = lookup.get(sourceId);
        if (!source) throw new Error("A match references an unknown source.");
        const outcome = node[`source_${side}_outcome`];
        return {
          ready: terminal(source),
          entry:
            outcome === "winner"
              ? source.winner_entry_id
              : source.loser_entry_id,
        };
      };
      const a = read("a"),
        b = read("b");
      if (!a.ready || !b.ready) continue;
      node.entry_a_id = a.entry;
      node.entry_b_id = b.entry;
      if (a.entry && b.entry && a.entry === b.entry)
        throw new Error("A player cannot play themselves.");
      if (!a.entry || !b.entry) {
        node.status = "bye";
        node.winner_entry_id = a.entry ?? b.entry;
        changed = true;
      } else if (results[node.id]) {
        node.status = "completed";
        node.winner_entry_id = results[node.id] === "a" ? a.entry : b.entry;
        node.loser_entry_id = results[node.id] === "a" ? b.entry : a.entry;
        changed = true;
      } else if (node.status !== "ready") {
        node.status = "ready";
        changed = true;
      }
    }
    if (!changed) return resolved;
  }
  throw new Error("The bracket contains an unresolved dependency cycle.");
}

export function shuffleEntries<T>(entries: T[]): T[] {
  const copy = [...entries];
  for (let index = copy.length - 1; index > 0; index--) {
    const random = new Uint32Array(1);
    crypto.getRandomValues(random);
    // Rejection sampling prevents bias when the integer range does not divide 2^32.
    const limit = Math.floor(2 ** 32 / (index + 1)) * (index + 1);
    while (random[0] >= limit) crypto.getRandomValues(random);
    const other = random[0] % (index + 1);
    [copy[index], copy[other]] = [copy[other], copy[index]];
  }
  return copy;
}

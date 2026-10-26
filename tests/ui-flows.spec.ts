// Browser interaction tests use intercepted fixture responses only. They do not
// claim to verify a live Supabase project; database integration has separate tests.
import { test, expect, type Page } from "@playwright/test";
import type { AppData, Game, QueueMatch, TournamentMatch } from "../src/types";

const uid = "10000000-0000-4000-8000-000000000001";
const queueId = "20000000-0000-4000-8000-000000000001";
const tournamentId = "30000000-0000-4000-8000-000000000001";
const tournamentMatchId = "40000000-0000-4000-8000-000000000001";
const queueMatchId = "50000000-0000-4000-8000-000000000001";
const playerId = (index: number) =>
  `60000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
const entryId = (index: number) =>
  `70000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
const timestamp = new Date().toISOString();

function fixture(): AppData {
  return {
    players: ["Alex", "Blair", "Casey", "Drew", "Ellis", "Frankie"].map(
      (name, index) => ({
        id: playerId(index),
        organizer_id: uid,
        name,
        photo_path: null,
        archived: false,
        created_at: timestamp,
      }),
    ),
    tournaments: [
      {
        id: tournamentId,
        organizer_id: uid,
        name: "Club singles",
        description: null,
        event_date: timestamp.slice(0, 10),
        venue: "Main hall",
        play_type: "singles",
        court_count: 2,
        best_of: 3,
        format: "single_elimination",
        status: "ongoing",
        published: false,
        banner_path: null,
        champion_entry_id: null,
        created_at: timestamp,
      },
    ],
    entries: [0, 1].map((index) => ({
      id: entryId(index),
      tournament_id: tournamentId,
      name: ["Alex", "Blair"][index],
      seed: index + 1,
      player_ids: [playerId(index)],
    })),
    tournamentMatches: [
      {
        id: tournamentMatchId,
        tournament_id: tournamentId,
        bracket: "final",
        round_no: 1,
        position: 0,
        entry_a_id: entryId(0),
        entry_b_id: entryId(1),
        source_a_match_id: null,
        source_a_outcome: null,
        source_b_match_id: null,
        source_b_outcome: null,
        winner_entry_id: null,
        loser_entry_id: null,
        status: "ready",
        court_no: null,
        started_at: null,
        completed_at: null,
        walkover: false,
        version: 0,
      },
    ],
    queueSessions: [
      {
        id: queueId,
        organizer_id: uid,
        name: "Friday doubles",
        play_type: "doubles",
        court_count: 3,
        best_of: 1,
        status: "ongoing",
        created_at: timestamp,
      },
    ],
    queueMembers: Array.from({ length: 6 }, (_, index) => ({
      id: `80000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      session_id: queueId,
      player_id: playerId(index),
      position: index + 1,
      status: "waiting",
      rejoin: true,
    })),
    queueMatches: [],
    queueMatchPlayers: [],
    games: [],
  };
}

interface Harness {
  data: AppData;
  calls: { name: string; args: Record<string, any> }[];
  conflictOnce?: boolean;
}
async function mockSupabase(
  page: Page,
  harness: Harness,
  authenticated = true,
) {
  const expiresAt = Math.floor(Date.now() / 1000) + 3600;
  const encode = (item: object) =>
    Buffer.from(JSON.stringify(item)).toString("base64url");
  const accessToken = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: uid, aud: "authenticated", role: "authenticated", exp: expiresAt })}.c2lnbmF0dXJl`;
  const user = {
    id: uid,
    email: "organizer@example.test",
    aud: "authenticated",
    role: "authenticated",
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: {},
    created_at: timestamp,
  };
  if (authenticated)
    await page.addInitScript(
      ({ session }) => {
        localStorage.setItem(
          "sb-qmastertest-auth-token",
          JSON.stringify(session),
        );
      },
      {
        session: {
          access_token: accessToken,
          refresh_token: "fixture-refresh-token",
          expires_at: expiresAt,
          expires_in: 3600,
          token_type: "bearer",
          user,
        },
      },
    );
  await page.route("https://qmastertest.supabase.co/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const headers = {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "*",
      "access-control-allow-methods": "*",
    };
    const json = (body: unknown, status = 200) =>
      route.fulfill({
        status,
        headers,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    if (request.method() === "OPTIONS")
      return route.fulfill({ status: 204, headers });
    if (path.startsWith("/auth/v1/")) return json(user);
    const data = harness.data;
    if (path.includes("/rpc/")) {
      const name = path.split("/").at(-1)!;
      const args = request.postDataJSON() as Record<string, any>;
      harness.calls.push({ name, args });
      if (name === "get_public_sessions") {
        return json(
          data.queueSessions
            .filter(
              (s) =>
                s.published &&
                (!args.p_session_id || s.id === args.p_session_id),
            )
            .map((s) => ({
              id: s.id,
              name: s.name,
              play_type: s.play_type,
              court_count: s.court_count,
              best_of: s.best_of,
              status: s.status,
              created_at: s.created_at,
              waiting: data.queueMembers
                .filter((m) => m.session_id === s.id && m.status === "waiting")
                .sort((a, b) => a.position - b.position)
                .map((m) => ({
                  name: data.players.find((p) => p.id === m.player_id)!.name,
                  position: m.position,
                })),
              matches: data.queueMatches
                .filter((m) => m.session_id === s.id)
                .map((m) => ({
                  ...m,
                  side_a: data.queueMatchPlayers
                    .filter((p) => p.match_id === m.id && p.side === "a")
                    .map(
                      (p) =>
                        data.players.find((x) => x.id === p.player_id)!.name,
                    )
                    .join(" / "),
                  side_b: data.queueMatchPlayers
                    .filter((p) => p.match_id === m.id && p.side === "b")
                    .map(
                      (p) =>
                        data.players.find((x) => x.id === p.player_id)!.name,
                    )
                    .join(" / "),
                  games: data.games.filter((g) => g.queue_match_id === m.id),
                })),
            })),
        );
      }
      if (name === "publish_queue_session") {
        const session = data.queueSessions.find(
          (s) => s.id === args.p_session_id,
        )!;
        session.published = args.p_published;
        return json(null);
      }
      if (name === "delete_tournament") {
        const ids = data.tournamentMatches
          .filter((m) => m.tournament_id === args.p_tournament_id)
          .map((m) => m.id);
        data.games = data.games.filter(
          (g) => !ids.includes(g.tournament_match_id ?? ""),
        );
        data.tournamentMatches = data.tournamentMatches.filter(
          (m) => m.tournament_id !== args.p_tournament_id,
        );
        data.entries = data.entries.filter(
          (e) => e.tournament_id !== args.p_tournament_id,
        );
        data.tournaments = data.tournaments.filter(
          (t) => t.id !== args.p_tournament_id,
        );
        return json(null);
      }
      if (name === "delete_queue_session") {
        const ids = data.queueMatches
          .filter((m) => m.session_id === args.p_session_id)
          .map((m) => m.id);
        data.games = data.games.filter(
          (g) => !ids.includes(g.queue_match_id ?? ""),
        );
        data.queueMatchPlayers = data.queueMatchPlayers.filter(
          (p) => !ids.includes(p.match_id),
        );
        data.queueMatches = data.queueMatches.filter(
          (m) => m.session_id !== args.p_session_id,
        );
        data.queueMembers = data.queueMembers.filter(
          (m) => m.session_id !== args.p_session_id,
        );
        data.queueSessions = data.queueSessions.filter(
          (s) => s.id !== args.p_session_id,
        );
        return json(null);
      }
      if (name === "purge_player") {
        data.queueMembers = data.queueMembers.filter(
          (m) => m.player_id !== args.p_player_id,
        );
        data.players = data.players.filter((p) => p.id !== args.p_player_id);
        return json(null);
      }
      if (name === "clear_test_data") {
        if (args.p_confirmation !== "DELETE ALL")
          return json({ message: "Confirmation required" }, 400);
        for (const key of Object.keys(data) as (keyof AppData)[])
          data[key] = [];
        return json(null);
      }
      if (name === "start_queue_match") {
        const match: QueueMatch = {
          id: queueMatchId,
          session_id: args.p_session_id,
          status: "playing",
          court_no: args.p_court_no,
          winner_side: null,
          started_at: timestamp,
          completed_at: null,
          walkover: false,
          version: 0,
        };
        data.queueMatches.push(match);
        const ids = args.p_player_ids as string[];
        ids.forEach((id, index) => {
          data.queueMatchPlayers.push({
            match_id: match.id,
            player_id: id,
            side: index < ids.length / 2 ? "a" : "b",
          });
          const member = data.queueMembers.find(
            (item) => item.player_id === id,
          )!;
          member.status = "playing";
        });
        return json(match.id);
      }
      if (name === "assign_tournament_court") {
        const match = data.tournamentMatches.find(
          (item) => item.id === args.p_match_id,
        )!;
        match.status = "playing";
        match.court_no = args.p_court_no;
        match.started_at = timestamp;
        match.version++;
        return json(null);
      }
      if (name === "save_match_score") {
        const match = (
          args.p_kind === "tournament"
            ? data.tournamentMatches
            : data.queueMatches
        ).find((item) => item.id === args.p_match_id)!;
        if (harness.conflictOnce) {
          harness.conflictOnce = false;
          match.version++;
          data.games = [
            {
              id: "90000000-0000-4000-8000-000000000001",
              tournament_match_id: match.id,
              queue_match_id: null,
              game_no: 1,
              score_a: 2,
              score_b: 0,
            },
          ];
          return json(
            {
              message:
                "This score changed on another device. Reload and try again.",
              code: "P0001",
            },
            400,
          );
        }
        if (args.p_expected_version !== match.version)
          return json(
            { message: "This score changed on another device.", code: "P0001" },
            400,
          );
        match.version++;
        data.games = data.games.filter(
          (game) =>
            game.tournament_match_id !== match.id &&
            game.queue_match_id !== match.id,
        );
        for (const game of args.p_games as Game[])
          data.games.push({
            ...game,
            id: crypto.randomUUID(),
            tournament_match_id: args.p_kind === "tournament" ? match.id : null,
            queue_match_id: args.p_kind === "queue" ? match.id : null,
          });
        if (args.p_finalize) {
          const wasCompleted = match.status === "completed";
          match.status = "completed";
          match.completed_at = timestamp;
          match.walkover = !!args.p_walkover_side;
          const winner =
            args.p_walkover_side ??
            ((args.p_games as Game[]).filter(
              (game) => game.score_a > game.score_b,
            ).length >
            (args.p_games as Game[]).filter(
              (game) => game.score_b > game.score_a,
            ).length
              ? "a"
              : "b");
          if ("winner_side" in match) {
            match.winner_side = winner;
            if (!wasCompleted) {
              const players = data.queueMatchPlayers.filter(
                (item) => item.match_id === match.id,
              );
              let lastPosition = Math.max(
                ...data.queueMembers.map((member) => member.position),
              );
              for (const item of players) {
                const member = data.queueMembers.find(
                  (member) => member.player_id === item.player_id,
                )!;
                member.status = "waiting";
                member.position = ++lastPosition;
              }
            }
          } else {
            match.winner_entry_id =
              winner === "a" ? match.entry_a_id : match.entry_b_id;
            match.loser_entry_id =
              winner === "a" ? match.entry_b_id : match.entry_a_id;
          }
        }
        return json(null);
      }
      return json(null);
    }
    const tables: Record<string, unknown[]> = {
      players: data.players,
      tournaments: data.tournaments,
      tournament_entries: data.entries,
      tournament_entry_players: data.entries.flatMap((entry) =>
        entry.player_ids.map((id, index) => ({
          id: `${entry.id}-${index}`,
          tournament_id: entry.tournament_id,
          entry_id: entry.id,
          player_id: id,
        })),
      ),
      tournament_matches: data.tournamentMatches,
      queue_sessions: data.queueSessions,
      queue_members: data.queueMembers,
      queue_matches: data.queueMatches,
      queue_match_players: data.queueMatchPlayers,
      match_games: data.games,
    };
    let rows = (tables[path.split("/").at(-1)!] ?? []) as Record<
      string,
      unknown
    >[];
    for (const [column, filter] of url.searchParams) {
      if (filter.startsWith("eq."))
        rows = rows.filter((row) => String(row[column]) === filter.slice(3));
      if (filter.startsWith("in.(")) {
        const ids = filter
          .slice(4, -1)
          .split(",")
          .map((id) => id.replace(/^"|"$/g, ""));
        rows = rows.filter(
          (row) => row[column] != null && ids.includes(String(row[column])),
        );
      }
    }
    const offset = Number(url.searchParams.get("offset") ?? 0);
    const limit = Number(url.searchParams.get("limit") ?? 500);
    return json(rows.slice(offset, offset + limit));
  });
}

test("doubles queue permits manual selection, saves points and final scores, then rotates players", async ({
  page,
}) => {
  const harness: Harness = { data: fixture(), calls: [] };
  await mockSupabase(page, harness);
  await page.goto(`/queue/${queueId}`);
  await expect(
    page.getByRole("heading", { name: "Friday doubles", exact: true }),
  ).toBeVisible();
  const sideAPlayerOne = page.getByRole("combobox", {
    name: "Side A · Player 1",
    exact: true,
  });
  await expect(sideAPlayerOne).toHaveValue(playerId(0));
  await sideAPlayerOne.selectOption(playerId(4));
  await page
    .getByRole("button", { name: "Call players & start match", exact: true })
    .click();
  await expect(page).toHaveURL(`/matches/${queueMatchId}`);
  expect(
    harness.calls.find((call) => call.name === "start_queue_match")?.args,
  ).toEqual({
    p_session_id: queueId,
    p_player_ids: [playerId(4), playerId(1), playerId(2), playerId(3)],
    p_court_no: 1,
  });
  await page
    .getByRole("button", { name: "Add point to Ellis / Blair", exact: true })
    .click();
  await expect(page.locator(".score-number").first()).toHaveText("1");
  await expect.poll(() => harness.data.games[0]?.score_a).toBe(1);
  await page
    .getByRole("button", { name: "Quick score entry", exact: true })
    .click();
  await page
    .getByLabel("Game 1, Ellis / Blair score", { exact: true })
    .fill("21");
  await page
    .getByLabel("Game 1, Casey / Drew score", { exact: true })
    .fill("17");
  await page
    .getByRole("button", { name: "Save live score", exact: true })
    .click();
  await expect.poll(() => harness.data.games[0]?.score_a).toBe(21);
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Finalize match", exact: true })
    .click();
  await expect(
    page.getByText("Ellis / Blair wins", { exact: true }),
  ).toBeVisible();
  expect(harness.data.queueMatches[0].status).toBe("completed");
  await page.goto(`/queue/${queueId}`);
  await expect(page.locator(".queue-list .queue-player strong")).toHaveText([
    "Alex",
    "Frankie",
    "Ellis",
    "Blair",
    "Casey",
    "Drew",
  ]);
  await expect(page.getByText("Playing", { exact: true })).toHaveCount(0);
});

test("tournament scoring recovers an optimistic conflict and completes best of three", async ({
  page,
}) => {
  const harness: Harness = { data: fixture(), calls: [], conflictOnce: true };
  await mockSupabase(page, harness);
  await page.goto(`/matches/${tournamentMatchId}`);
  await page.getByRole("button", { name: "Start match", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Add point to Alex", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Add point to Alex", exact: true })
    .click();
  await expect(page.locator(".score-number").first()).toHaveText("2");
  await page
    .getByRole("button", { name: "Add point to Alex", exact: true })
    .click();
  await expect.poll(() => harness.data.games[0]?.score_a).toBe(3);
  await page
    .getByRole("button", { name: "Quick score entry", exact: true })
    .click();
  await page.getByLabel("Game 1, Alex score", { exact: true }).fill("21");
  await page.getByLabel("Game 1, Blair score", { exact: true }).fill("18");
  await page
    .getByRole("button", { name: "Save live score", exact: true })
    .click();
  await expect.poll(() => harness.data.games[0]?.score_a).toBe(21);
  await page
    .getByRole("button", { name: "Add point to Alex", exact: true })
    .click();
  await expect(
    page.getByLabel("Game 2, Alex score", { exact: true }),
  ).toHaveValue("1");
  await page.getByLabel("Game 2, Alex score", { exact: true }).fill("21");
  await page.getByLabel("Game 2, Blair score", { exact: true }).fill("19");
  await page
    .getByRole("button", { name: "Save live score", exact: true })
    .click();
  await expect.poll(() => harness.data.games.length).toBe(2);
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Finalize match", exact: true })
    .click();
  await expect(page.getByText("Alex wins", { exact: true })).toBeVisible();
  expect(harness.data.tournamentMatches[0].winner_entry_id).toBe(entryId(0));
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Correct result", exact: true })
    .click();
  await page.getByLabel("Game 2, Blair score", { exact: true }).fill("17");
  await page
    .getByRole("button", { name: "Save correction", exact: true })
    .click();
  await expect
    .poll(() => harness.data.games.find((game) => game.game_no === 2)?.score_b)
    .toBe(17);
  await expect(
    page.getByRole("button", { name: "Correct result", exact: true }),
  ).toBeVisible();
});

test("mobile scoreboard records a confirmed walkover without requiring scores", async ({
  page,
}) => {
  const data = fixture();
  data.tournamentMatches[0].status = "playing";
  data.tournamentMatches[0].court_no = 1;
  data.tournamentMatches[0].started_at = timestamp;
  const harness: Harness = { data, calls: [] };
  await page.setViewportSize({ width: 390, height: 844 });
  await mockSupabase(page, harness);
  await page.goto(`/matches/${tournamentMatchId}`);
  await expect(
    page.getByRole("heading", { name: "Match scoreboard" }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/flows/scoreboard-mobile.png",
    fullPage: true,
  });
  await page.getByText("Award a walkover", { exact: false }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Blair wins", exact: true }).click();
  await expect(
    page.getByText("Blair wins by walkover", { exact: true }),
  ).toBeVisible();
  expect(harness.data.games).toHaveLength(0);
  expect(harness.data.tournamentMatches[0].winner_entry_id).toBe(entryId(1));
  await expect(
    page.getByRole("button", { name: "Finalize match", exact: true }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("published results work without authentication and have no scoring controls", async ({
  page,
}) => {
  const data = fixture();
  data.tournaments[0].published = true;
  const harness: Harness = { data, calls: [] };
  await mockSupabase(page, harness, false);
  await page.goto(`/public/tournaments/${tournamentId}`);
  await expect(
    page.getByRole("heading", { name: "Club singles", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".bracket-name").first()).toHaveText("Alex");
  await expect(
    page.getByRole("button", { name: /score|edit|finalize|start/i }),
  ).toHaveCount(0);
  await expect(page.locator('a[href^="/matches/"]')).toHaveCount(0);
  expect(harness.calls).toHaveLength(0);
  data.tournaments[0].published = false;
  await page.reload();
  await expect(
    page.getByRole("heading", {
      name: "This tournament is private or unavailable",
    }),
  ).toBeVisible();
});

test("tournament deletion can be canceled and removes the event only after confirmation", async ({
  page,
}) => {
  const harness: Harness = { data: fixture(), calls: [] };
  await mockSupabase(page, harness);
  await page.goto("/tournaments");
  await page
    .getByRole("button", { name: "Delete Club singles", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "Active matches will be canceled",
  );
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(harness.calls).toHaveLength(0);
  await page
    .getByRole("button", { name: "Delete Club singles", exact: true })
    .click();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "The next trophy could be yours" }),
  ).toBeVisible();
  expect(harness.calls.at(-1)).toEqual({
    name: "delete_tournament",
    args: { p_tournament_id: tournamentId },
  });
  expect(harness.data.players).toHaveLength(6);
});

test("queue detail deletion redirects and players can be permanently removed", async ({
  page,
}) => {
  const harness: Harness = { data: fixture(), calls: [] };
  await mockSupabase(page, harness);
  await page.goto(`/queue/${queueId}`);
  await page
    .getByRole("button", { name: "Delete Friday doubles", exact: true })
    .click();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page).toHaveURL("/queue");
  await expect(
    page.getByRole("heading", { name: "No queue sessions yet" }),
  ).toBeVisible();
  await page.goto("/players");
  await page.getByRole("button", { name: "Delete Casey", exact: true }).click();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Casey", exact: true }),
  ).toHaveCount(0);
  expect(harness.calls.at(-1)).toEqual({
    name: "purge_player",
    args: { p_player_id: playerId(2) },
  });
});

test("workspace reset requires DELETE ALL and keeps organizer signed in", async ({
  page,
}) => {
  const harness: Harness = { data: fixture(), calls: [] };
  await mockSupabase(page, harness);
  await page.goto("/settings");
  await page
    .getByRole("button", { name: "Clear all test data", exact: true })
    .click();
  const clear = page.getByRole("button", {
    name: "Permanently clear workspace",
    exact: true,
  });
  await expect(clear).toBeDisabled();
  await page.getByLabel("Type DELETE ALL to confirm").fill("delete all");
  await expect(clear).toBeDisabled();
  await page.getByLabel("Type DELETE ALL to confirm").fill("DELETE ALL");
  await clear.click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByText("Test data cleared. Your workspace is empty.", {
      exact: true,
    }),
  ).toBeVisible();
  expect(harness.calls.at(-1)).toEqual({
    name: "clear_test_data",
    args: { p_confirmation: "DELETE ALL" },
  });
  for (const records of Object.values(harness.data))
    expect(records).toHaveLength(0);
  await page.goto("/dashboard");
  await expect(
    page.getByRole("heading", { name: "Let’s get the games going." }),
  ).toBeVisible();
});

test("home defaults to public tournaments and filters live events and history without signing in", async ({
  page,
}) => {
  const data = fixture();
  data.tournaments[0].published = true;
  data.tournaments.push({
    ...data.tournaments[0],
    id: crypto.randomUUID(),
    name: "Last month cup",
    status: "completed",
  });
  data.tournaments.push({
    ...data.tournaments[0],
    id: crypto.randomUUID(),
    name: "Private cup",
    published: false,
  });
  const harness: Harness = { data, calls: [] };
  await mockSupabase(page, harness, false);
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Tournaments", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Admin login", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Club singles", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Private cup", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "History", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Last month cup", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Club singles", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Live now", exact: true }).click();
  await page
    .getByRole("link")
    .filter({
      has: page.getByRole("heading", { name: "Club singles", exact: true }),
    })
    .click();
  await expect(page).toHaveURL(`/public/tournaments/${tournamentId}`);
  await expect(page.locator(".bracket-name").first()).toHaveText("Alex");
  await expect(
    page.getByRole("button", { name: /edit|finalize|delete/i }),
  ).toHaveCount(0);
});

test("public sessions show live courts, waiting order and match history on mobile", async ({
  page,
}) => {
  const data = fixture();
  data.queueSessions[0].published = true;
  const match: QueueMatch = {
    id: queueMatchId,
    session_id: queueId,
    status: "playing",
    court_no: 1,
    winner_side: null,
    started_at: timestamp,
    completed_at: null,
    walkover: false,
    version: 1,
  };
  data.queueMatches = [match];
  data.queueMatchPlayers = [0, 1, 2, 3].map((i) => ({
    match_id: match.id,
    player_id: playerId(i),
    side: i < 2 ? "a" : "b",
  }));
  for (const member of data.queueMembers.slice(0, 4)) member.status = "playing";
  data.games = [
    {
      id: crypto.randomUUID(),
      queue_match_id: match.id,
      tournament_match_id: null,
      game_no: 1,
      score_a: 12,
      score_b: 9,
    },
  ];
  const harness: Harness = { data, calls: [] };
  await mockSupabase(page, harness, false);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("link", { name: "Queue sessions", exact: true }).click();
  await page
    .getByRole("link")
    .filter({
      has: page.getByRole("heading", { name: "Friday doubles", exact: true }),
    })
    .click();
  await expect(
    page.getByRole("heading", { name: "Friday doubles", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Alex / Blair", { exact: true })).toBeVisible();
  await expect(page.locator(".public-score-row").first()).toContainText("12");
  await expect(page.locator(".public-waiting-list li").first()).toContainText(
    "Ellis",
  );
  await page.screenshot({
    path: "test-results/flows/public-session-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  match.status = "completed";
  match.winner_side = "a";
  match.completed_at = timestamp;
  data.queueSessions[0].status = "completed";
  data.queueMembers = [];
  await page.reload();
  await expect(
    page.getByText("Alex / Blair won", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Match history", exact: true }),
  ).toBeVisible();
  data.queueSessions[0].published = false;
  await page.reload();
  await expect(
    page.getByRole("heading", {
      name: "This session is private or unavailable",
    }),
  ).toBeVisible();
});

test("admin publishes sessions to the home page and setup guide is removed", async ({
  page,
}) => {
  const harness: Harness = { data: fixture(), calls: [] };
  await mockSupabase(page, harness);
  await page.goto(`/queue/${queueId}`);
  await page
    .getByRole("button", { name: "Publish session", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Publish session", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Make private", exact: true }),
  ).toBeVisible();
  expect(harness.data.queueSessions[0].published).toBe(true);
  await page.goto("/?view=sessions");
  await expect(
    page.getByRole("heading", { name: "Friday doubles", exact: true }),
  ).toBeVisible();
  await page.goto("/settings");
  await expect(
    page.getByRole("heading", { name: "Connect Qmaster in five steps" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Clear test data" }),
  ).toBeVisible();
});

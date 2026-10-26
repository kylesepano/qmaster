// Browser interaction tests use intercepted fixture responses only. They do not
// claim to verify a live Supabase project; database integration has separate tests.
import { test, expect, type Page } from "@playwright/test";
import type {
  AppData,
  Game,
  QueueMatch,
  TournamentMatch,
  PublicPlayer,
} from "../src/types";
import { resolveBracket } from "../src/utilities/brackets";

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

test("public Games navigation shows only live published matches", async ({
  page,
}) => {
  const data = fixture();
  data.tournaments[0].published = true;
  data.tournamentMatches[0].status = "playing";
  data.tournamentMatches[0].court_no = 2;
  const harness: Harness = { data, calls: [] };
  await mockSupabase(page, harness, false);
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Public navigation" });
  await expect(nav.getByRole("link")).toHaveText([
    "Games",
    "Players",
    "Sessions",
    "Tournaments",
  ]);
  await nav.getByRole("link", { name: "Games", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Games", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Club singles" }),
  ).toBeVisible();
  await expect(page.getByText("Court 2", { exact: true })).toBeVisible();
  data.tournaments[0].published = false;
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "No live games right now" }),
  ).toBeVisible();
});

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
  publicPlayers?: PublicPlayer[];
  mediaFiles?: { path: string; created_at: string }[];
  mediaJobs?: { id: string; organizer_id: string; path: string }[];
  storageRemoved?: string[];
  storageFail?: boolean;
  blockPurge?: boolean;
  failPlayerSave?: boolean;
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
    function enqueue(path: string | null | undefined) {
      if (path && !harness.mediaJobs?.some((j) => j.path === path)) {
        harness.mediaJobs ??= [];
        harness.mediaJobs.push({
          id: crypto.randomUUID(),
          organizer_id: uid,
          path,
        });
      }
    }
    if (
      path === "/storage/v1/object/qmaster-media" &&
      request.method() === "DELETE"
    ) {
      if (harness.storageFail)
        return json(
          {
            message: "Storage temporarily unavailable",
            error: "Storage temporarily unavailable",
            statusCode: "503",
          },
          503,
        );
      const paths = request.postDataJSON().prefixes as string[];
      const removed = (harness.mediaFiles ?? []).filter((f) =>
        paths.includes(f.path),
      );
      harness.storageRemoved ??= [];
      harness.storageRemoved.push(...removed.map((f) => f.path));
      harness.mediaFiles = harness.mediaFiles?.filter(
        (f) => !paths.includes(f.path),
      );
      return json(
        removed.map((f) => ({ name: f.path, id: crypto.randomUUID() })),
      );
    }
    if (path === "/storage/v1/object/list/qmaster-media") {
      const options = request.postDataJSON();
      const prefix = `${options.prefix}/`;
      const files = (harness.mediaFiles ?? [])
        .filter((f) => f.path.startsWith(prefix))
        .map((f) => ({
          id: crypto.randomUUID(),
          name: f.path.slice(prefix.length),
          created_at: f.created_at,
          updated_at: f.created_at,
          metadata: {},
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
      return json(
        files.slice(
          options.offset ?? 0,
          (options.offset ?? 0) + (options.limit ?? 100),
        ),
      );
    }
    if (path.startsWith("/storage/v1/object/sign/qmaster-media/"))
      return json({
        signedURL: "/object/sign/qmaster-media/fixture.png?token=fixture",
      });
    if (
      path.startsWith("/storage/v1/object/qmaster-media/") &&
      request.method() === "POST"
    ) {
      const filePath = decodeURIComponent(
        path.split("/object/qmaster-media/")[1],
      );
      harness.mediaFiles ??= [];
      harness.mediaFiles.push({
        path: filePath,
        created_at: new Date().toISOString(),
      });
      return json({ Key: `qmaster-media/${filePath}` });
    }
    if (path.endsWith("/media_cleanup") && request.method() === "DELETE") {
      const id = url.searchParams.get("id")?.slice(3);
      harness.mediaJobs = harness.mediaJobs?.filter((j) => j.id !== id);
      return json(null);
    }
    if (path.endsWith("/players") && request.method() === "PATCH") {
      if (harness.failPlayerSave)
        return json({ message: "Player save failed" }, 409);
      const player = data.players.find(
        (p) => p.id === url.searchParams.get("id")?.slice(3),
      )!;
      const values = request.postDataJSON();
      if ("photo_path" in values && values.photo_path !== player.photo_path)
        enqueue(player.photo_path);
      Object.assign(player, values);
      return json(null);
    }
    if (path.includes("/rpc/")) {
      const name = path.split("/").at(-1)!;
      const args = request.postDataJSON() as Record<string, any>;
      harness.calls.push({ name, args });
      if (name === "enqueue_media_cleanup") {
        enqueue(args.p_path);
        return json(null);
      }
      if (name === "register_queue_team") {
        const team = {
          id: crypto.randomUUID(),
          session_id: args.p_session_id,
          name: args.p_name,
          position:
            (data.queueTeams?.filter((t) => t.session_id === args.p_session_id)
              .length ?? 0) + 1,
          player_ids: args.p_player_ids,
        };
        data.queueTeams ??= [];
        data.queueTeams.push(team);
        for (const id of team.player_ids as string[])
          if (
            !data.queueMembers.some(
              (m) => m.session_id === team.session_id && m.player_id === id,
            )
          )
            data.queueMembers.push({
              id: crypto.randomUUID(),
              session_id: team.session_id,
              player_id: id,
              position: data.queueMembers.length + 1,
              status: "waiting",
              rejoin: true,
            });
        return json(team.id);
      }
      if (name === "seed_queue_teams") {
        for (const [i, id] of args.p_team_ids.entries())
          data.queueTeams!.find((t) => t.id === id)!.position = i + 1;
        return json(null);
      }
      if (name === "remove_queue_team") {
        data.queueTeams = data.queueTeams?.filter(
          (t) => t.id !== args.p_team_id,
        );
        return json(null);
      }
      if (name === "generate_queue_bracket") {
        const session = data.queueSessions.find(
          (s) => s.id === args.p_session_id,
        )!;
        const tid = crypto.randomUUID();
        data.tournaments.push({
          id: tid,
          organizer_id: uid,
          name: session.name,
          event_date: timestamp.slice(0, 10),
          venue: null,
          description: null,
          play_type: session.play_type,
          court_count: session.court_count,
          best_of: session.best_of,
          scoring_rule: session.scoring_rule,
          format: session.bracket_format ?? "single_elimination",
          status: "ongoing",
          published: !!session.published,
          queue_session_id: session.id,
          banner_path: null,
          champion_entry_id: null,
          created_at: timestamp,
        });
        for (const [i, id] of args.p_team_order.entries()) {
          const team = data.queueTeams!.find((t) => t.id === id)!;
          data.entries.push({
            id: team.id,
            tournament_id: tid,
            name: team.name,
            seed: i + 1,
            player_ids: team.player_ids,
          });
        }
        let court = 0;
        for (const node of resolveBracket(args.p_matches)) {
          const playing =
            node.status === "ready" && court < session.court_count;
          if (playing) court++;
          data.tournamentMatches.push({
            ...node,
            tournament_id: tid,
            status: playing ? "playing" : node.status,
            court_no: playing ? court : null,
            started_at: playing ? timestamp : null,
            completed_at: null,
            walkover: false,
            version: playing ? 1 : 0,
          });
        }
        return json(tid);
      }
      if (name === "start_registered_queue_match") {
        const a = data.queueTeams!.find((t) => t.id === args.p_team_a_id)!,
          b = data.queueTeams!.find((t) => t.id === args.p_team_b_id)!;
        args.p_session_id = a.session_id;
        args.p_player_ids = [...a.player_ids, ...b.player_ids];
        args.p_team_a_name = a.name;
        args.p_team_b_name = b.name;
      }
      if (name === "add_queue_players") {
        let position = Math.max(
          0,
          ...data.queueMembers
            .filter((m) => m.session_id === args.p_session_id)
            .map((m) => m.position),
        );
        for (const id of args.p_player_ids as string[])
          if (
            !data.queueMembers.some(
              (m) => m.session_id === args.p_session_id && m.player_id === id,
            )
          )
            data.queueMembers.push({
              id: crypto.randomUUID(),
              session_id: args.p_session_id,
              player_id: id,
              position: ++position,
              status: "waiting",
              rejoin: true,
            });
        return json(null);
      }
      if (name === "get_public_players") {
        const profiles =
          harness.publicPlayers ??
          data.players.map((p) => ({
            id: p.id,
            name: p.name,
            archived: p.archived,
            wins: 0,
            losses: 0,
            matches: [],
          }));
        return json(
          profiles
            .filter((p) => !args.p_player_id || p.id === args.p_player_id)
            .map((p) => ({ ...p, matches: args.p_player_id ? p.matches : [] })),
        );
      }
      if (name === "register_entry") {
        const entry = {
          id: crypto.randomUUID(),
          tournament_id: args.p_tournament_id,
          name: args.p_name,
          seed:
            data.entries.filter((e) => e.tournament_id === args.p_tournament_id)
              .length + 1,
          player_ids: args.p_player_ids,
        };
        data.entries.push(entry);
        return json(entry.id);
      }
      if (name === "rename_tournament_team") {
        data.entries.find((e) => e.id === args.p_entry_id)!.name = args.p_name;
        return json(null);
      }
      if (name === "rename_queue_teams") {
        const match = data.queueMatches.find((m) => m.id === args.p_match_id)!;
        match.team_a_name = args.p_team_a_name;
        match.team_b_name = args.p_team_b_name;
        return json(null);
      }
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
              scoring_rule: s.scoring_rule ?? "standard_21",
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
                  side_a:
                    m.team_a_name ||
                    data.queueMatchPlayers
                      .filter((p) => p.match_id === m.id && p.side === "a")
                      .map(
                        (p) =>
                          data.players.find((x) => x.id === p.player_id)!.name,
                      )
                      .join(" / "),
                  side_b:
                    m.team_b_name ||
                    data.queueMatchPlayers
                      .filter((p) => p.match_id === m.id && p.side === "b")
                      .map(
                        (p) =>
                          data.players.find((x) => x.id === p.player_id)!.name,
                      )
                      .join(" / "),
                  games: data.games.filter((g) => g.queue_match_id === m.id),
                })),
              ...(s.mode === "bracket"
                ? (() => {
                    const t = data.tournaments.find(
                      (t) => t.queue_session_id === s.id,
                    );
                    const entries = data.entries.filter(
                      (e) => e.tournament_id === t?.id,
                    );
                    const matches = data.tournamentMatches.filter(
                      (m) => m.tournament_id === t?.id,
                    );
                    return {
                      mode: s.mode,
                      bracket_format: s.bracket_format,
                      teams: (data.queueTeams ?? [])
                        .filter((q) => q.session_id === s.id)
                        .map((q) => ({
                          id: q.id,
                          name: q.name,
                          players: q.player_ids.map(
                            (id) => data.players.find((p) => p.id === id)!.name,
                          ),
                        })),
                      bracket: t
                        ? {
                            tournament_id: t.id,
                            format: t.format,
                            champion_entry_id: t.champion_entry_id,
                            entries,
                            matches,
                            games: data.games.filter((g) =>
                              matches.some(
                                (m) => m.id === g.tournament_match_id,
                              ),
                            ),
                          }
                        : null,
                      matches: matches
                        .filter(
                          (m) =>
                            m.status === "playing" || m.status === "completed",
                        )
                        .map((m) => ({
                          ...m,
                          side_a: entries.find((e) => e.id === m.entry_a_id)!
                            .name,
                          side_b: entries.find((e) => e.id === m.entry_b_id)!
                            .name,
                          winner_side: m.winner_entry_id
                            ? m.winner_entry_id === m.entry_a_id
                              ? "a"
                              : "b"
                            : null,
                          games: data.games.filter(
                            (g) => g.tournament_match_id === m.id,
                          ),
                        })),
                    };
                  })()
                : {}),
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
        enqueue(
          data.tournaments.find((t) => t.id === args.p_tournament_id)
            ?.banner_path,
        );
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
        if (harness.blockPurge)
          return json(
            {
              message: "Player has match history. Delete linked events first.",
            },
            400,
          );
        enqueue(
          data.players.find((p) => p.id === args.p_player_id)?.photo_path,
        );
        data.queueMembers = data.queueMembers.filter(
          (m) => m.player_id !== args.p_player_id,
        );
        data.players = data.players.filter((p) => p.id !== args.p_player_id);
        return json(null);
      }
      if (name === "clear_test_data") {
        if (args.p_confirmation !== "DELETE ALL")
          return json({ message: "Confirmation required" }, 400);
        for (const player of data.players) enqueue(player.photo_path);
        for (const t of data.tournaments) enqueue(t.banner_path);
        for (const key of Object.keys(data) as (keyof AppData)[])
          data[key] = [];
        return json(null);
      }
      if (
        name === "start_queue_match" ||
        name === "start_named_queue_match" ||
        name === "start_registered_queue_match"
      ) {
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
          team_a_name: args.p_team_a_name ?? null,
          team_b_name: args.p_team_b_name ?? null,
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
    if (request.method() === "POST" && path.endsWith("/tournaments")) {
      const values = request.postDataJSON();
      const row = {
        id: crypto.randomUUID(),
        created_at: timestamp,
        status: "draft",
        published: false,
        champion_entry_id: null,
        ...values,
      };
      data.tournaments.push(row);
      return json({ id: row.id });
    }
    if (request.method() === "POST" && path.endsWith("/queue_sessions")) {
      const values = request.postDataJSON();
      const row = {
        id: crypto.randomUUID(),
        created_at: timestamp,
        status: "ongoing",
        published: false,
        ...values,
      };
      data.queueSessions.push(row);
      return json({ id: row.id });
    }
    const tables: Record<string, unknown[]> = {
      media_cleanup: harness.mediaJobs ?? [],
      queue_teams: data.queueTeams ?? [],
      queue_team_players: (data.queueTeams ?? []).flatMap((t) =>
        t.player_ids.map((id) => ({
          id: `${t.id}-${id}`,
          session_id: t.session_id,
          team_id: t.id,
          player_id: id,
        })),
      ),
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
      if (filter.startsWith("gt."))
        rows = rows.filter((row) => String(row[column]) > filter.slice(3));
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
    harness.calls.find((call) => call.name === "start_named_queue_match")?.args,
  ).toEqual({
    p_session_id: queueId,
    p_player_ids: [playerId(4), playerId(1), playerId(2), playerId(3)],
    p_court_no: 1,
    p_team_a_name: null,
    p_team_b_name: null,
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
  await expect(
    page.getByText("Game 1 won by Alex, 21–18.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Game 2 is ready at 0–0.", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".score-number")).toHaveText(["0", "0"]);
  await expect(
    page.getByLabel("Game 2, Alex score", { exact: true }),
  ).toHaveValue("0");
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
  await expect(
    page.getByText("Alex has won the match 2–0.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Add point to Alex", exact: true }),
  ).toBeDisabled();
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
  await page.getByRole("link", { name: "Sessions", exact: true }).click();
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

test("a game-winning live point saves the next game at zero and survives reload", async ({
  page,
}) => {
  const data = fixture();
  data.tournamentMatches[0].status = "playing";
  data.tournamentMatches[0].court_no = 1;
  data.games = [
    {
      id: crypto.randomUUID(),
      tournament_match_id: tournamentMatchId,
      queue_match_id: null,
      game_no: 1,
      score_a: 20,
      score_b: 19,
    },
  ];
  const harness: Harness = { data, calls: [] };
  await mockSupabase(page, harness);
  await page.goto(`/matches/${tournamentMatchId}`);
  await page
    .getByRole("button", { name: "Add point to Alex", exact: true })
    .click();
  await expect(
    page.getByText("Game 1 won by Alex, 21–19.", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".score-number")).toHaveText(["0", "0"]);
  expect(harness.calls.at(-1)?.args.p_games).toEqual([
    { game_no: 1, score_a: 21, score_b: 19 },
    { game_no: 2, score_a: 0, score_b: 0 },
  ]);
  await page.reload();
  await expect(
    page.getByText("Game 2 is ready at 0–0.", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".score-number")).toHaveText(["0", "0"]);
  await page
    .getByRole("button", { name: "Add point to Blair", exact: true })
    .click();
  await expect(page.locator(".score-number")).toHaveText(["0", "1"]);
  expect(harness.data.games.map((g) => [g.score_a, g.score_b])).toEqual([
    [21, 19],
    [0, 1],
  ]);
});

test("legacy saved game wins open the next game at zero and invalid 31-point input explains the cap", async ({
  page,
}) => {
  const data = fixture();
  data.tournamentMatches[0].status = "playing";
  data.tournamentMatches[0].court_no = 1;
  data.games = [
    {
      id: crypto.randomUUID(),
      tournament_match_id: tournamentMatchId,
      queue_match_id: null,
      game_no: 1,
      score_a: 21,
      score_b: 23,
    },
  ];
  const harness: Harness = { data, calls: [] };
  await mockSupabase(page, harness);
  await page.goto(`/matches/${tournamentMatchId}`);
  await expect(
    page.getByText("Game 1 won by Blair, 21–23.", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".score-number")).toHaveText(["0", "0"]);
  expect(harness.calls).toHaveLength(0);
  await page
    .getByRole("button", { name: "Quick score entry", exact: true })
    .click();
  await page.getByLabel("Game 2, Alex score", { exact: true }).fill("31");
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Standard 21-point games are capped at 30" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save live score", exact: true }),
  ).toBeDisabled();
});

test("mixed session accepts team names and displays them on the scoreboard and public court view", async ({
  page,
}) => {
  const data = fixture();
  data.queueSessions[0].play_type = "mixed";
  data.queueSessions[0].published = true;
  const harness: Harness = { data, calls: [] };
  await mockSupabase(page, harness);
  await page.goto(`/queue/${queueId}`);
  await expect(
    page.getByRole("combobox", { name: "Side B · Player 2", exact: true }),
  ).toHaveValue(playerId(3));
  await page
    .getByLabel("Team A name (optional)", { exact: true })
    .fill("Shuttle Kings");
  await page
    .getByLabel("Team B name (optional)", { exact: true })
    .fill("Net Ninjas");
  await page
    .getByRole("button", { name: "Call players & start match", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Shuttle Kings vs Net Ninjas",
      exact: true,
    }),
  ).toBeVisible();
  expect(
    harness.calls.find((c) => c.name === "start_named_queue_match")?.args,
  ).toMatchObject({
    p_team_a_name: "Shuttle Kings",
    p_team_b_name: "Net Ninjas",
    p_player_ids: [playerId(0), playerId(1), playerId(2), playerId(3)],
  });
  await page
    .getByRole("button", { name: "Edit team names", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("Team A name", { exact: true })
    .fill("Mixed Masters");
  await page
    .getByRole("button", { name: "Save team names", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Mixed Masters vs Net Ninjas",
      exact: true,
    }),
  ).toBeVisible();
  await page.goto(`/public/sessions/${queueId}`);
  await expect(page.getByText("Mixed Masters", { exact: true })).toBeVisible();
});

test("mixed tournament registers and renames a named team with two members", async ({
  page,
}) => {
  const data = fixture();
  data.tournaments[0].play_type = "mixed";
  data.tournaments[0].status = "draft";
  data.entries = [];
  data.tournamentMatches = [];
  const harness: Harness = { data, calls: [] };
  await mockSupabase(page, harness);
  await page.goto(`/tournaments/${tournamentId}`);
  await page.getByRole("button", { name: "Add team", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Register a mixed doubles team",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("dialog").getByLabel("Alex", { exact: true }).check();
  await page.getByRole("dialog").getByLabel("Blair", { exact: true }).check();
  await page
    .getByLabel("Team name (optional)", { exact: true })
    .fill("Mixed Champions");
  await page
    .getByRole("button", { name: "Register team", exact: true })
    .click();
  await expect(
    page.getByText("Mixed Champions", { exact: true }),
  ).toBeVisible();
  expect(
    harness.calls.find((c) => c.name === "register_entry")?.args,
  ).toMatchObject({
    p_name: "Mixed Champions",
    p_player_ids: [playerId(0), playerId(1)],
  });
  await page
    .getByRole("button", { name: "Rename Mixed Champions", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("Team name", { exact: true })
    .fill("New Champions");
  await page
    .getByRole("button", { name: "Save team name", exact: true })
    .click();
  await expect(page.getByText("New Champions", { exact: true })).toBeVisible();
});

test("public player directory and individual history display wins, losses and team names without login", async ({
  page,
}) => {
  const data = fixture();
  const publicPlayers: PublicPlayer[] = [
    {
      id: playerId(0),
      name: "Alex",
      archived: false,
      wins: 1,
      losses: 1,
      matches: [
        {
          id: tournamentMatchId,
          event_id: tournamentId,
          event_name: "Mixed cup",
          kind: "tournament",
          play_type: "mixed",
          completed_at: timestamp,
          court_no: 1,
          walkover: false,
          side_a: "Shuttle Kings",
          side_b: "Net Ninjas",
          players_a: ["Alex", "Blair"],
          players_b: ["Casey", "Drew"],
          result: "win",
          games: [{ game_no: 1, score_a: 21, score_b: 18 }],
        },
        {
          id: queueMatchId,
          event_id: queueId,
          event_name: "Friday doubles",
          kind: "queue",
          play_type: "doubles",
          completed_at: timestamp,
          court_no: 2,
          walkover: true,
          side_a: "Shuttle Kings",
          side_b: "Court Crew",
          players_a: ["Alex", "Blair"],
          players_b: ["Casey", "Drew"],
          result: "loss",
          games: [],
        },
      ],
    },
    {
      id: playerId(1),
      name: "Blair",
      archived: false,
      wins: 0,
      losses: 0,
      matches: [],
    },
  ];
  const harness: Harness = { data, calls: [], publicPlayers };
  await mockSupabase(page, harness, false);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page
    .getByRole("navigation", { name: "Public navigation" })
    .getByRole("link", { name: "Players", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Players", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Admin login", exact: true }),
  ).toBeVisible();
  const alex = page
    .getByRole("link")
    .filter({ has: page.getByRole("heading", { name: "Alex", exact: true }) });
  await expect(alex.locator(".public-player-record strong")).toHaveText([
    "1",
    "1",
    "2",
    "50%",
  ]);
  await alex.click();
  await expect(
    page.getByRole("heading", { name: "Match history", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Mixed cup", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Friday doubles", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Wins", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Friday doubles", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText("21–18", { exact: false })).toBeVisible();
  await page.screenshot({
    path: "test-results/flows/public-player-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Losses", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Friday doubles", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Mixed cup", exact: true }),
  ).toHaveCount(0);
});

test("new sessions and tournaments save the selected scoring rules", async ({
  page,
}) => {
  const harness: Harness = { data: fixture(), calls: [] };
  await mockSupabase(page, harness);
  await page.goto("/queue?new=1");
  await expect(
    page.getByRole("combobox", { name: "Scoring rules", exact: true }),
  ).toHaveValue("standard_21");
  await page
    .getByLabel("Session name", { exact: true })
    .fill("Lenient club night");
  await page
    .getByRole("combobox", { name: "Scoring rules", exact: true })
    .selectOption("lenient_31");
  await expect(
    page.getByText(
      "The first side to 31 wins, even at 31–30. Scores such as 31–1 are allowed. No two-point lead required.",
      { exact: true },
    ),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Create session", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Lenient club night", exact: true }),
  ).toBeVisible();
  expect(
    harness.data.queueSessions.find((s) => s.name === "Lenient club night")
      ?.scoring_rule,
  ).toBe("lenient_31");
  await page.goto("/tournaments/new");
  await expect(
    page.getByRole("combobox", { name: "Scoring rules", exact: true }),
  ).toHaveValue("standard_21");
  await page
    .getByLabel("Tournament name", { exact: true })
    .fill("Lenient tournament");
  await page
    .getByRole("combobox", { name: "Scoring rules", exact: true })
    .selectOption("lenient_31");
  await page
    .getByRole("button", { name: "Create tournament", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Lenient tournament", exact: true }),
  ).toBeVisible();
  expect(
    harness.data.tournaments.find((t) => t.name === "Lenient tournament")
      ?.scoring_rule,
  ).toBe("lenient_31");
});

test("lenient scoreboard continues beyond 21, resets at 31, and finalizes a 31–30 result", async ({
  page,
}) => {
  const data = fixture();
  data.tournaments[0].scoring_rule = "lenient_31";
  data.tournamentMatches[0].status = "playing";
  data.tournamentMatches[0].court_no = 1;
  data.games = [
    {
      id: crypto.randomUUID(),
      tournament_match_id: tournamentMatchId,
      queue_match_id: null,
      game_no: 1,
      score_a: 30,
      score_b: 1,
    },
  ];
  const harness: Harness = { data, calls: [] };
  await mockSupabase(page, harness);
  await page.goto(`/matches/${tournamentMatchId}`);
  await expect(
    page.getByText("Best of 3 games · Lenient · First to 31 · No deuce", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator(".score-number")).toHaveText(["30", "1"]);
  await page
    .getByRole("button", { name: "Add point to Alex", exact: true })
    .click();
  await expect(
    page.getByText("Game 1 won by Alex, 31–1.", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".score-number")).toHaveText(["0", "0"]);
  await page
    .getByRole("button", { name: "Quick score entry", exact: true })
    .click();
  await page.getByLabel("Game 2, Alex score", { exact: true }).fill("31");
  await page.getByLabel("Game 2, Blair score", { exact: true }).fill("30");
  await page
    .getByRole("button", { name: "Save live score", exact: true })
    .click();
  await expect(
    page.getByText("Alex has won the match 2–0.", { exact: true }),
  ).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Finalize match", exact: true })
    .click();
  await expect(page.getByText("Alex wins", { exact: true })).toBeVisible();
  expect(harness.data.games.map((g) => [g.score_a, g.score_b])).toEqual([
    [31, 1],
    [31, 30],
  ]);
  await page.reload();
  await expect(page.getByText("Alex wins", { exact: true })).toBeVisible();
});

test("searchable queue picker preserves selections across searches and adds many players at once", async ({
  page,
}) => {
  const data = fixture();
  data.queueMembers = [];
  for (let i = 0; i < 40; i++)
    data.players.push({
      id: crypto.randomUUID(),
      organizer_id: uid,
      name: `Guest ${String(i + 1).padStart(2, "0")}`,
      photo_path: null,
      archived: false,
      created_at: timestamp,
    });
  const harness: Harness = { data, calls: [] };
  await mockSupabase(page, harness);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/queue/${queueId}`);
  const picker = page.getByRole("combobox", {
    name: "Players to add to queue",
    exact: true,
  });
  await picker.fill("Guest");
  await expect(
    page.getByRole("option", { name: "Guest 01", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Select all matches", exact: true })
    .click();
  await expect(
    page.getByText("40 players selected", { exact: true }),
  ).toBeVisible();
  await picker.fill("Alex");
  await page.getByRole("option", { name: "Alex", exact: true }).click();
  await expect(
    page.getByText("41 players selected", { exact: true }),
  ).toBeVisible();
  await picker.fill("Guest 01");
  await expect(
    page.getByRole("option", { name: "Guest 01", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page
    .getByRole("button", { name: "Clear selection", exact: true })
    .click();
  await picker.fill("");
  await page.getByRole("button", { name: "Select all", exact: true }).click();
  await expect(
    page.getByText("46 players selected", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Add 46 players", exact: true })
    .click();
  await expect(page.getByText("46 players", { exact: true })).toBeVisible();
  expect(
    harness.calls.find((c) => c.name === "add_queue_players")?.args
      .p_player_ids,
  ).toHaveLength(46);
  expect(new Set(harness.data.queueMembers.map((m) => m.player_id)).size).toBe(
    46,
  );
  await expect(picker).toBeDisabled();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("queue picker supports keyboard selection, deselection and no-result feedback", async ({
  page,
}) => {
  const data = fixture();
  data.queueMembers = [];
  const harness: Harness = { data, calls: [] };
  await mockSupabase(page, harness);
  await page.goto(`/queue/${queueId}`);
  const picker = page.getByRole("combobox", {
    name: "Players to add to queue",
    exact: true,
  });
  await picker.fill("Blair");
  await picker.press("ArrowDown");
  await picker.press("Enter");
  await expect(
    page.getByText("1 player selected", { exact: true }),
  ).toBeVisible();
  await picker.press("Escape");
  await expect(picker).toHaveAttribute("aria-expanded", "false");
  await page
    .getByRole("button", { name: "Deselect Blair", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Add players", exact: true }),
  ).toBeDisabled();
  await picker.fill("Nobody matches");
  await expect(
    page.getByText("No players match your search.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Select all matches", exact: true }),
  ).toBeDisabled();
});

test("normal doubles session registers fixed teams and lets the admin choose a matchup", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const data = fixture();
  const harness: Harness = { data, calls: [] };
  await mockSupabase(page, harness);
  await page.goto(`/queue/${queueId}`);
  for (const [name, players] of [
    ["Shuttle Kings", ["Alex", "Blair"]],
    ["Net Ninjas", ["Casey", "Drew"]],
  ] as const) {
    await page.getByRole("button", { name: "Add team", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Team name", { exact: true }).fill(name);
    const search = dialog.getByRole("combobox", {
      name: "Players for session team",
      exact: true,
    });
    for (const player of players) {
      await search.fill(player);
      await dialog.getByRole("option", { name: player, exact: true }).click();
    }
    await search.press("Escape");
    await dialog
      .getByRole("button", { name: "Register team", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }
  await page
    .getByRole("combobox", { name: "Team A", exact: true })
    .selectOption({ label: "Shuttle Kings" });
  await page
    .getByRole("combobox", { name: "Team B", exact: true })
    .selectOption({ label: "Net Ninjas" });
  await page
    .getByRole("button", { name: "Start team match", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Shuttle Kings vs Net Ninjas",
      exact: true,
    }),
  ).toBeVisible();
  expect(
    harness.calls.some((c) => c.name === "start_registered_queue_match"),
  ).toBe(true);
});

test("bracket session generates a random draw, assigns courts and provides a public read-only bracket", async ({
  page,
}) => {
  const data = fixture();
  data.queueSessions[0].mode = "bracket";
  data.queueSessions[0].bracket_format = "single_elimination";
  data.queueSessions[0].published = true;
  for (let i = 6; i < 8; i++)
    data.players.push({
      id: playerId(i),
      organizer_id: uid,
      name: `Extra ${i}`,
      photo_path: null,
      archived: false,
      created_at: timestamp,
    });
  data.queueTeams = Array.from({ length: 4 }, (_, i) => ({
    id: crypto.randomUUID(),
    session_id: queueId,
    name: `Registered team ${i + 1}`,
    position: i + 1,
    player_ids: [playerId(i * 2), playerId(i * 2 + 1)],
  }));
  const harness: Harness = { data, calls: [] };
  await mockSupabase(page, harness);
  await page.goto(`/queue/${queueId}`);
  await expect(
    page.getByRole("checkbox", { name: "Randomize the bracket", exact: true }),
  ).toBeChecked();
  await page
    .getByRole("button", {
      name: "Generate bracket & fill courts",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("heading", { name: "Session bracket", exact: true }),
  ).toBeVisible();
  expect(
    new Set(
      harness.calls.find((c) => c.name === "generate_queue_bracket")?.args
        .p_team_order,
    ),
  ).toEqual(new Set(data.queueTeams.map((t) => t.id)));
  expect(
    data.tournamentMatches.filter((m) => m.status === "playing"),
  ).toHaveLength(2);
  await expect(page.locator(".court-card.occupied")).toHaveCount(2);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/flows/queue-session-bracket.png",
    fullPage: true,
  });
  await page.goto(`/public/sessions/${queueId}`);
  await expect(page.locator(".bracket-match")).toHaveCount(3);
  await expect(page.locator('a[href^="/matches/"]')).toHaveCount(0);
  await page.goto("/tournaments");
  await expect(
    page.getByRole("heading", { name: "Friday doubles", exact: true }),
  ).toHaveCount(0);
});

test("new sessions can choose bracket mode and double elimination", async ({
  page,
}) => {
  const harness: Harness = { data: fixture(), calls: [] };
  await mockSupabase(page, harness);
  await page.goto("/queue?new=1");
  await page.getByLabel("Session name", { exact: true }).fill("Bracket night");
  await page
    .getByRole("combobox", { name: "Session mode", exact: true })
    .selectOption("bracket");
  await page
    .getByRole("combobox", { name: "Bracket format", exact: true })
    .selectOption("double_elimination");
  await page
    .getByRole("button", { name: "Create session", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Bracket night", exact: true }),
  ).toBeVisible();
  const session = harness.data.queueSessions.find(
    (s) => s.name === "Bracket night",
  );
  expect(session).toMatchObject({
    mode: "bracket",
    bracket_format: "double_elimination",
  });
});

test("permanent player deletion removes the photo through Storage only after the record deletion succeeds", async ({
  page,
}) => {
  const data = fixture();
  const photo = `${uid}/casey.jpg`,
    keep = `${uid}/alex.jpg`;
  data.players[2].photo_path = photo;
  data.players[0].photo_path = keep;
  const old = new Date(Date.now() - 3600000).toISOString();
  const harness: Harness = {
    data,
    calls: [],
    blockPurge: true,
    mediaFiles: [
      { path: photo, created_at: old },
      { path: keep, created_at: old },
    ],
  };
  await mockSupabase(page, harness);
  await page.goto("/players");
  await page.getByRole("button", { name: "Delete Casey", exact: true }).click();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Player has match history",
  );
  expect(harness.storageRemoved ?? []).toEqual([]);
  expect(harness.mediaJobs ?? []).toEqual([]);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  harness.blockPurge = false;
  await page.getByRole("button", { name: "Delete Casey", exact: true }).click();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Casey", exact: true }),
  ).toHaveCount(0);
  expect(harness.storageRemoved).toEqual([photo]);
  expect(harness.mediaJobs).toEqual([]);
  expect(harness.mediaFiles?.map((f) => f.path)).toEqual([keep]);
});

test("failed photo deletion is retained for retry and cleanup removes old orphans while preserving active and recent images", async ({
  page,
}) => {
  const data = fixture();
  const photo = `${uid}/casey.jpg`,
    keep = `${uid}/alex.jpg`,
    orphan = `${uid}/orphan.jpg`,
    recent = `${uid}/uploading.png`,
    outside = "another-owner/private.jpg";
  data.players[2].photo_path = photo;
  data.players[0].photo_path = keep;
  const old = new Date(Date.now() - 3600000).toISOString(),
    now = new Date().toISOString();
  const harness: Harness = {
    data,
    calls: [],
    storageFail: true,
    mediaFiles: [
      { path: photo, created_at: now },
      { path: keep, created_at: old },
      { path: orphan, created_at: old },
      { path: recent, created_at: now },
      { path: outside, created_at: old },
    ],
  };
  await mockSupabase(page, harness);
  await page.goto("/players");
  await page.getByRole("button", { name: "Delete Casey", exact: true }).click();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Casey", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("alert")).toContainText(
    "Image cleanup is pending",
  );
  expect(harness.mediaJobs?.map((j) => j.path)).toEqual([photo]);
  harness.storageFail = false;
  await page.goto("/settings");
  await page
    .getByRole("button", { name: "Clean unused images", exact: true })
    .click();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page.getByRole("status")).toContainText(
    "Image cleanup finished.",
  );
  expect(new Set(harness.storageRemoved)).toEqual(new Set([photo, orphan]));
  expect(new Set(harness.mediaFiles?.map((f) => f.path))).toEqual(
    new Set([keep, recent, outside]),
  );
  expect(harness.mediaJobs).toEqual([]);
});

test("replacing a player photo removes the previous image after the new photo saves", async ({
  page,
}) => {
  const data = fixture();
  const photo = `${uid}/old-photo.jpg`;
  data.players[2].photo_path = photo;
  const harness: Harness = {
    data,
    calls: [],
    mediaFiles: [
      { path: photo, created_at: new Date(Date.now() - 3600000).toISOString() },
    ],
  };
  await mockSupabase(page, harness);
  await page.goto("/players");
  await page.getByRole("button", { name: "Edit Casey", exact: true }).click();
  await page
    .getByRole("dialog")
    .locator("input[type=file]")
    .setInputFiles({
      name: "replacement.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aK0sAAAAASUVORK5CYII=",
        "base64",
      ),
    });
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(data.players[2].photo_path).not.toBe(photo);
  expect(harness.mediaFiles?.map((f) => f.path)).toEqual([
    data.players[2].photo_path,
  ]);
  expect(harness.storageRemoved).toEqual([photo]);
});

test("failed player updates discard the new upload and preserve the original photo", async ({
  page,
}) => {
  const data = fixture();
  const photo = `${uid}/keep-original.jpg`;
  data.players[2].photo_path = photo;
  const harness: Harness = {
    data,
    calls: [],
    failPlayerSave: true,
    mediaFiles: [
      { path: photo, created_at: new Date(Date.now() - 3600000).toISOString() },
    ],
  };
  await mockSupabase(page, harness);
  await page.goto("/players");
  await page.getByRole("button", { name: "Edit Casey", exact: true }).click();
  await page
    .getByRole("dialog")
    .locator("input[type=file]")
    .setInputFiles({
      name: "replacement.png",
      mimeType: "image/png",
      buffer: Buffer.from("fixture image"),
    });
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Player save failed");
  expect(data.players[2].photo_path).toBe(photo);
  expect(harness.mediaFiles?.map((f) => f.path)).toEqual([photo]);
  expect(harness.storageRemoved).toHaveLength(1);
  expect(harness.storageRemoved?.[0]).not.toBe(photo);
});

test("a shared photo is kept until its last player reference is deleted", async ({
  page,
}) => {
  const data = fixture();
  const photo = `${uid}/shared.jpg`;
  data.players[2].photo_path = photo;
  data.players[4].photo_path = photo;
  const harness: Harness = {
    data,
    calls: [],
    mediaFiles: [
      { path: photo, created_at: new Date(Date.now() - 3600000).toISOString() },
    ],
  };
  await mockSupabase(page, harness);
  await page.goto("/players");
  await page.getByRole("button", { name: "Delete Casey", exact: true }).click();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Casey", exact: true }),
  ).toHaveCount(0);
  expect(harness.storageRemoved ?? []).toHaveLength(0);
  expect(harness.mediaJobs).toHaveLength(1);
  await page.getByRole("button", { name: "Delete Ellis", exact: true }).click();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Ellis", exact: true }),
  ).toHaveCount(0);
  expect(harness.storageRemoved).toEqual([photo]);
  expect(harness.mediaJobs).toEqual([]);
});

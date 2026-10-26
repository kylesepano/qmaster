import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { generateBracket } from "../src/utilities/brackets";

let db: PGlite;
const owner = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const ids = Array.from(
  { length: 12 },
  (_, i) => `33333333-3333-4333-8333-${String(i + 1).padStart(12, "0")}`,
);
async function auth(user: string | null, role = "authenticated") {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    user ?? "",
  ]);
  await db.exec(`set role ${role}`);
}
async function tournament(format = "single_elimination", n = 4, bestOf = 1) {
  const r = await db.query<{ id: string }>(
    "insert into tournaments(organizer_id,name,event_date,play_type,court_count,best_of,format) values($1,'Integration Open','2026-10-26','singles',3,$2,$3) returning id",
    [owner, bestOf, format],
  );
  const tid = r.rows[0].id;
  const entries: string[] = [];
  for (let i = 0; i < n; i++) {
    const e = await db.query<{ id: string }>(
      "select register_entry($1,$2,$3::uuid[]) as id",
      [tid, `Player ${i + 1}`, [ids[i]]],
    );
    entries.push(e.rows[0].id);
  }
  await db.query("select generate_bracket($1,$2::jsonb)", [
    tid,
    JSON.stringify(generateBracket(entries, format as "single_elimination")),
  ]);
  await db.query("select start_tournament($1)", [tid]);
  return { tid, entries };
}
async function finish(mid: string, winner: "a" | "b" = "a", court = 1) {
  await db.query("select assign_tournament_court($1,$2)", [mid, court]);
  const r = await db.query<{ version: number }>(
    "select version from tournament_matches where id=$1",
    [mid],
  );
  await db.query(
    "select save_match_score($1,'tournament',$2::jsonb,$3,true,null)",
    [
      mid,
      JSON.stringify([
        {
          game_no: 1,
          score_a: winner === "a" ? 21 : 15,
          score_b: winner === "b" ? 21 : 15,
        },
      ]),
      r.rows[0].version,
    ],
  );
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon;
    create role authenticated;
    create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to anon,authenticated;
    grant execute on function auth.uid() to anon,authenticated;
    create schema storage;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
    alter table storage.objects enable row level security;
    create function storage.foldername(text) returns text[] language sql immutable as $$ select string_to_array($1,'/') $$;
    grant usage on schema storage to authenticated;
    grant all on storage.objects to authenticated;
    grant execute on function storage.foldername(text) to authenticated;
  `);
  const migration = readFileSync(
    new URL("../supabase/migrations/202610260001_qmaster.sql", import.meta.url),
    "utf8",
  );
  try {
    await db.exec(migration);
  } catch (error) {
    const e = error as {
      position?: string;
      internalPosition?: string;
      internalQuery?: string;
      message?: string;
    };
    const pos = Number(e.position);
    throw new Error(
      `${e.message} at ${pos}: ${migration.slice(Math.max(0, pos - 180), pos + 100)}; internal ${e.internalPosition}: ${e.internalQuery}`,
    );
  }
  await db.query("insert into auth.users(id) values($1),($2)", [owner, other]);
  await auth(owner);
  for (let i = 0; i < ids.length; i++)
    await db.query(
      "insert into players(id,organizer_id,name) values($1,$2,$3)",
      [ids[i], owner, `Player ${i + 1}`],
    );
}, 30000);
afterAll(async () => {
  await db?.close();
});

describe("Supabase SQL transactions and policies (PGlite)", () => {
  it("keeps players private and prevents another organizer or anonymous caller from writing", async () => {
    await auth(other);
    expect((await db.query("select * from players")).rows).toHaveLength(0);
    await expect(
      db.query("insert into players(organizer_id,name) values($1,'Intruder')", [
        owner,
      ]),
    ).rejects.toThrow();
    await auth(null, "anon");
    await expect(
      db.query("select register_entry($1,'Intruder',$2::uuid[])", [
        crypto.randomUUID(),
        [ids[0]],
      ]),
    ).rejects.toThrow();
    await auth(owner);
  });

  it("enforces complete singles/doubles registrations and no duplicate participants", async () => {
    const q = await db.query<{ id: string }>(
      "insert into tournaments(organizer_id,name,event_date,play_type,court_count,best_of,format) values($1,'Doubles','2026-10-26','doubles',2,1,'single_elimination') returning id",
      [owner],
    );
    const tid = q.rows[0].id;
    await expect(
      db.query("select register_entry($1,'Bad team',$2::uuid[])", [
        tid,
        [ids[0]],
      ]),
    ).rejects.toThrow();
    await db.query("select register_entry($1,'Team one',$2::uuid[])", [
      tid,
      [ids[0], ids[1]],
    ]);
    await expect(
      db.query("select register_entry($1,'Duplicate',$2::uuid[])", [
        tid,
        [ids[1], ids[2]],
      ]),
    ).rejects.toThrow();
  });

  it("persists six-entry BYEs, advances winners and exposes only a published bracket", async () => {
    const { tid } = await tournament("single_elimination", 6);
    expect(
      (
        await db.query(
          "select * from tournament_matches where tournament_id=$1 and status='bye'",
          [tid],
        )
      ).rows,
    ).toHaveLength(2);
    while (true) {
      const r = await db.query<{ id: string }>(
        "select id from tournament_matches where tournament_id=$1 and status='ready' order by round_no,position limit 1",
        [tid],
      );
      if (!r.rows.length) break;
      await finish(r.rows[0].id);
    }
    const t = await db.query<{ status: string; champion_entry_id: string }>(
      "select status,champion_entry_id from tournaments where id=$1",
      [tid],
    );
    expect(t.rows[0].status).toBe("completed");
    expect(t.rows[0].champion_entry_id).toBeTruthy();
    await auth(null, "anon");
    expect(
      (await db.query("select * from tournaments where id=$1", [tid])).rows,
    ).toHaveLength(0);
    await auth(owner);
    await db.query("select publish_tournament($1,true)", [tid]);
    await auth(null, "anon");
    expect(
      (await db.query("select * from tournaments where id=$1", [tid])).rows,
    ).toHaveLength(1);
    expect(
      (
        await db.query(
          "select * from tournament_matches where tournament_id=$1",
          [tid],
        )
      ).rows,
    ).toHaveLength(7);
    await expect(db.query("select * from players")).rejects.toThrow();
    await auth(owner);
  });

  it("supports ten-entry double elimination with an actual grand-final reset", async () => {
    const { tid } = await tournament("double_elimination", 10);
    let matches = 0;
    while (true) {
      const r = await db.query<{ id: string; bracket: string }>(
        "select id,bracket from tournament_matches where tournament_id=$1 and status='ready' order by case bracket when 'upper' then 0 when 'lower' then 1 when 'final' then 2 else 3 end,round_no,position limit 1",
        [tid],
      );
      if (!r.rows.length) break;
      await finish(r.rows[0].id, r.rows[0].bracket === "final" ? "b" : "a");
      if (++matches > 50) throw new Error("Resolution did not terminate");
    }
    expect(
      (
        await db.query<{ status: string }>(
          "select status from tournaments where id=$1",
          [tid],
        )
      ).rows[0].status,
    ).toBe("completed");
    expect(
      (
        await db.query<{ status: string }>(
          "select status from tournament_matches where tournament_id=$1 and bracket='reset'",
          [tid],
        )
      ).rows[0].status,
    ).toBe("completed");
    expect(matches).toBe(19);
  });

  it("skips the reset when the undefeated finalist wins", async () => {
    const { tid } = await tournament("double_elimination", 2);
    for (let i = 0; i < 2; i++) {
      const r = await db.query<{ id: string }>(
        "select id from tournament_matches where tournament_id=$1 and status='ready'",
        [tid],
      );
      await finish(r.rows[0].id);
    }
    expect(
      (
        await db.query<{ status: string }>(
          "select status from tournament_matches where tournament_id=$1 and bracket='reset'",
          [tid],
        )
      ).rows[0].status,
    ).toBe("skipped");
  });

  it("completes round robin and ranks the champion by actual wins", async () => {
    const { tid } = await tournament("round_robin", 4);
    const r = await db.query<{ id: string }>(
      "select id from tournament_matches where tournament_id=$1 order by round_no,position",
      [tid],
    );
    expect(r.rows).toHaveLength(6);
    for (const m of r.rows) await finish(m.id);
    expect(
      (
        await db.query<{ status: string }>(
          "select status from tournaments where id=$1",
          [tid],
        )
      ).rows[0].status,
    ).toBe("completed");
  });

  it("rejects impossible scores, stale scores and unsafe corrections to an advanced winner", async () => {
    const { tid } = await tournament();
    const ready = await db.query<{ id: string }>(
      "select id from tournament_matches where tournament_id=$1 and status='ready' order by position",
      [tid],
    );
    const mid = ready.rows[0].id;
    await db.query("select assign_tournament_court($1,1)", [mid]);
    await expect(
      db.query(
        "select save_match_score($1,'tournament','[]'::jsonb,null,false,null)",
        [mid],
      ),
    ).rejects.toThrow(/another device/);
    await expect(
      db.query(
        "select save_match_score($1,'tournament','[]'::jsonb,1,null,null)",
        [mid],
      ),
    ).rejects.toThrow(/save or finalize/);
    await expect(
      db.query(
        "select save_match_score($1,'tournament',$2::jsonb,1,true,'a')",
        [mid, JSON.stringify([{ game_no: 1, score_a: 5, score_b: 2 }])],
      ),
    ).rejects.toThrow(/no game scores/);
    await expect(
      db.query(
        "select save_match_score($1,'tournament',$2::jsonb,1,true,null)",
        [mid, JSON.stringify([{ game_no: 1, score_a: 30, score_b: 0 }])],
      ),
    ).rejects.toThrow();
    await db.query(
      "select save_match_score($1,'tournament',$2::jsonb,1,true,null)",
      [mid, JSON.stringify([{ game_no: 1, score_a: 21, score_b: 0 }])],
    );
    await expect(
      db.query(
        "select save_match_score($1,'tournament',$2::jsonb,1,true,null)",
        [mid, JSON.stringify([{ game_no: 1, score_a: 21, score_b: 1 }])],
      ),
    ).rejects.toThrow();
    await finish(ready.rows[1].id);
    const final = await db.query<{ id: string }>(
      "select id from tournament_matches where tournament_id=$1 and bracket='final'",
      [tid],
    );
    await db.query("select assign_tournament_court($1,1)", [final.rows[0].id]);
    await expect(
      db.query(
        "select save_match_score($1,'tournament',$2::jsonb,2,true,null)",
        [mid, JSON.stringify([{ game_no: 1, score_a: 0, score_b: 21 }])],
      ),
    ).rejects.toThrow(/later match/);
    // Score correction retaining the winner does not corrupt the later matchup.
    await db.query(
      "select save_match_score($1,'tournament',$2::jsonb,2,true,null)",
      [mid, JSON.stringify([{ game_no: 1, score_a: 21, score_b: 4 }])],
    );
    await db.query(
      "select save_match_score($1,'tournament','[]'::jsonb,1,true,'a')",
      [final.rows[0].id],
    );
  });

  it("prevents occupied courts and cross-session double booking; requeues exactly once", async () => {
    const s = await db.query<{ id: string }>(
      "insert into queue_sessions(organizer_id,name,play_type,court_count,best_of) values($1,'Morning','singles',2,1),($1,'Evening','singles',2,1) returning id",
      [owner],
    );
    const [s1, s2] = s.rows.map((x) => x.id);
    await db.query("select add_queue_players($1,$2::uuid[])", [
      s1,
      ids.slice(0, 4),
    ]);
    await db.query("select add_queue_players($1,$2::uuid[])", [
      s2,
      ids.slice(0, 4),
    ]);
    const m = await db.query<{ id: string }>(
      "select start_queue_match($1,$2::uuid[],1) as id",
      [s1, ids.slice(0, 2)],
    );
    await expect(
      db.query("select start_queue_match($1,$2::uuid[],1)", [
        s1,
        ids.slice(2, 4),
      ]),
    ).rejects.toThrow(/occupied/);
    await expect(
      db.query("select start_queue_match($1,$2::uuid[],2)", [
        s2,
        ids.slice(0, 2),
      ]),
    ).rejects.toThrow(/already playing/);
    await db.query(
      "select save_match_score($1,'queue',$2::jsonb,0,true,null)",
      [
        m.rows[0].id,
        JSON.stringify([{ game_no: 1, score_a: 21, score_b: 15 }]),
      ],
    );
    const members = await db.query<{ player_id: string; position: number }>(
      "select player_id,position from queue_members where session_id=$1 order by position",
      [s1],
    );
    expect(members.rows.map((x) => x.player_id)).toEqual([
      ids[2],
      ids[3],
      ids[0],
      ids[1],
    ]);
    await db.query(
      "select save_match_score($1,'queue',$2::jsonb,1,true,null)",
      [
        m.rows[0].id,
        JSON.stringify([{ game_no: 1, score_a: 21, score_b: 19 }]),
      ],
    );
    expect(
      (
        await db.query(
          "select player_id,position from queue_members where session_id=$1 order by position",
          [s1],
        )
      ).rows,
    ).toEqual(members.rows);
    await db.query("select end_queue_session($1)", [s1]);
    await db.query("select end_queue_session($1)", [s2]);
  });

  it("corrects a winner before the next match starts while preserving seeded BYEs", async () => {
    const { tid } = await tournament("single_elimination", 6);
    const first = (
      await db.query<{ id: string; entry_a_id: string; entry_b_id: string }>(
        "select id,entry_a_id,entry_b_id from tournament_matches where tournament_id=$1 and status='ready' order by round_no,position limit 1",
        [tid],
      )
    ).rows[0];
    await finish(first.id, "a");
    const childBefore = (
      await db.query<{
        id: string;
        entry_a_id: string;
        entry_b_id: string;
        status: string;
      }>(
        "select id,entry_a_id,entry_b_id,status from tournament_matches where source_a_match_id=$1 or source_b_match_id=$1",
        [first.id],
      )
    ).rows[0];
    expect(childBefore.status).toBe("ready");
    expect([childBefore.entry_a_id, childBefore.entry_b_id]).toContain(
      first.entry_a_id,
    );
    await db.query(
      "select save_match_score($1,'tournament',$2::jsonb,2,true,null)",
      [first.id, JSON.stringify([{ game_no: 1, score_a: 15, score_b: 21 }])],
    );
    const childAfter = (
      await db.query<{
        entry_a_id: string;
        entry_b_id: string;
        status: string;
      }>(
        "select entry_a_id,entry_b_id,status from tournament_matches where id=$1",
        [childBefore.id],
      )
    ).rows[0];
    expect(childAfter.status).toBe("ready");
    expect([childAfter.entry_a_id, childAfter.entry_b_id]).toContain(
      first.entry_b_id,
    );
    expect([childAfter.entry_a_id, childAfter.entry_b_id]).not.toContain(
      first.entry_a_id,
    );
    expect(
      (
        await db.query(
          "select id from tournament_matches where tournament_id=$1 and status='bye'",
          [tid],
        )
      ).rows,
    ).toHaveLength(2);
    while (true) {
      const next = (
        await db.query<{ id: string }>(
          "select id from tournament_matches where tournament_id=$1 and status='ready' order by round_no,position limit 1",
          [tid],
        )
      ).rows[0];
      if (!next) break;
      await finish(next.id);
    }
    expect(
      (
        await db.query<{ status: string }>(
          "select status from tournaments where id=$1",
          [tid],
        )
      ).rows[0].status,
    ).toBe("completed");
  });

  it("unskips or reskips a double-elimination reset when correcting the grand final before it starts", async () => {
    const { tid } = await tournament("double_elimination", 2);
    const upper = (
      await db.query<{ id: string }>(
        "select id from tournament_matches where tournament_id=$1 and bracket='upper'",
        [tid],
      )
    ).rows[0];
    await finish(upper.id);
    const final = (
      await db.query<{ id: string; entry_a_id: string; entry_b_id: string }>(
        "select id,entry_a_id,entry_b_id from tournament_matches where tournament_id=$1 and bracket='final'",
        [tid],
      )
    ).rows[0];
    await finish(final.id);
    const reset = (
      await db.query<{ id: string; status: string }>(
        "select id,status from tournament_matches where tournament_id=$1 and bracket='reset'",
        [tid],
      )
    ).rows[0];
    expect(reset.status).toBe("skipped");
    await db.query(
      "select save_match_score($1,'tournament',$2::jsonb,2,true,null)",
      [final.id, JSON.stringify([{ game_no: 1, score_a: 15, score_b: 21 }])],
    );
    const enabled = (
      await db.query<{
        status: string;
        entry_a_id: string;
        entry_b_id: string;
      }>(
        "select status,entry_a_id,entry_b_id from tournament_matches where id=$1",
        [reset.id],
      )
    ).rows[0];
    expect(enabled).toMatchObject({
      status: "ready",
      entry_a_id: final.entry_b_id,
      entry_b_id: final.entry_a_id,
    });
    expect(
      (
        await db.query<{ status: string; champion_entry_id: string | null }>(
          "select status,champion_entry_id from tournaments where id=$1",
          [tid],
        )
      ).rows[0],
    ).toEqual({ status: "ongoing", champion_entry_id: null });
    await db.query(
      "select save_match_score($1,'tournament',$2::jsonb,3,true,null)",
      [final.id, JSON.stringify([{ game_no: 1, score_a: 21, score_b: 15 }])],
    );
    expect(
      (
        await db.query<{ status: string }>(
          "select status from tournament_matches where id=$1",
          [reset.id],
        )
      ).rows[0].status,
    ).toBe("skipped");
    expect(
      (
        await db.query<{ champion_entry_id: string }>(
          "select champion_entry_id from tournaments where id=$1",
          [tid],
        )
      ).rows[0].champion_entry_id,
    ).toBe(final.entry_a_id);
    await db.query(
      "select save_match_score($1,'tournament',$2::jsonb,4,true,null)",
      [final.id, JSON.stringify([{ game_no: 1, score_a: 15, score_b: 21 }])],
    );
    await finish(reset.id, "b");
    expect(
      (
        await db.query<{ status: string; champion_entry_id: string }>(
          "select status,champion_entry_id from tournaments where id=$1",
          [tid],
        )
      ).rows[0],
    ).toEqual({ status: "completed", champion_entry_id: final.entry_a_id });
  });
});

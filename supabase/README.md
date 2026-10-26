# Qmaster database

Run all SQL files in `migrations/` **once in filename order** in the SQL Editor of a new Supabase project. For an existing installation, apply only migrations not yet installed: `202610260002_test_data_removal.sql` enables delete/reset controls, `202610260003_public_home.sql` adds public sessions, and `202610260004_teams_player_records.sql` adds mixed doubles, queue team names, and public player records. Alternatively, link the project using the Supabase CLI and run `supabase db push`. The SQL requires Supabase's existing `auth` and `storage` schemas.

Apply `202610260005_scoring_rules.sql` after those migrations to enable scoring choices in creation forms. It defaults existing events to `standard_21`, permits up to 31 in game-score columns, and replaces the authenticated scoring function to enforce each event's saved rule: standard 21/win-by-two/cap-30, or `lenient_31` (first to 31, no deuce). Standard events still reject 31-point scores; lenient events reject 31–31, scores over 31, and premature finalization. The tournament update RPC prevents changing scoring after registration/draw generation. Public session snapshots include their scoring rule. Existing ownership, version checks, progression, corrections, and queue rotation remain in the same atomic scoring transaction.

The cleanup migration adds owner-checked atomic RPCs to delete tournaments, queue sessions, unused players, or the entire workspace. Deleting an event also removes its active/completed matches and scores; permanent player deletion requires removing linked events first. Workspace cleanup requires the exact `DELETE ALL` confirmation and retains the organizer/Auth account and Storage files. These functions are executable only by authenticated organizers and cannot delete another owner's data.

Create the organizer in **Authentication → Users → Add user**, with an email and password; confirm the email. The migration automatically provisions `public.organizers` for existing users and for users added afterward. Disable new user signups in Supabase Auth. Players do not need accounts.

The migration includes:

- Normalized tables, foreign keys, checks and indexes.
- Owner-only administration; anonymous reads only for published tournament data and published session metadata. Player records, private photos, raw queue matches/memberships, and the player-to-entry mapping stay private. The read-only `get_public_sessions` RPC returns only safe event details, participant display names, waiting order, courts, scores and history for published sessions.
- Authenticated transaction functions for registration, seeding, bracket generation/reset, court assignment, score updates, tournament progression and queue rotation.
- Optimistic score versions plus organizer-level transaction locks to prevent overlapping player/court assignments.
- A private `qmaster-media` Storage bucket with owner-folder policies, JPG/PNG/WebP validation and a 3 MiB limit.
- Realtime publication enrollment when `supabase_realtime` exists.

If `supabase_realtime` was not present when running the SQL, enable replication for `players`, `tournaments`, `tournament_entries`, `tournament_matches`, `queue_sessions`, `queue_members`, `queue_matches`, `queue_match_players` and `match_games` in Supabase's publication settings.

The third migration defaults existing and new queue sessions to private. Owners publish them through `publish_queue_session`; anonymous callers cannot publish or mutate anything. Triggers touch the safe parent session when scores, roster, or participant names change, allowing public Realtime subscriptions without granting access to private queue tables. Making a session private revokes its public snapshot. Public events are listed on `/`, which defaults to tournaments and offers a Queue sessions tab plus an Admin login link.

The fourth migration permits `mixed` in event play types (two players per side), adds optional queue-match team names, and provides owner-only `start_named_queue_match`, `rename_queue_teams`, and `rename_tournament_team` RPCs. Starting a named queue match retains the original atomic court/player checks; invalid team names roll back the start entirely.

`get_public_players(p_player_id)` returns safe display-name profiles, win/loss totals, and individual match histories. The directory exposes registered/archived display names, but records include only finalized matches in **published** events. Each team member receives one match result; walkovers count, BYEs and live matches do not. Corrections/unpublishing/deletion are reflected without manually maintained counters. Public calls never expose photos, organizer IDs, or raw membership rows. The internal `player_match_records` view has all public/anon/authenticated grants revoked. The admin UI independently derives full totals from the owner's records, including private events.

Round-robin rankings use match wins, game difference, point difference, then original seed. Walkovers award a match win without game/point scores. Single elimination has one final; double elimination includes an upper bracket, lower bracket, grand final, and a reset played only if the lower-bracket finalist wins the first grand final.

Completed scores may be corrected with confirmation in the app. A changed tournament winner is rejected once a dependent match has started or finished. A correction retaining the winner may update scores without changing later pairings. A queue correction never rotates players a second time. Ending a queue removes its waiting roster and retains all match history. A confirmed bracket reset deletes that bracket and its game scores.

`npm test` runs local PostgreSQL integration tests through PGlite with mocked Supabase auth/storage schemas. These tests exercise SQL execution, RLS, score validation, double-elimination resets, BYEs, corrections and queue rotation. They do **not** verify a live Supabase project, hosted Auth, Realtime transport, or Storage uploads.

Use the browser-safe project URL and **publishable** key in `.env.local`; never put a service-role key or database password in a `VITE_` variable.

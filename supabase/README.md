# Qmaster database

Run `migrations/202610260001_qmaster.sql` **once** in the SQL Editor of a new Supabase project. Alternatively, link the project using the Supabase CLI and run `supabase db push`. The SQL requires Supabase's existing `auth` and `storage` schemas.

Create the organizer in **Authentication → Users → Add user**, with an email and password; confirm the email. The migration automatically provisions `public.organizers` for existing users and for users added afterward. Disable new user signups in Supabase Auth. Players do not need accounts.

The migration includes:

- Normalized tables, foreign keys, checks and indexes.
- Owner-only administration and reads; anonymous reads only for explicitly published tournament data. Player records, private photos, queue records and the player-to-entry mapping stay private.
- Authenticated transaction functions for registration, seeding, bracket generation/reset, court assignment, score updates, tournament progression and queue rotation.
- Optimistic score versions plus organizer-level transaction locks to prevent overlapping player/court assignments.
- A private `qmaster-media` Storage bucket with owner-folder policies, JPG/PNG/WebP validation and a 3 MiB limit.
- Realtime publication enrollment when `supabase_realtime` exists.

If `supabase_realtime` was not present when running the SQL, enable replication for `players`, `tournaments`, `tournament_entries`, `tournament_matches`, `queue_sessions`, `queue_members`, `queue_matches`, `queue_match_players` and `match_games` in Supabase's publication settings.

Round-robin rankings use match wins, game difference, point difference, then original seed. Walkovers award a match win without game/point scores. Single elimination has one final; double elimination includes an upper bracket, lower bracket, grand final, and a reset played only if the lower-bracket finalist wins the first grand final.

Completed scores may be corrected with confirmation in the app. A changed tournament winner is rejected once a dependent match has started or finished. A correction retaining the winner may update scores without changing later pairings. A queue correction never rotates players a second time. Ending a queue removes its waiting roster and retains all match history. A confirmed bracket reset deletes that bracket and its game scores.

`npm test` runs local PostgreSQL integration tests through PGlite with mocked Supabase auth/storage schemas. These tests exercise SQL execution, RLS, score validation, double-elimination resets, BYEs, corrections and queue rotation. They do **not** verify a live Supabase project, hosted Auth, Realtime transport, or Storage uploads.

Use the browser-safe project URL and **publishable** key in `.env.local`; never put a service-role key or database password in a `VITE_` variable.

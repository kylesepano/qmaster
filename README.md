# Qmaster

A responsive badminton workspace for one organizer: register players, run casual queues on independent courts, create singles or doubles tournaments, and share live results with spectators.

Built directly in this workspace with React, TypeScript, Vite, Tailwind CSS, React Router, Lucide, and Supabase. No application server or paid application dependency is required. Production data lives in PostgreSQL; the app never substitutes browser storage or sample records for the database.

## Start locally

Use Node.js 24 LTS and npm. The included `.nvmrc` selects Node 24 when using a compatible version manager.

```powershell
npm install
Copy-Item .env.example .env.local
```

Fill in `.env.local`:

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_KEY
```

Then complete the database/auth setup below and run:

```powershell
npm run dev
```

Open **http://127.0.0.1:5173**. The default home page is the public tournament directory, with a Queue sessions tab and an Admin login link. Restart the dev server after changing environment variables. Without credentials, public pages show empty event lists and admin sign-in is unavailable. Setup instructions live in this README; the five-step setup panel has been removed from the app. Once configured, organizer routes require sign-in.

This is a Vite SPA. Start it through npm even if the folder is under Laragon; opening the folder through Apache alone does not run Vite.

## What you must enter manually

### One-time configuration

1. **Supabase Project URL** and **publishable key**, in `.env.local`. Copy them from your own Supabase project's connection/API settings. Do not use a database password, secret key, or service-role key in frontend variables.
2. **Database migrations:** run the SQL files in [`supabase/migrations/`](supabase/migrations/) once in filename order in the SQL Editor of a new Supabase project. The first creates the schema, constraints, RLS, transaction functions, private media bucket, and Realtime publication enrollment; `202610260002_test_data_removal.sql` adds permanent cleanup; `202610260003_public_home.sql` adds session publishing and safe public session snapshots. For an existing installation, run only migrations not already applied. Existing projects should be backed up and checked for conflicting table/function names first.
3. **Organizer email and password:** add a user in Supabase → Authentication → Users → Add user. Confirm its email. The migration provisions the organizer record automatically for existing and new Auth users. There is no app sign-up form. Disable **Allow new users to sign up** in Supabase Auth settings.
4. **Auth URLs:** set the Supabase Site URL and allowed redirect URLs to your localhost address and eventual deployed origin. Do not enable anonymous Auth sign-ins for spectators; public results use read-only anonymous database access.
5. **Deployment:** create/select your GitHub repository and Vercel project, and set the same two environment variables on Vercel before building. No credentials, remote repository, or hosted deployment were created by this implementation.

### Each event

| Area         | Required manual input                                                                 | Optional / automatic                                                           |
| ------------ | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Players      | Player name                                                                           | Optional profile image; no player account                                      |
| Tournament   | Name, date, singles/doubles, bracket format, courts, one game/best of three           | Venue, description, private organizer banner                                   |
| Participants | Select registered players; select exactly two per doubles team                        | Custom team name, manual seed order, randomized draw                           |
| Queue        | Session name, singles/doubles, courts, scoring format, player roster                  | FIFO suggestions; manually override sides and rejoin preference                |
| Match        | Select an available court and enter points or final game scores; confirm final result | Game/match winner, progression, court release and queue rotation are automatic |
| Spectators   | Explicitly publish the tournament and share its link                                  | No spectator login; live updates and reconnect refresh                         |

You never manually enter BYEs, later-round participants, upper/lower bracket progression, or the champion. Click **Generate draw**, then **Start tournament**, assign a ready match to a court, and score it.

## Supported formats and rules

- **Single elimination:** seeded knockout draw with automatic BYEs for non-power-of-two entry counts, including 6 and 10.
- **Double elimination:** upper bracket, lower bracket, grand final, and a reset final only when the lower-bracket finalist wins the first grand final. A participant is eliminated after two played losses.
- **Round robin:** each entry plays every other entry once; standings use match wins, game difference, point difference, then seed as the deterministic final tiebreaker. Walkovers award a match win without invented game scores.
- All formats support **2–64 entries**, with singles or two-player teams. Swiss and group-to-knockout formats are not included.
- Standard scoring: 21 points, win by two, cap at 30. One-game or best-of-three matches. Quick score entry, point correction, walkovers, and explicit result confirmation are included.
- Participants and play/scoring format lock once registration/draw begins. Manual seed ordering uses the arrows beside entries before draw generation.
- Finalized results can be corrected with confirmation. Changing a tournament winner is rejected if a dependent match has started or finished. Corrections retaining the winner are safe; correcting a queue result never rotates players twice.
- Resetting a bracket requires confirmation, deletes its match/game results, clears the champion, and returns it to Draft. Active matches must finish first.
- Court occupancy is per event/session, as in the brief. Player occupancy is checked across all of the organizer's active events. If two events use the same physical court, schedule those events separately.
- Players with references are archived when removed; match history remains. Ending a queue clears its active roster and preserves completed matches.

### Public home and event history

- `/` defaults to **Tournaments**; `/?view=sessions` shows public casual sessions. Visitors can search, filter live events, browse history, and open event details without an account.
- Publish a tournament from its **Publish results** action. Published tournaments appear on the home page with bracket progress, entry counts, match completion, and champions. Draft tournaments appear as Upcoming, ongoing tournaments as Live now, and completed tournaments under History.
- Publish a queue from **Publish session** on its admin detail page. Spectators see live courts, player/team display names, waiting order, scores, and completed match history at `/public/sessions/:id`.
- Events stay private until explicitly published. Making an event private removes it from the directory and its public detail view on the next refresh. Private player rows, photos, rejoin preferences, and raw queue membership data remain inaccessible.
- Public pages include an **Admin login** link. Signed-in organizers see **Admin dashboard** instead. Administration stays on the protected routes; the public home remains the default even when an organizer is signed in.

### Removing test data

- Use the **trash button** on a tournament or queue card, or **Delete** on its detail page. Confirming permanently removes that event, all its matches/scores and registrations/queue members, including active games. Player records remain.
- Players have separate **Archive** and **Delete** controls. Archive preserves history and can be undone. Permanent deletion removes an unused player and their waiting-queue memberships. For a player linked to tournament registrations or match history, delete the linked tournaments/sessions first, or use the workspace reset.
- In **Settings → Clear all test data**, type **DELETE ALL** to remove all your players, events, matches, and scores. Your organizer login, environment configuration, and uploaded Storage files remain. Other organizers are unaffected. No test data is deleted merely by installing the migration.

## Supabase security, uploads, and Realtime

The migrations enable RLS on every application table. Only the owning organizer can administer their data. Public tournament access covers explicitly published event details, entry display names, matches, and scores. For queues, only published parent session metadata is publicly selectable; a read-only `get_public_sessions` function returns safe display names, waiting order, courts, scores, and results. Private player rows, raw queue matches/membership, and player-to-entry mappings are not publicly readable. Admin data fetching explicitly scopes records to the signed-in organizer.

Critical changes use PostgreSQL transactions and organizer-level advisory locks. Version checks reject conflicting score edits. The database validates completed scores, prevents overlapping court/player assignments, and advances bracket winners and losers atomically.

Optional images use private bucket `qmaster-media`, organizer UUID folders, JPG/PNG/WebP MIME types, and a 3 MiB limit. The migration creates bucket restrictions and owner-only Storage policies. Player pictures and banners are for the organizer workspace; public tournament entry names are sufficient to run results. No image is required.

The migration enrolls the application tables in `supabase_realtime` if the publication exists. Check Supabase's replication/publication settings after applying it. Organizer subscriptions refresh state when players, entries, courts or scores change. Public detail subscriptions are scoped to one event; the directory subscribes to its visible event type. Queue match/roster changes touch the public parent session so spectators receive updates without access to private queue tables. The app also refetches on focus, reconnect, and periodically after lost events. See [`supabase/README.md`](supabase/README.md) for database details.

## Verification

```powershell
npm run typecheck
npm test
npm run build
```

The unit and local PostgreSQL integration suite covers badminton scoring, FIFO rotation, seed/BYE generation, advancement, standings, double-elimination simulations for every entry count from 2–64, RLS, court/player conflicts, score versions, and safe corrections. PostgreSQL tests execute the actual migration in PGlite with test-only Supabase auth/storage schemas.

Browser checks use Google Chrome installed locally (or run `npx playwright install chrome` first):

```powershell
npm run test:e2e
npx playwright test --config playwright.flows.config.ts
```

The first suite starts an isolated server on port 5175 and checks the public default home, unconfigured pages, mobile navigation, layout overflow, and removal of the setup panel. The second starts an isolated dev server on port 5174 and intercepts test-only Supabase responses to exercise doubles queues, manual sides, scoring, corrections, deletion/reset, public tournament/session directories and history, publishing, and read-only spectator pages. These fixtures never become production data.

**Live Supabase Auth, hosted PostgreSQL, Realtime transport, uploads, and Vercel deployment have not been verified without your credentials.** Local PostgreSQL and fixture browser checks do not claim to test those hosted services.

After connecting your project, validate:

1. Sign in, add eight players, create a singles tournament, register eight entries, generate/start, and assign a quarterfinal to Court 1.
2. Enter/finalize scores through the final; check advancement and champion after reload.
3. Repeat with 6 and 10 entries to inspect BYEs, then try double elimination and a lower-bracket grand-final win to trigger a reset.
4. Create a doubles queue with enough players for three courts. Check independent courts, busy-player exclusion, rejoin preferences, and rotation after finishing.
5. Publish a tournament; open its public link in an incognito window or second device. Check score updates and ensure no edit controls are visible. Make it private and verify the link becomes unavailable after refresh.
   Publish a queue session too; verify it appears on the public home, court scores refresh on another device, and its completed results remain under History after ending the session.
6. Try an optional small image. Verify signing out blocks admin routes and unauthenticated writes fail.

## Vercel deployment

1. Push this folder to a GitHub repository you control. Keep `.env.local` ignored; commit `.env.example` and SQL migrations.
2. Import the repository into Vercel. Use the **Vite** preset, build command `npm run build`, and output directory `dist`.
3. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` to the appropriate Vercel environments, then deploy. Rebuild after changing them because Vite embeds these values during compilation.
4. Add the deployed URL to Supabase Auth URL settings. Use HTTPS for production.
5. Test a direct URL such as `/tournaments/your-id/bracket` and refresh it. [`vercel.json`](vercel.json) includes the SPA rewrite.

Use service plans for which your account and usage are eligible. The app requires no paid dependency, and optional uploads can be omitted.

## Project map

```text
src/
  components/   Reusable forms, cards, dialogs, scoreboard and bracket view
  hooks/        Auth session, database state, Realtime and action feedback
  layouts/      Responsive organizer workspace
  lib/          Supabase client
  pages/        Dashboard, players, queues, tournaments, matches, public home/results, settings
  routes/       Public/protected routing
  services/     Supabase reads/RPCs and replaceable media utility
  types/        Typed domain/database entities
  utilities/    Pure brackets, scoring, queue and standings logic, with tests
supabase/       Migration and database notes
tests/          PostgreSQL integration and browser suites
```

Official references: [Vite setup](https://vite.dev/guide/), [Supabase publishable keys](https://supabase.com/docs/guides/getting-started/api-keys), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), and [Realtime Postgres changes](https://supabase.com/docs/guides/realtime/postgres-changes).

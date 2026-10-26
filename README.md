# Qmaster

A responsive court-sports workspace for one organizer: use one player pool for badminton and pickleball, run casual queues on independent courts, create singles or doubles tournaments, and share live results with spectators.

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

Open **http://127.0.0.1:5173**. The default home page is the Qmaster overview, with live-game counts, ongoing events and upcoming schedules. Navigation links to Home, Games, Players, Sessions and Tournaments, with an Admin login link. Restart the dev server after changing environment variables. Without credentials, public pages show empty event lists and admin sign-in is unavailable. Setup instructions live in this README; the five-step setup panel has been removed from the app. Once configured, organizer routes require sign-in.

This is a Vite SPA. Start it through npm even if the folder is under Laragon; opening the folder through Apache alone does not run Vite.

## What you must enter manually

### One-time configuration

1. **Supabase Project URL** and **publishable key**, in `.env.local`. Copy them from your own Supabase project's connection/API settings. Do not use a database password, secret key, or service-role key in frontend variables.
2. **Database migrations:** run the SQL files in [`supabase/migrations/`](supabase/migrations/) once in filename order in the SQL Editor of a new Supabase project. The first creates the schema, constraints, RLS, transaction functions, private media bucket, and Realtime publication enrollment; `202610260002_test_data_removal.sql` adds permanent cleanup; `202610260003_public_home.sql` adds session publishing; `202610260004_teams_player_records.sql` adds teams/player records; `202610260005_scoring_rules.sql` adds selectable standard or lenient scoring. For an existing installation, run only migrations not already applied. Existing projects should be backed up and checked for conflicting table/function names first.
3. **Organizer email and password:** add a user in Supabase → Authentication → Users → Add user. Confirm its email. The migration provisions the organizer record automatically for existing and new Auth users. There is no app sign-up form. Disable **Allow new users to sign up** in Supabase Auth settings.
4. **Auth URLs:** set the Supabase Site URL and allowed redirect URLs to your localhost address and eventual deployed origin. Do not enable anonymous Auth sign-ins for spectators; public results use read-only anonymous database access.
5. **Deployment:** create/select your GitHub repository and Vercel project, and set the same two environment variables on Vercel before building. No credentials, remote repository, or hosted deployment were created by this implementation.

### Each event

| Area         | Required manual input                                                                                     | Optional / automatic                                                           |
| ------------ | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Players      | Player name                                                                                               | Optional profile image; no player account                                      |
| Tournament   | Name, date, start time, sport, scoring rules, singles/doubles/mixed, bracket format, courts, match format | Venue, description, private organizer banner                                   |
| Participants | Select registered players; select exactly two per doubles team                                            | Custom team name, manual seed order, randomized draw                           |
| Queue        | Session name, date, start time, sport, scoring rules, singles/doubles/mixed, courts, player roster        | FIFO suggestions; manually override sides and rejoin preference                |
| Match        | Select an available court and enter points or final game scores; confirm final result                     | Game/match winner, progression, court release and queue rotation are automatic |
| Spectators   | Explicitly publish the tournament and share its link                                                      | No spectator login; live updates and reconnect refresh                         |

You never manually enter BYEs, later-round participants, upper/lower bracket progression, or the champion. Click **Generate draw**, then **Start tournament**, assign a ready match to a court, and score it.

## Supported formats and rules

### Event dates and start times

Apply `supabase/migrations/202610260010_event_schedules.sql` after 001–009. Every new session and tournament form has **Event date** and **Start time (UTC+8)** fields. All schedules use Singapore/Manila time and show an explicit UTC+8 label to visitors, independently of their device timezone. The creation defaults are today's date in UTC+8 and 09:00; change these to the actual event schedule.

Published session/tournament cards and detail pages show the schedule. Both directories offer **Upcoming**, sorted by nearest scheduled start, alongside live events and history. Completed events remain in History; a future scheduled event is Upcoming unless an actual match is already playing. Draft tournaments remain Upcoming until started. Dates are planning metadata and do not prevent an organizer from starting games early or automatically start an event when its time arrives.

Use **Edit schedule** on an admin session page to change the date/time; tournament schedules can be changed through **Edit**. Generated session brackets inherit their session schedule, and later session schedule edits keep the linked bracket synchronized. Existing sessions are left without a schedule and display **Schedule to be announced**; existing tournaments keep their date and display **Time to be announced** until a start time is entered. Record creation timestamps are not presented as event schedules. Only published events expose schedule information publicly; changing a schedule does not publish it.

### Equal-play pickleball rotations (Normal sessions)

Apply `supabase/migrations/202610260009_pickleball_rotations.sql` after 001–008. This adds a normal-session rotation, separate from tournament brackets. Existing badminton and bracket session workflows retain their behavior.

1. Create a **Pickleball → Normal** session. Enter **Session hours** and **Estimated minutes per match**, defaulting to **15 minutes** including changeover/breaks. **Expected players** previews capacity before creating the session; the real registered roster determines the final plan. Hours and match estimate are saved with the session.
2. Add everyone using the searchable player picker, then select **Generate balanced rotation & fill courts**. The planner assigns an equal **final total** of session matches to every registered player. Prior finalized matches in this session count toward that target, so players with fewer appearances receive more remaining games. Teammates and sides are randomized per game, independently of fixed team registrations; repeated pairings remain possible.
3. Estimated capacity is `floor(hours × 60 / minutes per match) × min(courts, floor(players / players per match))`. The plan uses the highest feasible equal match count within this capacity; it leaves slots unused when needed to keep totals equal. Example: 8 doubles players, 2 courts, 2 hours and 15 minutes per match gives 16 matches, 8 per player. With 10 players, the same capacity fits 15 matches, 6 per player, leaving 1 slot unused.
4. Available courts fill automatically. Finalizing a match calls the next available planned game. A player cannot play simultaneously in another queue or tournament. After a player becomes free in another event, **Fill available courts** retries waiting games. Per-player completed/target counts, overall progress and the planned match list are visible and survive reloads.
5. While the plan exists, roster edits, manual starts and disabling rejoin are locked to protect equality. **Cancel remaining rotation** removes unstarted reservations while keeping started matches and results. Finish active games, edit hours/roster and regenerate to rebalance from the retained history. Ending a session early also stops future games; equal totals apply only when the full rotation finishes.

The duration is a planning estimate, not an automatic session timer or a guarantee that play finishes within those hours. Actual match lengths, overlapping player availability and court idle time can extend the session. The estimate covers the whole match, including all games in a best-of-three. Some small rosters/time budgets or historical appearance counts cannot form complete equal-count matches; the app explains this instead of generating an unequal schedule. Plans support up to 256 players and 1,000 future matches. Private planned pairings are organizer-only; published actual games and results remain visible through the existing public session pages.

### Badminton and pickleball

Apply `supabase/migrations/202610260008_pickleball.sql` after migrations 001–007 before using the updated app. It defaults existing events to **Badminton** without changing their results. No additional credentials, player registrations, buckets or services are needed. The branding and browser title are now simply **Qmaster**, with a sport-neutral Q icon.

- Select **Sport** when creating a session or tournament. Both sports use the same registered players, named teams, random/manual draws, elimination/round-robin formats, and court workflows. Generated session brackets inherit their session's sport and scoring rules.
- For **Pickleball**, select **11 points — sudden death, no deuce** (11–10 wins) or **11 points — deuce, win by two** (11–10 remains live; 12–10 wins). Win-by-two has no sports-rule score cap, so extended results such as 32–30 are valid. This follows the usual [11-point, win-by-two rule](https://www.usapickleball.org/docs/rules/USAP-Rules-Summary.pdf); sudden death is the requested custom option. Scores are stored as nonnegative PostgreSQL integers.
- The scoreboard records points entered by the organizer; it does not track serving turns, side-outs or automatically award rally points. Both pickleball options support one game or best of three, game-win notifications, automatic next-game reset to 0–0, and explicit match finalization.
- Admin and public player pages have a **Player records sport** selector. Wins, losses, win rate, sorting, and public match history are calculated separately for each sport using the same player identity. Public records include only finalized matches from published events. BYEs do not count; walkovers do. Bracket session results count once as session matches.
- Games, public events, and admin event lists have sport filters and event sport labels. Public navigation is **Home → Games → Players → Sessions → Tournaments**; the default home is the Qmaster overview.
- Tournament sport/scoring choices lock when participants are registered. Session rules are chosen at creation and cannot be reclassified after registration or play, protecting historical records. Badminton retains standard 21/cap-30 and lenient first-to-31 scoring.

The sport migration and both scoring modes are covered by local PostgreSQL integration and browser fixture tests; a live Supabase project still requires applying the migration and validating its deployment.

### Queue-session teams and brackets

Apply `supabase/migrations/202610260006_queue_teams_brackets.sql` after the earlier migrations to enable these session modes. Existing sessions remain **Normal**.

1. When creating a session, select **Session mode**: **Normal — manual or random matches**, or **Bracket — generate matches and advance winners**. Bracket sessions offer single elimination, double elimination, and round robin.
2. For doubles or mixed, click **Add team**, enter the team name, and search/select exactly two registered players. Players are automatically added to the session roster. Each player can belong to one registered team in that session. Singles bracket sessions register one player per entry.
3. In Normal sessions, choose **Team A**, **Team B**, and a court to start a match yourself. **Suggest random teams** chooses a pair for review; **Randomly fill courts** creates random ready-team matches across free courts. The original individual-player queue and manual match selection remain available.
4. In Bracket sessions, register 2–64 entries and click **Generate bracket & fill courts**. The draw is randomized by default. To arrange it manually, turn randomization off and use the arrows to set seed order before generation. BYEs are generated automatically.
5. Ready matches start on free courts automatically. Finalizing a result advances the bracket and fills newly available courts; the last result declares a session champion. Players already playing anywhere in the organizer's workspace are skipped. If a player becomes available after another event ends, click **Fill available courts** to retry ready matches.
6. Publish the session to share its bracket, live courts, champion, and history without a spectator login. Bracket matches count once in each participating player's records and appear as session results. They are not duplicated in the tournament directory.

The session mode is chosen at creation. Team membership and seeds lock after bracket generation. A confirmed bracket reset removes its scores and champion, returns the session to ongoing, and keeps the registered teams; finish active games before resetting. Deleting a session cancels active games and removes its teams, bracket, and scores. In Normal sessions, removing a registered team leaves its completed match results intact.

- **Single elimination:** seeded knockout draw with automatic BYEs for non-power-of-two entry counts, including 6 and 10.
- **Double elimination:** upper bracket, lower bracket, grand final, and a reset final only when the lower-bracket finalist wins the first grand final. A participant is eliminated after two played losses.
- **Round robin:** each entry plays every other entry once; standings use match wins, game difference, point difference, then seed as the deterministic final tiebreaker. Walkovers award a match win without invented game scores.
- All formats support **2–64 entries**, with singles or two-player teams. Swiss and group-to-knockout formats are not included.
- **Mixed doubles** is available for tournaments and queue sessions and uses two players per side. The organizer selects the pairings; the app does not require or store player gender.
- Doubles and mixed tournament registrations accept an optional **Team name**. You can rename a registered team using its pencil button, including after the draw starts; scores and player membership remain unchanged.
- Doubles and mixed queue matches accept optional **Team A name** and **Team B name** before calling players. Names apply to that match and are cleared when the selected members change. Existing match names can be changed through **Edit team names** on the scoreboard. Blank names fall back to player names. Team names appear on court cards, scoreboards, results, public sessions, and individual player histories.
- Choose **Scoring rules** when creating a tournament or session. **Standard** remains the default: 21 points, win by two, cap at 30. **Lenient** means first to 31 with no deuce or two-point-lead requirement: 31–0, 31–1, and 31–30 are valid; 21–0 and 30–0 remain in play. Both modes support one game or best of three, quick score entry, corrections, walkovers, and explicit finalization.
- Existing events retain standard scoring after applying the migration. Tournament scoring rules can be edited only before registering entries or generating a bracket; session rules are chosen at creation. The database validates scores using the saved event rule, so a standard event cannot accept 31-point scores just because another event uses lenient scoring.
- Winning a game shows a notification with the winner and final score. In best-of-three matches the next game immediately starts at 0–0, preserving the previous game without adding an extra point. When the match is won, scoring stops and the organizer confirms **Finalize match**. A game cannot exceed the selected cap, and 31–31 is invalid in lenient mode because the first side to 31 already won.
- Participants and play/scoring format lock once registration/draw begins. Manual seed ordering uses the arrows beside entries before draw generation.
- Finalized results can be corrected with confirmation. Changing a tournament winner is rejected if a dependent match has started or finished. Corrections retaining the winner are safe; correcting a queue result never rotates players twice.
- Resetting a bracket requires confirmation, deletes its match/game results, clears the champion, and returns it to Draft. Active matches must finish first.
- Court occupancy is per event/session, as in the brief. Player occupancy is checked across all of the organizer's active events. If two events use the same physical court, schedule those events separately.
- Players with references are archived when removed; match history remains. Ending a queue clears its active roster and preserves completed matches.

### Public home and event history

- `/` opens **Home**. `/public/tournaments` lists tournaments and `/public/sessions` lists sessions; legacy `/?view=sessions` links redirect to the session directory while preserving filters. Visitors can search, filter live events, browse history, and open event details without an account.
- Publish a tournament from its **Publish results** action. Published tournaments appear on the home page with bracket progress, entry counts, match completion, and champions. Draft tournaments appear as Upcoming, ongoing tournaments as Live now, and completed tournaments under History.
- Publish a queue from **Publish session** on its admin detail page. Spectators see live courts, player/team display names, waiting order, scores, and completed match history at `/public/sessions/:id`.
- Events stay private until explicitly published. Making an event private removes it from the directory and its public detail view on the next refresh. Private player rows, photos, rejoin preferences, and raw queue membership data remain inaccessible.
- Public pages include an **Admin login** link. Signed-in organizers see **Admin dashboard** instead. Administration stays on the protected routes; the public home remains the default even when an organizer is signed in.

### Public player directory and records

- The public navigation includes **Players** at `/public/players`. All registered player display names, including archived players, are visible without signing in. Private profile pictures and organizer information remain private.
- Each directory card shows **wins, losses, matches played, and win rate**. Search by name or sort by most wins, then open a profile at `/public/players/:id` for match history.
- Public totals and histories include **finalized matches from published tournaments and sessions**. Both players on a doubles/mixed side receive the result. Walkovers count as wins/losses; automatic BYEs, pending matches, and live matches do not. No games won or lost are added as separate match results.
- Match history includes the event, date, court, play type, team names, individual participant names, game scores or walkover, and the player's win/loss result. Filter by wins/losses and tournament/session.
- The admin Players list shows wins/losses from **all** finalized matches, including private events, plus a public-profile link. Public totals can differ while some events remain private.
- Records are calculated from the stored participants and current finalized winners. Score corrections update totals; unpublishing removes an event's results from public records, and deleting events removes their results entirely. Archiving preserves the player's historical profile.

### Removing test data

- Use the **trash button** on a tournament or queue card, or **Delete** on its detail page. Confirming permanently removes that event, all its matches/scores and registrations/queue members, including active games. Player records remain.
- Players have separate **Archive** and **Delete** controls. Archive preserves history and can be undone. Permanent deletion removes an unused player and their waiting-queue memberships. For a player linked to tournament registrations or match history, delete the linked tournaments/sessions first, or use the workspace reset.
- In **Settings → Clear all test data**, type **DELETE ALL** to remove all your players, events, matches, and scores. Uploaded player photos and tournament banners are also removed through Storage cleanup. Your organizer login and environment configuration remain. Other organizers are unaffected. No test data is deleted merely by installing the migration.

### Automatic photo and banner cleanup

Apply `supabase/migrations/202610260007_media_cleanup.sql` after the earlier migrations. Permanent player deletion queues its photo for removal. Replacing a photo or banner queues the old file only after the new database value saves; tournament deletion and a full test-data reset queue their images too. Archiving preserves the player and photo. A blocked/failed record deletion leaves its image intact.

Images are removed through the authenticated [Supabase Storage deletion API](https://supabase.com/docs/guides/storage/management/delete-objects), not by deleting Storage metadata in SQL. Cleanup requests persist in an owner-only table until the API succeeds. The app retries on admin sign-in and every minute while signed in; a failure after successful record deletion is shown as a pending-cleanup notice. Images still referenced by another player or banner are kept.

For photos left behind by older versions, open **Settings → Image storage cleanup → Clean unused images**. This scans only your media folder, preserves current references, and skips unreferenced uploads newer than five minutes so another device can finish saving them. It also retries pending deletions immediately. If cleanup remains pending, verify the existing `qmaster-media` owner-folder SELECT and DELETE policies and retry. Hosted Storage deletion still requires verification against your own project; browser checks use intercepted Storage responses.

## Supabase security, uploads, and Realtime

The migrations enable RLS on every application table. Only the owning organizer can administer their data. Public tournament access covers explicitly published event details, entry display names, matches, and scores. For queues, only published parent session metadata is publicly selectable; a read-only `get_public_sessions` function returns safe display names, waiting order, courts, scores, and results. The `get_public_players` function returns only player IDs, display names, archived status, and records/history from published events. Private player table rows, photos, raw queue matches/membership, and player-to-entry mappings are not publicly selectable. The internal player-result view has no public/authenticated read grant. Admin data fetching explicitly scopes records to the signed-in organizer.

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

# Yearly Runbook — 2027 Tournament

The app no longer needs a hand-edited team list. Each season is: run the rollover script, then import the bracket from ESPN on Selection Sunday. This is the dated checklist for 2027 (first 76-team field: 12-game Opening Round Mar 16–17, First Round Mar 18–19, Final Four Apr 3, title game Apr 5 in Detroit). Adjust dates in `src/lib/tournament-structure.ts` → `YEAR_DEFAULTS` for later years.

## Now (any time before March)

- [ ] Merge and push `main` (the push re-enables GitHub scheduled workflows, which GitHub disables after 60 idle days).
- [ ] GitHub → Settings → Secrets and variables → Actions: add **`CRON_SECRET`** (same value as Vercel). Actions tab → "Tournament cron" → **Run workflow** once; both steps should return HTTP 200.
- [ ] Vercel env: add **`EMAIL_FROM`** (a verified Resend sender) and confirm `RESEND_API_KEY`, `ADMIN_EMAILS`, VAPID keys.
- [ ] Supabase: unpause the project (free tier pauses after ~7 idle days), then `supabase db push --linked` to apply `00009_2027_readiness.sql`.
- [ ] Dry-run the importer against last year's real data to prove the pipeline end to end (admin page → Import from ESPN → "2026 replay" preset, or):
  ```bash
  curl -s -X POST -H "Authorization: Bearer $CRON_SECRET" -H 'content-type: application/json' \
    -d '{"year":2026,"dates":["20260317","20260318","20260319","20260320"],"expected":{"teams":68,"opening":4},"dryRun":true}' \
    https://bracketmadness.vercel.app/api/admin/import-bracket | jq '.report | {teams:.teams.count, opening:.openingRound.count, r1:.firstRound.count, errors, warnings}'
  ```
  Expect 68 / 4 / 32, no errors.

## ~March 1

- [ ] `npm run db:rollover -- --year 2027` (prints what it will delete; nothing changes yet), then `npm run db:rollover -- --year 2027 --confirm` with production env vars. Keeps `profiles`, `push_subscriptions`, `email_waitlist`.
- [ ] Admin page → Config: confirm year 2027, bracket lock **Thu Mar 18 2027 12:00 PM ET (16:00Z)**, wager deadline the same, phase `pre_tournament`. Save.
- [ ] Homepage shows "2027" and the lock countdown; `/bracket/new` renders the empty skeleton (teams TBD).

## Selection Sunday — Sun Mar 14 (evening)

- [ ] Wait for ESPN to post the Opening Round and First Round schedule (usually within an hour or two of the bracket reveal).
- [ ] Admin → **Import from ESPN** with dry run **on**. Check the report: 76 teams, 12 Opening Round games, 32 First Round games with 12 TBD sides, every region covering seeds 1–16, no unmatched headlines, no errors.
- [ ] If a headline wording changed and games show as unmatched, the fallback is `npm run db:import-json -- --year 2027 <saved scoreboard json files>` after fixing `parseHeadline` in `src/lib/bracket-import.ts`.
- [ ] Run the import for real. Re-running is safe (upserts) if ESPN posts a game late.
- [ ] Set the **Final Four pairing** from the official bracket (which regions meet in each semifinal) in Admin → Config. This rewires slots 69–72; it refuses once an Elite Eight game is final.
- [ ] Spot-check `/bracket/new`: play-in slots show "A / B", logos load, seeds are right.
- [ ] Admin → **Email the waitlist** (dry run shows the count) to announce brackets are open.

## Opening Round — Tue Mar 16 / Wed Mar 17

- [ ] GitHub Actions tab shows the cron running every 5 minutes.
- [ ] After each play-in goes final, the winner appears in the first-round tile and `bracket_picks` for the loser are rewritten to the winner (check one in the Supabase table editor).

## Lock — Thu Mar 18, 16:00Z

- [ ] The next cron run after the deadline auto-locks every bracket with 63 picks; the leaderboard fills in. Drafts with fewer picks stay out and their owners see the "not eligible" message on the dashboard.
- [ ] `/bracket/new` now shows "Brackets are closed".

## During the tournament

- [ ] Admin → Health shows "last score update" within the last 5 minutes while games are on. If ESPN is down, use manual score entry (the winner is derived from the scores; the same pipeline runs).
- [ ] If anything looks stale: Admin → "Sync from ESPN" (scans every tournament day) then "Backfill scoring" / "Verify scores".

## Final Four & title game — Apr 3 / Apr 5

- [ ] After the final: wagers resolve (ties push), achievements are awarded, the site flips to off-season mode: it brands itself as next year (title, hero, footer), the hero shows "brackets open Selection Sunday" with the waitlist form, and last year's champion and final standings stay viewable. Optionally set phase `completed`.

## After

- [ ] The 5-minute cron stops by itself after Apr 6. Daily Vercel crons and the keep-alive workflow keep the DB awake.
- [ ] Optional: export `brackets`/`bracket_picks` from Supabase before next year's rollover wipes them.
- [ ] Next year: add a `YEAR_DEFAULTS[2028]` entry (Selection Sunday, dates, deadlines, ESPN dates) and repeat. Without it the off-season hero still says "Selection Sunday" but can't show the date.

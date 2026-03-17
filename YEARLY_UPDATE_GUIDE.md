# Yearly Update Guide

How to reuse this March Madness bracket app for the next tournament. The database schema, bracket structure (68 teams, 67 game slots), and ESPN integration are all reusable as-is. You just need to swap in new team data, update dates, and reset tournament state.

---

## 1. Database Reset

Clear all tournament-specific data while keeping user accounts intact. Run these SQL statements against the Supabase database in order (foreign key dependencies matter):

```sql
-- Tournament data (order matters due to FK constraints)
TRUNCATE notification_queue, notifications_log CASCADE;
TRUNCATE user_achievements CASCADE;
TRUNCATE wagers CASCADE;
TRUNCATE bracket_picks CASCADE;
TRUNCATE brackets CASCADE;
TRUNCATE games CASCADE;
TRUNCATE teams CASCADE;
TRUNCATE tournament_config CASCADE;

-- Optional: also reset push subscriptions if you want a clean slate
-- TRUNCATE push_subscriptions CASCADE;
```

Alternatively, if you want a completely fresh start including user accounts, you can reset the entire Supabase project from the dashboard.

**Note:** User profiles are preserved by default. Since profiles are linked to `auth.users` via a trigger, existing users keep their accounts and can log right back in.

---

## 2. Update Teams (`src/db/seed.ts`)

Replace the `teams` array (line 12-92) with the new tournament's 68 teams. Each team needs:

```ts
{ name: "Duke", abbreviation: "DUKE", seed: 1, region: "east", record: "32-2" }
```

**Checklist:**
- [ ] 16 teams per region (east, west, south, midwest) = 64 base teams
- [ ] 4 additional First Four teams (8 teams total share 4 seed slots)
- [ ] First Four teams have `record: "First Four"` -- this is how the seed script distinguishes them from regular teams in that seed line
- [ ] Each region has seeds 1-16
- [ ] Verify abbreviations match what you want displayed in the bracket UI
- [ ] Region names must be one of: `east`, `west`, `south`, `midwest` (defined as a Postgres enum)

### First Four Matchups (also in `seed.ts`)

Update the First Four assignments in `buildGameSlots()` (lines 116-121) and the team assignment block (lines 297-323):

```ts
// Update which slots map to which First Four games
const firstFourSchedule = [
  { slot: 1, region: "midwest", next: 5, pos: "top", date: "..." },
  { slot: 2, region: "south", next: 6, pos: "top", date: "..." },
  { slot: 3, region: "west", next: 17, pos: "bottom", date: "..." },
  { slot: 4, region: "midwest", next: 21, pos: "bottom", date: "..." },
];
```

**For each First Four game, you need to update:**
- [ ] `region` -- which region this play-in feeds into
- [ ] `next` -- which First Round game slot the winner advances to (depends on which seed matchup the play-in replaces)
- [ ] `pos` -- whether the winner fills the `top` or `bottom` slot of the First Round game
- [ ] The hardcoded team name lookups (e.g., `dbTeams.find((t) => t.name === "Howard")`)

**Important:** The `next` and `pos` values connect First Four winners to their First Round game. The standard bracket seeding order per region is: 1v16, 8v9, 5v12, 4v13, 6v11, 3v14, 7v10, 2v15 (game indices 0-7). First Four games for 16-seeds feed into the 1v16 game (index 0); First Four games for 11-seeds feed into the 6v11 game (index 4). Calculate the target game_slot based on which region and which matchup index.

---

## 3. Game Schedule Dates (`src/db/seed.ts`)

Update all `scheduled_at` dates in `buildGameSlots()`. These are the approximate tip-off times per round:

| Round | Lines | Typical Dates |
|-------|-------|---------------|
| First Four | 117-120 | Tue-Wed before first round |
| First Round (games 0-3) | 146 | Thursday |
| First Round (games 4-7) | 146 | Friday |
| Second Round (games 0-1) | 162 | Saturday |
| Second Round (games 2-3) | 162 | Sunday |
| Sweet 16 | 178 | Thursday/Friday of week 2 |
| Elite Eight | 193 | Saturday/Sunday of week 2 |
| Final Four | 205, 214 | Saturday of Final Four weekend |
| Championship | 225 | Monday night |

**Checklist:**
- [ ] All dates use ISO 8601 format with UTC timezone: `"2027-03-18T18:00:00Z"`
- [ ] First Round dates line up with Thursday/Friday of the first weekend
- [ ] Sweet 16 and Elite Eight dates line up with the second weekend
- [ ] Final Four and Championship dates match the Final Four weekend (check NCAA schedule)

---

## 4. Tournament Config (`src/db/seed.ts`)

Update the tournament config insert (lines 338-358):

```ts
await supabase.from("tournament_config").insert({
  id: 1,
  year: 2027,  // <-- new year
  bracket_lock_deadline: "2027-03-18T12:00:00Z",  // <-- before first First Round game
  wager_creation_deadline: "2027-03-18T12:00:00Z", // <-- same or similar
  scoring_multipliers: { ... },  // usually unchanged
  active_phase: "pre_tournament",
});
```

**Checklist:**
- [ ] `year` matches the new tournament year
- [ ] `bracket_lock_deadline` is set to just before the first First Round tip-off (not the First Four -- users can still pick during play-in games)
- [ ] `wager_creation_deadline` matches or is slightly before the bracket lock
- [ ] `active_phase` starts as `"pre_tournament"`
- [ ] `scoring_multipliers` only need changing if you want to adjust point values

---

## 5. ESPN Integration

**Usually nothing to change.** The ESPN API integration is generic:

- URL: `https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard?dates=YYYYMMDD&groups=100`
- `groups=100` is the NCAA tournament filter -- this stays the same every year
- No API key required
- Games are matched by `espn_game_id` or auto-discovered by matching team ESPN IDs

**One thing to verify:**
- [ ] ESPN API endpoint hasn't changed (test with a known date from the new tournament)
- [ ] If you populated `espn_id` on teams, those IDs carry over year to year for the same school. New tournament teams that weren't in last year's data will need their ESPN team IDs looked up.

**ESPN team IDs** can be found at: `https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/teams/{TEAM_ID}`

The `espn_id` field on teams is optional -- the cron job can auto-discover game matches -- but having them pre-populated speeds up the first score sync.

---

## 6. Odds / Probabilities (`src/lib/odds.ts`)

This file contains hardcoded championship odds for every team. **It must be completely replaced each year.**

**Checklist:**
- [ ] Replace the entire `CHAMPIONSHIP_ODDS` record with new pre-tournament odds
- [ ] Every team name must exactly match the `name` field in the `teams` array from `seed.ts`
- [ ] All 68 teams should have an entry (default fallback is 0.1% for unlisted teams)
- [ ] Update the source comment at the top of the file
- [ ] Values are implied win probabilities as percentages (e.g., `23.3` means 23.3%)

---

## 7. Hardcoded Year References

The year "2026" appears in several display-only locations. Search and replace:

| File | What to update |
|------|---------------|
| `src/app/page.tsx` | Hero section title ("2026" in the heading) |
| `src/app/layout.tsx` | Meta description ("2026 NCAA Tournament") |
| `src/components/layout/Footer.tsx` | Footer text ("MARCH MADNESS 2026") |
| `src/remotion/DunkAnimation.tsx` | Hero animation title overlay ("MARCH MADNESS 2026") |
| `CLAUDE.md` | Project overview and currentDate references |

**Quick find:** `grep -r "2026" src/` will catch all of them.

---

## 8. Environment Variables

Environment variables in `.env.local` are generally stable year to year. Review:

- [ ] `NEXT_PUBLIC_SUPABASE_URL` -- same unless you created a new Supabase project
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY` -- same unless new project
- [ ] `SUPABASE_SERVICE_ROLE_KEY` -- same unless new project
- [ ] `DATABASE_URL` -- same unless new project
- [ ] `CRON_SECRET` -- consider rotating for security
- [ ] `ADMIN_EMAILS` -- update if admin users changed
- [ ] `VAPID keys` -- reusable across years (only regenerate if compromised)
- [ ] `TWILIO_*` / `RESEND_API_KEY` -- only if you set up SMS/email notifications

---

## 9. Deployment Checklist

Run through this in order:

### Pre-Tournament Setup
- [ ] Update all files listed above (seed.ts, odds.ts, year references)
- [ ] Run database reset SQL (Section 1)
- [ ] Run `npm run db:seed` to populate teams, games, and config
- [ ] Verify seed data: check team count (68), game count (67), config year
- [ ] Open the app locally (`npm run dev`) and confirm the bracket renders correctly
- [ ] Test that all 4 regions display with correct teams and seeds
- [ ] Test that First Four games show the right matchups
- [ ] Verify bracket lock deadline displays correctly in the UI

### ESPN Integration Smoke Test
- [ ] Wait until Selection Sunday / the day teams are announced
- [ ] Check that the ESPN API returns tournament games: `curl "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard?dates=YYYYMMDD&groups=100"` (use a First Four date)
- [ ] Optionally populate `espn_id` on teams for faster auto-discovery

### Deploy
- [ ] `npm run build` -- ensure no build errors
- [ ] Deploy to your hosting platform (Vercel, etc.)
- [ ] Run `npm run db:seed` against production database (set env vars accordingly)
- [ ] Test the cron endpoint: `curl -H "Authorization: Bearer $CRON_SECRET" https://your-domain/api/cron/update-scores`
- [ ] Set up cron schedule (every 2-5 minutes during game days)
- [ ] Send invite links to users

### During Tournament
- [ ] Monitor cron job logs for ESPN fetch failures
- [ ] Use the admin page for manual score entry if ESPN is down
- [ ] Check that `active_phase` advances correctly (update manually via Supabase dashboard if needed)

### Post-Tournament
- [ ] Resolve any outstanding wagers
- [ ] Export leaderboard results if desired
- [ ] Consider archiving bracket data before next year's reset

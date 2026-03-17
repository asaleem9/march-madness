# Comprehensive Test Plan — March Madness Bracket Challenge

This document defines the full test suite for the March Madness Bracket Challenge app. Tests are organized by layer (unit, integration, API, database, E2E) and module. Each test case includes the scenario, expected behavior, and relevant source file references.

**Test Framework**: Vitest (unit/integration) + Playwright (E2E) + Supabase local dev (database)

---

## Table of Contents

1. [Unit Tests](#1-unit-tests)
   - [1.1 Scoring Engine](#11-scoring-engine)
   - [1.2 Utility Functions](#12-utility-functions)
   - [1.3 ESPN API Client](#13-espn-api-client)
   - [1.4 Notifications Library](#14-notifications-library)
   - [1.5 Bracket Store (Zustand)](#15-bracket-store-zustand)
2. [API Route Tests](#2-api-route-tests)
   - [2.1 Brackets API](#21-brackets-api)
   - [2.2 Wagers API](#22-wagers-api)
   - [2.3 Cron Update Scores](#23-cron-update-scores)
   - [2.4 Notification Batch Send](#24-notification-batch-send)
   - [2.5 Push Subscription](#25-push-subscription)
   - [2.6 Admin Scores](#26-admin-scores)
   - [2.7 Admin Config](#27-admin-config)
   - [2.8 VAPID Key Endpoint](#28-vapid-key-endpoint)
3. [Database & Schema Tests](#3-database--schema-tests)
   - [3.1 Schema Integrity](#31-schema-integrity)
   - [3.2 RLS Policies](#32-rls-policies)
   - [3.3 Seed Script Validation](#33-seed-script-validation)
4. [Middleware Tests](#4-middleware-tests)
5. [Integration Tests](#5-integration-tests)
   - [5.1 Full Bracket Flow](#51-full-bracket-flow)
   - [5.2 Scoring Pipeline](#52-scoring-pipeline)
   - [5.3 Wager Lifecycle](#53-wager-lifecycle)
   - [5.4 Notification Pipeline](#54-notification-pipeline)
6. [Component Tests](#6-component-tests)
7. [E2E Tests](#7-e2e-tests)
8. [Performance & Load Tests](#8-performance--load-tests)
9. [Security Tests](#9-security-tests)
10. [Regression Tests](#10-regression-tests)

---

## 1. Unit Tests

### 1.1 Scoring Engine

**File under test**: `src/lib/scoring.ts`, `src/lib/utils.ts`

#### `getRoundPoints(round, multipliers)`

| # | Test Case | Input | Expected |
|---|-----------|-------|----------|
| 1 | First Four points are hardcoded at 5 | `round: "first_four"` | `5` |
| 2 | First Round uses multiplier | `round: "first_round", DEFAULT_SCORING` | `10` |
| 3 | Second Round uses multiplier | `round: "second_round"` | `20` |
| 4 | Sweet 16 uses multiplier | `round: "sweet_16"` | `40` |
| 5 | Elite Eight uses multiplier | `round: "elite_eight"` | `80` |
| 6 | Final Four uses multiplier | `round: "final_four"` | `160` |
| 7 | Championship uses multiplier | `round: "championship"` | `320` |
| 8 | Custom multipliers override defaults | `round: "first_round", { first_round: 25, ... }` | `25` |
| 9 | First Four ignores custom multipliers | `round: "first_four", { first_round: 999, ... }` | `5` |

#### `isUpset(winnerSeed, loserSeed)`

| # | Test Case | Input | Expected |
|---|-----------|-------|----------|
| 1 | Higher seed beating lower seed is an upset | `(12, 5)` | `true` |
| 2 | Lower seed beating higher seed is not an upset | `(1, 16)` | `false` |
| 3 | Same seed is not an upset | `(8, 8)` | `false` |
| 4 | One-seed difference is an upset | `(9, 8)` | `true` |

#### `calculatePickPoints(pick, multipliers)`

| # | Test Case | Expected |
|---|-----------|----------|
| 1 | Incorrect pick returns 0 points | `0` |
| 2 | Correct first round pick (no upset) returns base points | `10` |
| 3 | Correct upset pick applies 1.5x multiplier | `15` (10 * 1.5) |
| 4 | Correct championship pick | `320` |
| 5 | Correct championship upset pick | `480` (320 * 1.5) |
| 6 | First Four correct pick | `5` |
| 7 | First Four correct upset pick | `8` (Math.round(5 * 1.5)) |
| 8 | Elite Eight correct upset | `120` (80 * 1.5) |

#### `calculateBracketScore(picks, multipliers)`

| # | Test Case | Expected |
|---|-----------|----------|
| 1 | Empty picks array returns 0 | `0` |
| 2 | Single correct pick sums correctly | Base points for that round |
| 3 | Mix of correct/incorrect picks only counts correct | Sum of correct only |
| 4 | All rounds combined correctly | Sum of each round's points |
| 5 | All incorrect picks returns 0 | `0` |
| 6 | Multiple upsets stack correctly | Sum of individual upset-multiplied points |

#### `buildLeaderboard(entries)`

| # | Test Case | Expected |
|---|-----------|----------|
| 1 | Single entry gets rank 1 | `rank: 1` |
| 2 | Sorted descending by score | Higher score = lower rank number |
| 3 | Tied scores share the same rank | Two users at 100pts both get the same rank |
| 4 | Rank after tie jumps correctly | Scores [100, 80, 80, 50] → ranks [1, 2, 2, 4] |
| 5 | Three-way tie assigns same rank | Scores [100, 100, 100] → all rank 1 |
| 6 | Empty entries array returns empty | `[]` |
| 7 | All same score gives all rank 1 | 5 entries all score 50 → all rank 1 |

### 1.2 Utility Functions

**File under test**: `src/lib/utils.ts`

#### `formatDate(date)`

| # | Test Case | Input | Expected |
|---|-----------|-------|----------|
| 1 | Formats Date object | `new Date("2026-03-19")` | `"Mar 19, 2026"` |
| 2 | Formats ISO string | `"2026-03-19T12:00:00Z"` | `"Mar 19, 2026"` |

#### `formatTime(date)`

| # | Test Case | Expected |
|---|-----------|----------|
| 1 | Returns hour:minute format with timezone | Matches `\d{1,2}:\d{2}\s[AP]M\s\w+` |

#### `cn(...classes)`

| # | Test Case | Input | Expected |
|---|-----------|-------|----------|
| 1 | Joins multiple string classes | `("a", "b", "c")` | `"a b c"` |
| 2 | Filters out falsy values | `("a", false, "b", null, undefined)` | `"a b"` |
| 3 | Empty args returns empty string | `()` | `""` |

#### `ROUND_DISPLAY_NAMES`

| # | Test Case | Expected |
|---|-----------|----------|
| 1 | All 7 rounds have display names | Keys match Round type exactly |
| 2 | `first_four` → `"First Four"` | Verify mapping |
| 3 | `championship` → `"Championship"` | Verify mapping |

#### `REGION_DISPLAY_NAMES`

| # | Test Case | Expected |
|---|-----------|----------|
| 1 | All 4 regions have display names | `east`, `west`, `south`, `midwest` |

### 1.3 ESPN API Client

**File under test**: `src/lib/espn.ts`

#### `formatDateForESPN(date)`

| # | Test Case | Input | Expected |
|---|-----------|-------|----------|
| 1 | Formats standard date | `new Date(2026, 2, 19)` | `"20260319"` |
| 2 | Pads single-digit month | `new Date(2026, 0, 5)` | `"20260105"` |
| 3 | Pads single-digit day | `new Date(2026, 11, 1)` | `"20261201"` |

#### `parseGameStatus(state)`

| # | Test Case | Input | Expected |
|---|-----------|-------|----------|
| 1 | "post" maps to "final" | `"post"` | `"final"` |
| 2 | "in" maps to "in_progress" | `"in"` | `"in_progress"` |
| 3 | "pre" maps to "scheduled" | `"pre"` | `"scheduled"` |
| 4 | Unknown state maps to "scheduled" | `"unknown"` | `"scheduled"` |
| 5 | Empty string maps to "scheduled" | `""` | `"scheduled"` |

#### `fetchESPNScoreboard(date)` (mocked fetch)

| # | Test Case | Expected |
|---|-----------|----------|
| 1 | Successful response with valid data returns parsed result | Non-null ESPNScoreboard object |
| 2 | HTTP error (500) returns null | `null` |
| 3 | HTTP error (404) returns null | `null` |
| 4 | Malformed JSON (missing `events` field) returns null | `null` |
| 5 | Extra fields in response still pass validation | Parsed data returned (Zod strips extras) |
| 6 | Missing required nested field (no `status.type`) returns null | `null` |
| 7 | Network error (fetch throws) returns null | `null` |
| 8 | Empty events array is valid | `{ events: [] }` |
| 9 | Competitor without score field is valid (score is optional) | Parsed normally |
| 10 | Competitor without winner field is valid (winner is optional) | Parsed normally |

### 1.4 Notifications Library

**File under test**: `src/lib/notifications.ts`

#### `isInQuietHours(timezone)`

| # | Test Case | Expected |
|---|-----------|----------|
| 1 | 11pm in America/New_York is quiet hours | `true` |
| 2 | 3am in America/New_York is quiet hours | `true` |
| 3 | 10pm (22:00) in user's timezone is quiet hours | `true` |
| 4 | 8am (08:00) in user's timezone is NOT quiet hours | `false` |
| 5 | 12pm (noon) is NOT quiet hours | `false` |
| 6 | 9:59pm (21:59) is NOT quiet hours | `false` |
| 7 | Invalid timezone returns false (no crash) | `false` |
| 8 | Different timezone yields correct result | Verify America/Los_Angeles vs UTC boundary |

#### `getPreferredChannels(preferences)`

| # | Test Case | Input | Expected |
|---|-----------|-------|----------|
| 1 | All channels enabled | `{ push: true, sms: true, email: true }` | `["push", "sms", "email"]` |
| 2 | Only push enabled | `{ push: true, sms: false, email: false }` | `["push"]` |
| 3 | No channels enabled defaults to push | `{ push: false, sms: false, email: false }` | `["push"]` |
| 4 | Only SMS enabled | `{ push: false, sms: true, email: false }` | `["sms"]` |
| 5 | Push and email, no SMS | `{ push: true, sms: false, email: true }` | `["push", "email"]` |

#### `sendPushNotification(subscription, payload)` (mocked web-push)

| # | Test Case | Expected |
|---|-----------|----------|
| 1 | Successful send returns true | `true` |
| 2 | 410 Gone error returns false (stale subscription) | `false` |
| 3 | 404 error returns false | `false` |
| 4 | Other error returns false | `false` |
| 5 | Payload includes title, body, url | Verify JSON.stringify was called with correct payload |

#### `sendSMS(phone, message)` (mocked fetch)

| # | Test Case | Expected |
|---|-----------|----------|
| 1 | Missing Twilio config returns false with warning | `false` |
| 2 | Successful API response returns true | `true` |
| 3 | Failed API response returns false | `false` |
| 4 | Network error returns false | `false` |
| 5 | Basic auth header is correctly base64 encoded | Verify Authorization header |

#### `sendEmail(to, subject, body)` (mocked fetch)

| # | Test Case | Expected |
|---|-----------|----------|
| 1 | Missing Resend API key returns false with warning | `false` |
| 2 | Successful API response returns true | `true` |
| 3 | Failed API response returns false | `false` |
| 4 | Request body includes from, to, subject, text | Verify fetch body |

### 1.5 Bracket Store (Zustand)

**File under test**: `src/hooks/useBracket.ts`

#### `setPick(gameSlot, round, pickedTeamId)`

| # | Test Case | Expected |
|---|-----------|----------|
| 1 | Sets a new pick | `picks.get(slot)` has correct data |
| 2 | Overwrites existing pick for same slot | Only latest pick stored |
| 3 | Sets isDirty to true | `isDirty === true` |
| 4 | Preserves other picks when setting a new one | Other entries unchanged |

#### `removePick(gameSlot)`

| # | Test Case | Expected |
|---|-----------|----------|
| 1 | Removes existing pick | `picks.has(slot) === false` |
| 2 | No-op if slot doesn't exist (no crash) | Map unchanged |
| 3 | Sets isDirty to true | `isDirty === true` |

#### `clearDownstreamPicks(gameSlot, allGames)`

| # | Test Case | Expected |
|---|-----------|----------|
| 1 | Clears next game slot pick | Downstream pick removed |
| 2 | Clears recursively through multiple rounds | 3-level chain all cleared |
| 3 | Does not clear picks in unrelated branches | Sibling branch picks untouched |
| 4 | No-op if game has no nextGameSlot (championship) | No changes |
| 5 | Works with empty picks map (no crash) | Map still empty |

#### `findDownstreamSlots(gameSlot, allGames)` (internal, test via clearDownstreamPicks behavior)

| # | Test Case | Expected |
|---|-----------|----------|
| 1 | First Round game → returns Second Round, Sweet 16, Elite 8, Final Four, Championship slots | Correct chain |
| 2 | Sweet 16 game → returns Elite 8, Final Four, Championship | 3 downstream slots |
| 3 | Championship game → returns empty array | `[]` |
| 4 | Invalid gameSlot → returns empty array | `[]` |

#### `loadPicks(picks)`

| # | Test Case | Expected |
|---|-----------|----------|
| 1 | Loads array of picks into Map | Map size matches array length |
| 2 | Sets isDirty to false | `isDirty === false` |
| 3 | Replaces existing picks entirely | Old picks gone, new picks present |

#### `setBracketName(name)`

| # | Test Case | Expected |
|---|-----------|----------|
| 1 | Updates bracket name | `bracketName === "New Name"` |
| 2 | Sets isDirty to true | `isDirty === true` |

#### `reset()`

| # | Test Case | Expected |
|---|-----------|----------|
| 1 | Clears all picks | `picks.size === 0` |
| 2 | Resets bracket name to default | `bracketName === "My Bracket"` |
| 3 | Sets isDirty to false | `isDirty === false` |

---

## 2. API Route Tests

All API tests use mocked Supabase clients. Test both successful and error paths.

### 2.1 Brackets API

**File**: `src/app/api/brackets/route.ts`

#### POST — Create Bracket

| # | Test Case | Expected Status | Expected Behavior |
|---|-----------|----------------|-------------------|
| 1 | Unauthenticated user | 401 | `{ error: "Unauthorized" }` |
| 2 | After deadline | 403 | `{ error: "Bracket submission deadline has passed" }` |
| 3 | First bracket auto-marked primary | 200 | `is_primary: true` |
| 4 | Second bracket auto-marked non-primary | 200 | `is_primary: false` (first is already primary) |
| 5 | Bracket with no picks (empty array) | 200 | Bracket created, no picks inserted |
| 6 | Bracket with valid picks | 200 | `{ bracketId: "..." }` |
| 7 | Picks insert fails → bracket rolled back | 500 | Bracket deleted, error returned |
| 8 | Default name used when none provided | 200 | Name is `"My Bracket"` |
| 9 | Custom name preserved | 200 | Name matches input |

#### PUT — Update Bracket

| # | Test Case | Expected Status | Expected Behavior |
|---|-----------|----------------|-------------------|
| 1 | Unauthenticated user | 401 | Unauthorized |
| 2 | Non-owner tries to update | 404 | `{ error: "Not found" }` |
| 3 | Locked bracket | 403 | `{ error: "Bracket is locked" }` |
| 4 | After deadline | 403 | Deadline error |
| 5 | Update name only (no picks) | 200 | Name updated, picks unchanged |
| 6 | Replace all picks | 200 | Old picks deleted, new picks inserted |
| 7 | Picks insert fails on update | 500 | Error returned (picks in inconsistent state — note: this is a potential issue) |

### 2.2 Wagers API

**File**: `src/app/api/wagers/route.ts`

#### POST — Create Wager

| # | Test Case | Expected Status | Expected Behavior |
|---|-----------|----------------|-------------------|
| 1 | Unauthenticated user | 401 | Unauthorized |
| 2 | Missing required fields (no opponent_id) | 400 | Missing fields error |
| 3 | Missing required fields (no stakes) | 400 | Missing fields error |
| 4 | After wager creation deadline | 403 | Deadline error |
| 5 | Bracket doesn't belong to challenger | 400 | `{ error: "Invalid bracket" }` |
| 6 | Valid wager creation | 200 | `{ wagerId: "..." }` |
| 7 | Notification queued for opponent | — | `notification_queue` has `wager_request` entry |
| 8 | Challenger can't wager themselves | — | Should be validated (note: not currently validated) |

#### PATCH — Accept/Decline Wager

| # | Test Case | Expected Status | Expected Behavior |
|---|-----------|----------------|-------------------|
| 1 | Unauthenticated user | 401 | Unauthorized |
| 2 | Wager not found | 404 | Not found |
| 3 | User is not the opponent | 404 | Not found (opponent_id mismatch) |
| 4 | Wager already accepted | 400 | `{ error: "Wager already responded to" }` |
| 5 | Wager already declined | 400 | Already responded |
| 6 | Accept with bracket_id | 200 | Status → `"accepted"`, bracket set |
| 7 | Accept without bracket_id | 200 | Status → `"accepted"`, bracket_id null |
| 8 | Decline wager | 200 | Status → `"declined"` |
| 9 | Challenger cannot accept own wager | 404 | opponent_id check fails |

### 2.3 Cron Update Scores

**File**: `src/app/api/cron/update-scores/route.ts`

#### GET — Cron Endpoint

| # | Test Case | Expected Status | Expected Behavior |
|---|-----------|----------------|-------------------|
| 1 | Missing auth header | 401 | Unauthorized |
| 2 | Wrong CRON_SECRET | 401 | Unauthorized |
| 3 | ESPN fetch fails | 200 | `{ message: "ESPN fetch failed, will retry next cycle" }` |
| 4 | No matching games in DB | 200 | `gamesUpdated: 0` |
| 5 | Game score updates (in_progress) | 200 | scores updated, no winner processing |
| 6 | Game goes final → winner set | 200 | winner_id updated |
| 7 | Loser team marked eliminated | — | `teams.eliminated = true` for loser |
| 8 | Winner advanced to next game slot | — | Next game's team_a_id or team_b_id set |
| 9 | Slot position "top" → updates team_a_id | — | Correct field updated |
| 10 | Slot position "bottom" → updates team_b_id | — | Correct field updated |
| 11 | Bracket picks evaluated correctly (correct pick) | — | `is_correct: true`, points assigned |
| 12 | Bracket picks evaluated correctly (incorrect pick) | — | `is_correct: false`, points: 0 |
| 13 | Upset bonus applied to correct upset pick | — | Points = base * 1.5 |
| 14 | Bracket scores recalculated | — | brackets.score updated |
| 15 | Notifications queued for affected users | — | notification_queue entries created |
| 16 | Idempotent: running twice doesn't create duplicate entries | — | Same results on re-run |
| 17 | Game already final not re-processed | — | `game.status !== "final"` guard prevents re-processing |
| 18 | Batch key format is correct | — | `"YYYYMMDD-afternoon"` or `"YYYYMMDD-evening"` |
| 19 | Championship game (no next_game_slot) doesn't error | — | No advance attempted |

### 2.4 Notification Batch Send

**File**: `src/app/api/notifications/send-batch/route.ts`

| # | Test Case | Expected Status | Expected Behavior |
|---|-----------|----------------|-------------------|
| 1 | Missing auth header | 401 | Unauthorized |
| 2 | Wrong CRON_SECRET | 401 | Unauthorized |
| 3 | No pending notifications | 200 | `{ message: "No pending notifications" }` |
| 4 | Groups by user_id + batch_key | — | Separate batches for different users |
| 5 | Quiet hours → notifications skipped | 200 | `skipped` count incremented |
| 6 | Rate limit (3/day) → excess skipped | 200 | 4th notification blocked |
| 7 | Game results message format | — | `"X game(s) decided..."` |
| 8 | Wager notifications included in message | — | `"You have X wager update(s)."` |
| 9 | Combined game + wager message | — | Both parts present |
| 10 | Push channel: sends notification, logs success | — | `notifications_log` entry with channel "push" |
| 11 | Push channel: stale subscription cleaned up (410) | — | `push_subscriptions` entry deleted |
| 12 | SMS channel: sends to profile.phone | — | sendSMS called with correct phone |
| 13 | SMS channel: no phone number → skip | — | sendSMS not called |
| 14 | Email channel: fetches user email from auth | — | sendEmail called with user email |
| 15 | Queue items marked as sent | — | `sent: true` on all processed items |
| 16 | No profile found → skip batch | — | Silently skipped |
| 17 | Default preferences when null (push fallback) | — | Push used as default |

### 2.5 Push Subscription

**File**: `src/app/api/notifications/subscribe/route.ts`

| # | Test Case | Expected Status | Expected Behavior |
|---|-----------|----------------|-------------------|
| 1 | Unauthenticated user | 401 | Unauthorized |
| 2 | Valid subscription upserted | 200 | `{ success: true }` |
| 3 | Replaces existing subscription (same user_id) | 200 | Upsert on conflict |
| 4 | Supabase error on insert | 500 | Error returned |

### 2.6 Admin Scores

**File**: `src/app/api/admin/scores/route.ts`

| # | Test Case | Expected Status | Expected Behavior |
|---|-----------|----------------|-------------------|
| 1 | Non-admin user | 403 | Forbidden |
| 2 | Unauthenticated user | 403 | Forbidden |
| 3 | Admin submits score without winner (in_progress) | 200 | Scores updated, no downstream processing |
| 4 | Admin submits final result with winner | 200 | Full processing: eliminate loser, advance winner, evaluate picks, recalculate scores |
| 5 | Winner advancement follows slot_position | — | Correct field (team_a_id/team_b_id) updated |
| 6 | Bracket picks updated with is_correct and points | — | Same logic as cron endpoint |
| 7 | Admin email check: multiple admins in comma-separated env var | 200 | Any listed email is valid |
| 8 | Admin email not in list | 403 | Forbidden |

### 2.7 Admin Config

**File**: `src/app/api/admin/config/route.ts`

| # | Test Case | Expected Status | Expected Behavior |
|---|-----------|----------------|-------------------|
| 1 | GET: non-admin → 403 | 403 | Forbidden |
| 2 | GET: admin receives tournament config | 200 | Full config object |
| 3 | PUT: non-admin → 403 | 403 | Forbidden |
| 4 | PUT: admin updates bracket_lock_deadline | 200 | Deadline updated |
| 5 | PUT: admin updates active_phase | 200 | Phase updated |
| 6 | PUT: admin sends empty body | 200 | No-op (no error, just updates nothing) |
| 7 | PUT: Supabase error | 500 | Error returned |

### 2.8 VAPID Key Endpoint

**File**: `src/app/api/notifications/vapid-key/route.ts`

| # | Test Case | Expected Status | Expected Behavior |
|---|-----------|----------------|-------------------|
| 1 | Returns public VAPID key | 200 | `{ publicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY }` |

---

## 3. Database & Schema Tests

### 3.1 Schema Integrity

**File**: `src/db/schema.ts`, `supabase/migrations/00001_initial_schema.sql`

| # | Test Case | Expected |
|---|-----------|----------|
| 1 | All 11 tables exist | profiles, push_subscriptions, teams, games, brackets, bracket_picks, wagers, user_achievements, notification_queue, notifications_log, tournament_config |
| 2 | All enums have correct values | region (4), round (7), game_status (3), slot_position (2), wager_status (4), achievement_type (5), notification_type (4), notification_channel (3), tournament_phase (9) |
| 3 | profiles.id FK → auth.users | Cascade on delete |
| 4 | push_subscriptions.user_id is unique | Only one subscription per user |
| 5 | teams.region+seed index exists | `teams_region_seed_idx` |
| 6 | games.game_slot is unique | No duplicate game slots |
| 7 | bracket_picks (bracket_id, game_slot) unique constraint | `bracket_picks_bracket_game_unique` |
| 8 | user_achievements (user_id, achievement_type) unique constraint | `user_achievements_unique` |
| 9 | profiles.display_name is unique | Enforced at DB level |
| 10 | tournaments_config has singleton constraint (id=1) | Default 1, PK |
| 11 | brackets.score defaults to 0 | New bracket starts at 0 |
| 12 | bracket_picks.points_earned defaults to 0 | New pick starts at 0 |
| 13 | teams.eliminated defaults to false | New team not eliminated |
| 14 | notification_queue.sent defaults to false | New items unsent |
| 15 | Foreign key constraints prevent orphaned records | Insert pick for nonexistent bracket fails |
| 16 | Cascading FKs: deleting a profile cascades appropriately | Verify cascade behavior |

### 3.2 RLS Policies

Test these against the Supabase local dev instance with actual JWT-authenticated requests.

| # | Test Case | Expected |
|---|-----------|----------|
| 1 | Any authenticated user can SELECT from profiles | Allowed |
| 2 | User can only UPDATE their own profile | Other user's UPDATE → denied |
| 3 | push_subscriptions: user can only SELECT own records | Other user's records hidden |
| 4 | push_subscriptions: INSERT only for own user_id | Inserting for another user → denied |
| 5 | teams: authenticated users can SELECT | Allowed |
| 6 | teams: no user can INSERT/UPDATE/DELETE | Denied (service role only) |
| 7 | games: authenticated users can SELECT | Allowed |
| 8 | games: no user can UPDATE | Denied (service role only) |
| 9 | brackets: all authenticated users can SELECT (public leaderboard) | Allowed |
| 10 | brackets: INSERT only where user_id = auth.uid() | Allowed for own, denied for others |
| 11 | brackets: UPDATE only where user_id = auth.uid() AND not locked AND before deadline | Test all 3 conditions |
| 12 | bracket_picks: SELECT for all authenticated | Allowed |
| 13 | bracket_picks: INSERT/UPDATE only for own brackets | Denied for other user's bracket |
| 14 | wagers: SELECT only where user is challenger or opponent | Third party can't see |
| 15 | wagers: INSERT only where challenger_id = auth.uid() | Denied for impersonation |
| 16 | wagers: UPDATE constraints (opponent can accept/decline) | Verify role-based access |
| 17 | notification_queue: SELECT only own records | Other user's records hidden |
| 18 | notification_queue: no user INSERT (service role only) | Denied |
| 19 | tournament_config: SELECT for all, no user mutations | Verify |
| 20 | Bracket UPDATE denied after deadline passes | RLS check on server timestamp |

### 3.3 Seed Script Validation

**File**: `src/db/seed.ts`

| # | Test Case | Expected |
|---|-----------|----------|
| 1 | 72 teams inserted (68 unique + 4 First Four play-in pairs share seeds) | Verify count |
| 2 | Each region has correct number of standard teams | 16 per region (some shared seeds for First Four) |
| 3 | All 4 First Four matchups have correct team pairings | Slot 1: Howard vs UMBC, Slot 2: Lehigh vs PVAM, Slot 3: Texas vs NC State, Slot 4: SMU vs Miami Ohio |
| 4 | 67 game slots created (4 First Four + 32 First Round + 16 Second Round + 8 Sweet 16 + 4 Elite Eight + 2 Final Four + 1 Championship) | Verify count |
| 5 | First Round matchups follow standard seeding (1v16, 8v9, 5v12, 4v13, 6v11, 3v14, 7v10, 2v15) | Verify team_a/team_b for each |
| 6 | All next_game_slot references are valid | Every non-null next_game_slot points to an existing game_slot |
| 7 | Championship game has next_game_slot = null | Slot 67 |
| 8 | Final Four games both point to championship (slot 67) | Slots 65, 66 → 67 |
| 9 | slot_position alternates correctly within connected games | Top/bottom for each pair feeding the same next game |
| 10 | tournament_config has correct defaults | Year 2026, deadlines set, default scoring multipliers |
| 11 | First Four games connect to correct First Round games | Slot 1→5, Slot 2→6, Slot 3→17, Slot 4→21 |
| 12 | First Four teams NOT assigned to regular First Round games | Teams with record "First Four" excluded from standard seeding |
| 13 | No duplicate game_slot values | Unique constraint validated |
| 14 | Re-running seed fails gracefully (unique constraint violations) | Does not corrupt existing data |

---

## 4. Middleware Tests

**Files**: `src/middleware.ts`, `src/lib/supabase/middleware.ts`

| # | Test Case | Expected |
|---|-----------|----------|
| 1 | Unauthenticated access to `/dashboard` → redirect to `/login?redirect=/dashboard` | 302 redirect |
| 2 | Unauthenticated access to `/bracket/123` → redirect to `/login?redirect=/bracket/123` | 302 redirect |
| 3 | Unauthenticated access to `/wagers` → redirect to `/login?redirect=/wagers` | 302 redirect |
| 4 | Unauthenticated access to `/profile` → redirect to `/login?redirect=/profile` | 302 redirect |
| 5 | Unauthenticated access to `/admin` → redirect to `/login?redirect=/admin` | 302 redirect |
| 6 | Unauthenticated access to `/schedule` → redirect to `/login?redirect=/schedule` | 302 redirect |
| 7 | Unauthenticated access to `/` (landing page) → allowed | 200 |
| 8 | Unauthenticated access to `/login` → allowed | 200 |
| 9 | Authenticated access to `/login` → redirect to `/dashboard` | 302 redirect |
| 10 | Authenticated access to `/signup` → redirect to `/dashboard` | 302 redirect |
| 11 | Authenticated access to `/dashboard` → allowed | 200 |
| 12 | Static assets (`.svg`, `.png`, etc.) bypass middleware | Matched by `config.matcher` exclusion |
| 13 | `_next/static` requests bypass middleware | Excluded by matcher |
| 14 | Session cookies are refreshed on each request | `supabaseResponse` has updated cookies |
| 15 | Redirect URL preserves full pathname | `/bracket/abc-123/` included in redirect param |

---

## 5. Integration Tests

These tests require a running Supabase instance (local or test project) and exercise multiple modules together.

### 5.1 Full Bracket Flow

| # | Test Case | Expected |
|---|-----------|----------|
| 1 | User signs up → profile auto-created by trigger | Profile exists in `profiles` table |
| 2 | User creates bracket with all 63 picks | Bracket + 63 bracket_picks rows created |
| 3 | First bracket is automatically primary | `is_primary: true` |
| 4 | Second bracket is automatically non-primary | `is_primary: false` |
| 5 | Update bracket picks replaces all picks | Old picks gone, new picks present |
| 6 | Bracket creation after deadline is rejected (API level) | 403 |
| 7 | Bracket update after deadline is rejected | 403 |
| 8 | Locked bracket cannot be updated | 403 |
| 9 | Cascading pick: change Round 1 winner → downstream picks involving that team cleared | Client-side Zustand logic verified |
| 10 | View another user's bracket (read-only) | Can SELECT, cannot UPDATE |

### 5.2 Scoring Pipeline

| # | Test Case | Expected |
|---|-----------|----------|
| 1 | Game goes final → all bracket picks for that game evaluated | `is_correct` set for all picks |
| 2 | Correct pick earns base points for the round | points_earned matches round value |
| 3 | Upset correct pick earns 1.5x | points_earned = round * 1.5 |
| 4 | Incorrect pick earns 0 | points_earned = 0 |
| 5 | Bracket total score is sum of all evaluated picks | brackets.score matches sum |
| 6 | Leaderboard ordering updates after score recalculation | Higher score = higher rank |
| 7 | Multiple games going final in same cron cycle all processed | All game results reflected |
| 8 | Re-processing same game (idempotent) doesn't double-count | Score unchanged on second run |
| 9 | Winner is correctly advanced to next game slot | Next game has winner in correct position |
| 10 | Loser team marked as eliminated | `teams.eliminated = true` |
| 11 | Championship winner: no advancement attempted (null next_game_slot) | No error |

### 5.3 Wager Lifecycle

| # | Test Case | Expected |
|---|-----------|----------|
| 1 | Challenger creates wager with valid bracket and stakes | Wager in `pending` status |
| 2 | Opponent receives notification in queue | `notification_queue` entry with type `wager_request` |
| 3 | Opponent accepts with their bracket | Status → `accepted`, opponent_bracket_id set |
| 4 | Opponent declines | Status → `declined` |
| 5 | Challenger cannot respond to own wager | 404 (opponent_id mismatch) |
| 6 | Cannot respond to already-accepted wager | 400 |
| 7 | Cannot respond to already-declined wager | 400 |
| 8 | Wager creation after deadline rejected | 403 |
| 9 | Wager with non-owned bracket rejected | 400 |
| 10 | Multiple wagers between same users allowed | No unique constraint on user pairs |
| 11 | Tournament resolution: compare bracket scores to determine winner | Winner_id set correctly |

### 5.4 Notification Pipeline

| # | Test Case | Expected |
|---|-----------|----------|
| 1 | Game result queued → batch send processes it | Notification sent, queue marked sent |
| 2 | Multiple game results batched into single notification | Consolidated message |
| 3 | User in quiet hours → notification deferred (skipped this cycle) | Not sent, not marked as sent |
| 4 | User at rate limit (3/day) → notification skipped | Not sent, not marked as sent |
| 5 | Push notification 410 → subscription cleaned up | push_subscriptions row deleted |
| 6 | Fallback from push (failed) → SMS sent if enabled | SMS sent successfully |
| 7 | Digest-only preference → single daily notification | Only 1 notification per day |
| 8 | No preferred channels → defaults to push | Push used |
| 9 | Wager request notification sent to opponent | Notification received |
| 10 | Batch key correctly groups notifications from same session | Same batch_key grouped |

---

## 6. Component Tests

Use Vitest + React Testing Library.

### GameSlot Component

**File**: `src/components/bracket/GameSlot.tsx`

| # | Test Case | Expected |
|---|-----------|----------|
| 1 | Renders two TeamRow components for a matchup | Both team names visible |
| 2 | Shows seed badges for each team | Seed number displayed |
| 3 | Click on team row calls onPick callback | Callback fired with team ID |
| 4 | Selected team has `.selected` class | Green background |
| 5 | Correct pick has `.correct` class | Green with check indicator |
| 6 | Incorrect pick has `.incorrect` class | Red with strikethrough |
| 7 | Winner indicator shown on correct pick | Visual distinction |
| 8 | TBD team shows placeholder | "TBD" text or empty row |
| 9 | Read-only mode disables click | No callback on click |
| 10 | Score displayed when game is final | Score visible next to team names |

### BracketBuilder Component

**File**: `src/components/bracket/BracketBuilder.tsx`

| # | Test Case | Expected |
|---|-----------|----------|
| 1 | Renders all 4 region brackets | East, West, South, Midwest sections visible |
| 2 | Renders Final Four and Championship sections | Visible after regions |
| 3 | Save button triggers API call with all picks | POST or PUT called |
| 4 | Lock warning shown when approaching deadline | Warning text visible |
| 5 | Locked bracket shows read-only state | Save button disabled or hidden |
| 6 | Dirty state indicator when picks changed | Unsaved changes notice |
| 7 | Pick cascading: change Round 1 pick clears downstream | UI updates reflect cleared picks |

### Header Component

**File**: `src/components/layout/Header.tsx`

| # | Test Case | Expected |
|---|-----------|----------|
| 1 | Shows app title | "March Madness" text visible |
| 2 | Shows navigation links when logged in | Dashboard, Bracket, Leaderboard, etc. |
| 3 | Shows Login/Sign Up when logged out | Auth links visible |
| 4 | Logout button triggers sign out | Supabase signOut called |

### HeroDynamic Component

**File**: `src/components/HeroDynamic.tsx`

| # | Test Case | Expected |
|---|-----------|----------|
| 1 | Renders without SSR (dynamic import) | `ssr: false` prevents server render |
| 2 | Loading state shown before animation loads | Fallback visible |
| 3 | Remotion Player renders after load | Player component mounted |

---

## 7. E2E Tests

Use Playwright against a running dev server with Supabase local dev.

### Authentication Flow

| # | Test Case | Expected |
|---|-----------|----------|
| 1 | Sign up with email and password | Account created, redirected to dashboard |
| 2 | Login with valid credentials | Session established, redirected |
| 3 | Login with invalid credentials | Error message shown |
| 4 | Logout clears session | Redirected to landing page |
| 5 | OAuth redirect (Google) initiates flow | Redirect to Google consent screen |
| 6 | Protected page redirects to login | /dashboard → /login?redirect=/dashboard |
| 7 | After login, redirect back to original page | Returns to /dashboard after login |
| 8 | Already logged in user visiting /login → /dashboard | Auto-redirect |

### Bracket Builder Flow

| # | Test Case | Expected |
|---|-----------|----------|
| 1 | Navigate to /bracket/new | Bracket builder loads with all 68 teams |
| 2 | Click a team to pick winner | Team highlighted, advanced to next round |
| 3 | Pick all 63 winners through championship | Complete bracket filled |
| 4 | Change a first round pick → downstream picks clear | UI updates correctly |
| 5 | Save bracket | Success message, bracket persisted |
| 6 | View saved bracket at /bracket/[id] | All picks shown correctly |
| 7 | Edit existing bracket | Picks modifiable, save updates |
| 8 | Cannot edit after lock deadline | Save button disabled, message shown |
| 9 | View other user's bracket (read-only) | No edit controls |
| 10 | Mobile: horizontal scroll on bracket | Bracket scrollable on small viewport |

### Leaderboard Flow

| # | Test Case | Expected |
|---|-----------|----------|
| 1 | Leaderboard shows all users with primary brackets | Ranked list visible |
| 2 | Rankings ordered by score descending | Correct order |
| 3 | Tied users share rank | Same rank number |
| 4 | User avatars displayed | Images or placeholders shown |
| 5 | Clicking a user shows their bracket | Navigation to bracket view |

### Wager Flow

| # | Test Case | Expected |
|---|-----------|----------|
| 1 | Create new wager: select opponent, bracket, stakes | Wager created |
| 2 | Opponent sees pending wager notification | Notification visible |
| 3 | Opponent accepts wager | Status changes to accepted |
| 4 | Opponent declines wager | Status changes to declined |
| 5 | Wager dashboard shows pending/active/resolved tabs | Tab navigation works |
| 6 | Cannot create wager after deadline | Error message |

### Admin Flow

| # | Test Case | Expected |
|---|-----------|----------|
| 1 | Non-admin accessing /admin sees no admin controls | Page shows unauthorized or empty |
| 2 | Admin sees score entry form | Form visible |
| 3 | Admin enters score for a game | Score saved, picks/scores updated |
| 4 | Admin updates tournament config | Config changes reflected |

### Schedule Page

| # | Test Case | Expected |
|---|-----------|----------|
| 1 | Shows all games grouped by date/round | Organized display |
| 2 | Live games show in_progress indicator | Visual indicator |
| 3 | Final games show scores | Score visible |
| 4 | Scheduled games show time | Time displayed |

---

## 8. Performance & Load Tests

| # | Test Case | Expected |
|---|-----------|----------|
| 1 | Bracket builder renders 67 game slots under 2s | Performance within threshold |
| 2 | Leaderboard query for 50 users under 500ms | Query performance acceptable |
| 3 | Cron endpoint processes 16 games under 30s | Within Vercel function timeout |
| 4 | Batch notification processing for 50 users under 30s | Within function timeout |
| 5 | Concurrent bracket saves don't create duplicates | Unique constraint holds |
| 6 | Remotion Player lazy load doesn't block initial page render | LCP under 2.5s |
| 7 | Bundle size: main page JS under 200KB (gzipped) | Bundle analysis |
| 8 | Supabase Realtime handles 50 concurrent subscriptions | No connection drops |

---

## 9. Security Tests

| # | Test Case | Expected |
|---|-----------|----------|
| 1 | CRON_SECRET not exposed to client | Only server-side env var |
| 2 | SUPABASE_SERVICE_ROLE_KEY not exposed to client | Only NEXT_PUBLIC_ prefix vars client-accessible |
| 3 | VAPID_PRIVATE_KEY not exposed to client | Server-only |
| 4 | RLS prevents cross-user data access | User A cannot read User B's push subscriptions |
| 5 | Admin routes check email against allowlist | Non-admin gets 403 |
| 6 | Cron routes check Bearer token | Unauthenticated gets 401 |
| 7 | Bracket API validates user ownership before update | Other user's bracket → 404 |
| 8 | Wager API validates opponent_id on PATCH | Only actual opponent can respond |
| 9 | SQL injection via Supabase client prevented | Parameterized queries by default |
| 10 | XSS via display_name or bracket name sanitized | HTML escaped in rendering |
| 11 | CSRF protection via Supabase Auth (cookie + bearer) | Built-in protection |
| 12 | Admin config PUT: prevent injection of arbitrary columns | Only expected fields accepted |
| 13 | Push subscription endpoint validates subscription format | Malformed subscription handled |
| 14 | Rate limiting on auth endpoints | Supabase auth rate limits applied (30/5min) |

---

## 10. Regression Tests

These tests guard against specific bugs discovered or architectural decisions.

| # | Test Case | Risk | Expected |
|---|-----------|------|----------|
| 1 | `ssr: false` dynamic import for Remotion doesn't break on Server Components | Build error: can't use `ssr: false` in Server Component | HeroDynamic wrapper (use client) handles this |
| 2 | `web-push` lazy import doesn't crash at build time | VAPID key validation at import time | `getWebPush()` async function defers import |
| 3 | `useSearchParams()` in login page wrapped in Suspense | Next.js error without Suspense boundary | LoginForm extracted, Suspense wrapper in page |
| 4 | CSS `@import` order (Tailwind before Google Fonts) doesn't cause warnings | CSS spec violation | Google Fonts loaded via `<link>` in layout.tsx head |
| 5 | Placeholder Supabase URL format is valid URL | Build fails with `your_supabase_url` | Placeholder is `https://placeholder.supabase.co` |
| 6 | `currentPick.pickedTeamId !== teamId` (not `currentPick !== teamId`) | Type error: BracketPick is object not number | Object property comparison |
| 7 | Turbopack config present (no `webpack` config key) | Next.js 16 errors on webpack without turbopack | `turbopack: {}` in next.config.ts |
| 8 | `web-push` in serverExternalPackages | Build fails trying to bundle native modules | Listed in next.config.ts |
| 9 | Bracket PUT deletes then inserts picks (non-atomic) | Picks lost if insert fails after delete | Document as known risk, consider transaction |
| 10 | Self-wager not prevented at API level | User wagers against themselves | Add validation for `challenger_id !== opponent_id` |
| 11 | ESPN API response structure changes | Zod validation rejects, returns null gracefully | Fallback to admin manual entry |
| 12 | Stale Realtime subscription after tab sleep/wake | UI doesn't update after resuming | Client reconnection handling |
| 13 | Multiple admin emails parsed correctly from comma-separated env | Single email or multiple both work | Split and trim logic |
| 14 | Bracket lock deadline uses server time (not client) | Client clock manipulation | RLS policy uses `NOW()` (server-side) |
| 15 | Notification queue items without batch_key grouped under "default" | null batch_key handling | Falls back to `"default"` key |

---

## Test Infrastructure Setup

### Required Dependencies

```bash
npm install -D vitest @testing-library/react @testing-library/jest-dom @playwright/test jsdom msw
```

### Vitest Configuration

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

### Test File Structure

```
src/
  test/
    setup.ts                    # Global test setup
  lib/
    __tests__/
      scoring.test.ts           # §1.1
      utils.test.ts             # §1.2
      espn.test.ts              # §1.3
      notifications.test.ts     # §1.4
  hooks/
    __tests__/
      useBracket.test.ts        # §1.5
  app/
    api/
      brackets/__tests__/route.test.ts      # §2.1
      wagers/__tests__/route.test.ts        # §2.2
      cron/update-scores/__tests__/route.test.ts  # §2.3
      notifications/send-batch/__tests__/route.test.ts  # §2.4
      notifications/subscribe/__tests__/route.test.ts   # §2.5
      admin/scores/__tests__/route.test.ts   # §2.6
      admin/config/__tests__/route.test.ts   # §2.7
  components/
    bracket/__tests__/
      GameSlot.test.tsx         # §6
      BracketBuilder.test.tsx   # §6
    layout/__tests__/
      Header.test.tsx           # §6
  db/
    __tests__/
      seed.test.ts              # §3.3 (structural validation)
  middleware.test.ts            # §4
tests/
  e2e/
    auth.spec.ts                # §7
    bracket.spec.ts             # §7
    leaderboard.spec.ts         # §7
    wagers.spec.ts              # §7
    admin.spec.ts               # §7
    schedule.spec.ts            # §7
  integration/
    bracket-flow.test.ts        # §5.1
    scoring-pipeline.test.ts    # §5.2
    wager-lifecycle.test.ts     # §5.3
    notification-pipeline.test.ts  # §5.4
  security/
    rls-policies.test.ts        # §3.2
    env-exposure.test.ts        # §9
  performance/
    load.test.ts                # §8
```

### Running Tests

```bash
# Unit tests
npx vitest run

# Unit tests (watch mode)
npx vitest

# E2E tests (requires running dev server + Supabase local)
npx playwright test

# Specific test file
npx vitest run src/lib/__tests__/scoring.test.ts

# Coverage report
npx vitest run --coverage
```

---

## Priority Order for Implementation

1. **Unit tests** (§1) — Fastest to write, highest coverage/effort ratio
2. **API route tests** (§2) — Catch logic bugs before integration
3. **Middleware tests** (§4) — Auth protection is critical
4. **Regression tests** (§10) — Guard known pitfalls
5. **Database/RLS tests** (§3) — Data integrity and access control
6. **Integration tests** (§5) — Full pipeline validation
7. **Component tests** (§6) — UI correctness
8. **Security tests** (§9) — Protect user data
9. **E2E tests** (§7) — Full user journey validation
10. **Performance tests** (§8) — Ensure acceptable speed

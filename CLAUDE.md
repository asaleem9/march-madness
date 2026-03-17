# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

March Madness bracket prediction app for the 2026 NCAA tournament. Users create brackets, compete on leaderboards, wager against friends, and get live score updates. Retro sports aesthetic with Remotion-powered hero animation. Targeting <50 users on free-tier infrastructure.

## Commands

```bash
npm run dev              # Start Next.js dev server
npm run build            # Production build (Turbopack)
npm run lint             # ESLint
npm run db:generate      # Generate Drizzle migrations
npm run db:migrate       # Run Drizzle migrations
npm run db:seed          # Seed teams, game slots, tournament config
npm run generate-vapid   # Generate VAPID keys for Web Push
```

Database migrations are managed via Supabase CLI:
```bash
supabase db push --linked   # Push SQL migrations in supabase/migrations/
supabase config push        # Push config.toml (auth providers, etc.)
```

No test framework is configured yet.

## Architecture

**Next.js 16 App Router** full-stack app with **Supabase** (PostgreSQL + Auth + Realtime) and **Drizzle ORM**.

### Three Supabase Clients

This is the most important pattern in the codebase:

- **`src/lib/supabase/client.ts`** — Browser client. Uses `NEXT_PUBLIC_*` keys. For client components only.
- **`src/lib/supabase/server.ts`** — Server client. Reads cookies for user session. For server components and API routes that need the current user's context (respects RLS).
- **`src/lib/supabase/admin.ts`** — Service role client. **Bypasses RLS entirely.** Only use in cron jobs (`/api/cron/*`), admin API routes, and seed scripts.

### State Management

- **Zustand** (`src/hooks/useBracket.ts`) — Local bracket builder state. Stores picks as a `Map<gameSlot, BracketPick>`. Handles cascading pick clearing when upstream picks change.
- **TanStack Query** — Server data fetching/caching with 60s stale time. Invalidated by Supabase Realtime events.
- **Supabase Realtime** (`src/hooks/useRealtimeGames.ts`) — Listens to `games` table changes, triggers TanStack Query cache invalidation.

### Auth Flow

Middleware at `src/middleware.ts` protects routes (`/dashboard`, `/bracket/*`, `/wagers`, `/profile`, `/admin`, `/schedule`). Redirects unauthenticated users to `/login` with a redirect param. A database trigger auto-creates a `profiles` row when a new `auth.users` row is inserted.

### Bracket System

68 teams, 67 game slots numbered 1–67:
- **1–4**: First Four play-in games
- **5–36**: First Round (8 games × 4 regions)
- **37–52**: Second Round
- **53–60**: Sweet 16
- **61–64**: Elite Eight
- **65–66**: Final Four
- **67**: Championship

Each game has `next_game_slot` and `slot_position` (top/bottom) defining the bracket tree. When a game finishes, the winner advances to the next slot's `team_a_id` (top) or `team_b_id` (bottom).

### Scoring & Cron Pipeline

`/api/cron/update-scores` (secured with `CRON_SECRET` Bearer token):
1. Fetches ESPN scoreboard for today (`?dates=YYYYMMDD&groups=100`)
2. Matches games by `espn_game_id`, updates status/scores/winner
3. On game final: eliminates loser, advances winner to next game slot
4. Evaluates all bracket picks for that game: marks `is_correct`, calculates `points_earned` (with 1.5× upset bonus)
5. Recalculates aggregate bracket scores
6. Queues notifications with `batch_key` for grouping

Scoring is **idempotent** — safe to run repeatedly.

### Notification Pipeline

`/api/notifications/send-batch` processes the queue:
- Groups by `user_id + batch_key` into consolidated messages
- Enforces rate limit (3/day per user via `notifications_log`)
- Respects quiet hours (10pm–8am in user's timezone)
- Sends via user-preferred channels: Web Push, Twilio SMS, Resend email
- Cleans up stale push subscriptions on 410/404 responses

### Remotion Integration

The hero animation (`src/remotion/`) uses `@remotion/player` only (no server rendering). It's dynamically imported with `ssr: false` via a client component wrapper (`src/components/HeroDynamic.tsx`) because `next/dynamic` with `ssr: false` can't be used in Server Components.

## Database

Schema defined in two places:
- **`src/db/schema.ts`** — Drizzle ORM schema (TypeScript types)
- **`supabase/migrations/00001_initial_schema.sql`** — Raw SQL with RLS policies and triggers

RLS is enabled on all tables. Key policies:
- Teams/games/brackets/picks/achievements/config: readable by all authenticated users
- Brackets/picks: writable only by owner, only when unlocked and before deadline
- Wagers: visible only to challenger/opponent
- Admin mutations (game scores, team advancement): service role only

## Key Conventions

- **Retro theme**: Colors are `navy`, `burnt-orange`, `cream`, `gold`, `forest`. Fonts are "Press Start 2P" (headers) and "Space Mono" (body). CSS classes: `.retro-card`, `.retro-btn`, `.scoreboard-heading`, `.seed-badge`, `.game-slot`.
- **Admin access**: Gated by checking user email against `ADMIN_EMAILS` env var (comma-separated).
- **ESPN API**: Free, no auth. Zod-validated responses. Failures are logged and skipped (never corrupt local data). Admin page provides manual score entry fallback.
- **`web-push` module**: Must be lazy-imported (not top-level) because it validates VAPID keys at import time, which fails during build if env vars aren't set.

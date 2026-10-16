# Bracket Madness

A March Madness bracket prediction app for the NCAA tournament (ready for the 76-team 2027 field). Fill out your bracket, compete on leaderboards, place wagers against friends, and get live score updates — all in a retro sports aesthetic.

**Live at [bracketmadness.vercel.app](https://bracketmadness.vercel.app)**

## Features

- **Bracket Builder** — Pick all 63 winners from the Round of 64 to the title game (the 12 Opening Round play-ins resolve automatically) with an interactive bracket UI
- **Live Scores** — Real-time game updates via ESPN data and Supabase Realtime
- **Leaderboards** — See how your picks stack up against everyone else, with upset bonus scoring
- **Wagers** — Challenge friends to head-to-head bracket matchups
- **Notifications** — Get updates via Web Push, SMS, or email when your picks hit (or miss)
- **Retro Theme** — Press Start 2P headers, Space Mono body text, and a color palette straight out of an '80s sports bar

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Database**: Supabase (PostgreSQL + Auth + Realtime)
- **ORM**: Drizzle
- **State**: Zustand (bracket picks) + TanStack Query (server data)
- **Styling**: Tailwind CSS v4
- **Deployment**: Vercel

## Getting Started

```bash
# Install dependencies
npm install

# Set up environment variables (see .env.example)
cp .env.example .env.local

# Apply database migrations (Supabase CLI)
supabase db push --linked

# Start a season: wipe last year's tournament data and insert the config + bracket skeleton
npm run db:rollover -- --year 2027 --confirm

# Then, on Selection Sunday, use the admin page "Import from ESPN" (dry run first)

# Start dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the app.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server |
| `npm run build` | Production build |
| `npm run lint` | Run ESLint |
| `npm run db:generate` | Generate Drizzle migrations |
| `npm run db:migrate` | Run Drizzle migrations |
| `npm run db:rollover -- --year YYYY --confirm` | Wipe last season (keeps users, push subscriptions, waitlist), insert config + 75-slot skeleton |
| `npm run db:import-json -- --year YYYY a.json` | Manual fallback: build the bracket from saved ESPN scoreboard JSON |
| `npm run generate-vapid` | Generate VAPID keys for Web Push |
| `npm test` | Run tests |

## Environment variables

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase project (browser + server clients) |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role (cron, admin routes, scripts) |
| `DATABASE_URL` | Drizzle migrations |
| `CRON_SECRET` | Bearer token for `/api/cron/*` and admin operational endpoints; also set it as a **GitHub Actions repository secret** for `.github/workflows/tournament-cron.yml` |
| `ADMIN_EMAILS` | Comma-separated admin accounts |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Web Push (`npm run generate-vapid`) |
| `EMAIL_FROM` | Verified Resend sender, e.g. `March Madness <brackets@example.com>` |
| `RESEND_API_KEY` | Email notifications + waitlist announcements |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` | SMS notifications (optional) |

## Yearly operations

See `YEARLY_UPDATE_GUIDE.md` for the dated runbook (rollover, Selection Sunday import, lock deadline, post-tournament).

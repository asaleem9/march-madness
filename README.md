# Bracket Madness

A March Madness bracket prediction app for the 2026 NCAA tournament. Fill out your bracket, compete on leaderboards, place wagers against friends, and get live score updates — all in a retro sports aesthetic.

**Live at [bracketmadness.vercel.app](https://bracketmadness.vercel.app)**

## Features

- **Bracket Builder** — Pick winners across all 67 games (including First Four play-ins) with an interactive bracket UI
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
- **Animation**: Remotion (hero animation)
- **Deployment**: Vercel

## Getting Started

```bash
# Install dependencies
npm install

# Set up environment variables (see .env.example)
cp .env.example .env.local

# Run database migrations
npm run db:migrate

# Seed teams and tournament data
npm run db:seed

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
| `npm run db:seed` | Seed teams, game slots, config |
| `npm run generate-vapid` | Generate VAPID keys for Web Push |
| `npm test` | Run tests |

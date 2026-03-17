# 🏀 Bracket Madness

The only March Madness bracket app that looks like it was printed on a diner placemat in 1987.

**[bracketmadness.vercel.app](https://bracketmadness.vercel.app)**

## What is this?

A full-stack bracket prediction app for the 2026 NCAA tournament. Fill out your bracket, trash-talk your friends, place wagers, and watch your picks crumble in real time — all wrapped in a retro sports aesthetic that would make your dad's basement sports bar jealous.

### Features

- **Traditional NCAA bracket layout** — Four regions converging to the Final Four in the center, just like the paper bracket you used to fill out with a pen you borrowed from the office
- **Live score updates** — Pulls from ESPN's API so you can watch your bracket bust in real time
- **Friend wagers** — Because what's March Madness without a little friendly competition?
- **Leaderboards** — See who actually knows basketball vs. who just picked based on mascots
- **Push notifications** — Get alerted when your Cinderella pick pulls the upset (or when your #1 seed goes down in flames)
- **Retro UI** — Press Start 2P font, CRT scanlines, cardboard textures, and color palette straight out of a 1990s sports broadcast

## Tech Stack

- **Next.js 16** (App Router) + **TypeScript**
- **Supabase** — Postgres, Auth, Realtime subscriptions
- **Drizzle ORM** — Type-safe database queries
- **Zustand** — Local bracket state management
- **TanStack Query** — Server state with Realtime cache invalidation
- **Remotion** — Animated hero component
- **Tailwind CSS v4** — Styling

## Getting Started

```bash
npm install
npm run dev
```

You'll need a Supabase project and the following env vars — check `.env.example` for the full list.

```bash
npm run db:migrate    # Run migrations
npm run db:seed       # Seed teams & game slots
```

## Project Structure

```
src/
├── app/              # Next.js pages & API routes
├── components/       # UI components (bracket/, layout/, etc.)
├── db/               # Drizzle schema & migrations
├── hooks/            # Zustand stores, Realtime, TanStack Query
├── lib/              # Supabase clients, utils, odds engine
├── remotion/         # Hero animation composition
└── types/            # Shared TypeScript types
```

## License

MIT — go fill out a bracket.

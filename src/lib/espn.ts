import { z } from "zod/v4";

// Zod schemas for ESPN API response validation
const espnTeamSchema = z.object({
  id: z.string(),
  abbreviation: z.string(),
  displayName: z.string(),
  shortDisplayName: z.string(),
  seed: z.string().optional(),
  logo: z.string().optional(),
});

const espnCompetitorSchema = z.object({
  id: z.string(),
  team: espnTeamSchema,
  score: z.string().optional(),
  winner: z.boolean().optional(),
  seed: z.string().optional(),
});

const espnStatusSchema = z.object({
  type: z.object({
    id: z.string(),
    name: z.string(),
    state: z.string(),
    completed: z.boolean(),
    description: z.string(),
  }),
});

const espnCompetitionSchema = z.object({
  id: z.string(),
  date: z.string(),
  competitors: z.array(espnCompetitorSchema),
  status: espnStatusSchema,
});

const espnEventSchema = z.object({
  id: z.string(),
  date: z.string(),
  name: z.string(),
  shortName: z.string(),
  competitions: z.array(espnCompetitionSchema),
});

const espnScoreboardSchema = z.object({
  events: z.array(espnEventSchema),
});

export type ESPNScoreboard = z.infer<typeof espnScoreboardSchema>;
export type ESPNEvent = z.infer<typeof espnEventSchema>;

export async function fetchESPNScoreboard(
  date: string
): Promise<ESPNScoreboard | null> {
  const url = `https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard?dates=${date}&groups=100`;

  try {
    const response = await fetch(url, { next: { revalidate: 0 } });

    if (!response.ok) {
      console.error(`ESPN API returned ${response.status}`);
      return null;
    }

    const data = await response.json();
    const parsed = espnScoreboardSchema.safeParse(data);

    if (!parsed.success) {
      console.error("ESPN response failed validation:", parsed.error);
      return null;
    }

    return parsed.data;
  } catch (error) {
    console.error("Failed to fetch ESPN scoreboard:", error);
    return null;
  }
}

export function parseGameStatus(
  state: string
): "scheduled" | "in_progress" | "final" {
  switch (state) {
    case "post":
      return "final";
    case "in":
      return "in_progress";
    default:
      return "scheduled";
  }
}

export function formatDateForESPN(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

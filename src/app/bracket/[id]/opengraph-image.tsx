import { ImageResponse } from "next/og";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { brackets } from "@/db/schema";
import { getTournamentConfig } from "@/lib/tournament";

export const runtime = "nodejs";
export const alt = "March Madness bracket";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const NAVY = "#1a1a2e";
const CREAM = "#f5f0e1";
const GOLD = "#d4a843";
const ORANGE = "#d62b4c";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let name = "Bracket";
  let owner = "";
  let score = 0;
  let year: number | null = null;

  if (UUID_RE.test(id)) {
    try {
      const [bracket, config] = await Promise.all([
        db.query.brackets.findFirst({
          columns: { name: true, score: true },
          where: eq(brackets.id, id),
          with: { user: { columns: { displayName: true } } },
        }),
        getTournamentConfig(),
      ]);
      year = config?.year ?? null;
      if (bracket) {
        name = bracket.name ?? name;
        score = bracket.score ?? 0;
        owner = bracket.user?.displayName ?? "";
      }
    } catch {
      // Fall through to the generic card — an OG image must never 500.
    }
  }

  const title = name.length > 36 ? `${name.slice(0, 35)}…` : name;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: NAVY,
          color: CREAM,
          padding: 64,
          fontFamily: "monospace",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 28,
                background: ORANGE,
                border: `6px solid ${GOLD}`,
                display: "flex",
              }}
            />
            <div style={{ fontSize: 30, letterSpacing: 4, color: GOLD, display: "flex" }}>
              MARCH MADNESS{year ? ` ${year}` : ""}
            </div>
          </div>
          <div
            style={{
              fontSize: 24,
              padding: "10px 22px",
              border: `4px solid ${GOLD}`,
              color: GOLD,
              display: "flex",
            }}
          >
            BRACKET
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ fontSize: 72, fontWeight: 700, lineHeight: 1.05, display: "flex" }}>{title}</div>
          <div style={{ fontSize: 34, color: "rgba(245,240,225,0.75)", display: "flex" }}>
            {owner ? `${owner}'s bracket` : "Shared bracket"}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              background: CREAM,
              color: NAVY,
              padding: "20px 32px",
              border: `6px solid ${GOLD}`,
              boxShadow: `12px 12px 0 ${GOLD}`,
            }}
          >
            <div style={{ fontSize: 22, letterSpacing: 3, display: "flex" }}>SCORE</div>
            <div style={{ fontSize: 80, fontWeight: 700, lineHeight: 1, display: "flex" }}>{score}</div>
          </div>
          <div style={{ fontSize: 26, color: "rgba(245,240,225,0.6)", display: "flex" }}>
            See every pick →
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}

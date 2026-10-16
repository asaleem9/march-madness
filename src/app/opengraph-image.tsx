import { ImageResponse } from "next/og";
import { getTournamentConfig } from "@/lib/tournament";

// Rendered on request so the year follows tournament_config without a redeploy.
export const dynamic = "force-dynamic";
export const alt = "March Madness Bracket Challenge";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const NAVY = "#1a1a2e";
const GOLD = "#d4a843";
const ORANGE = "#d62b4c";
const CREAM = "#f5f0e1";

export default async function OpenGraphImage() {
  const config = await getTournamentConfig();
  const year = config?.year ?? new Date().getFullYear();

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: NAVY,
          color: CREAM,
          fontFamily: "monospace",
          position: "relative",
        }}
      >
        {/* Court circle */}
        <div
          style={{
            position: "absolute",
            width: 520,
            height: 520,
            borderRadius: 260,
            border: `6px solid ${GOLD}`,
            opacity: 0.12,
          }}
        />
        <div
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            width: 6,
            background: GOLD,
            opacity: 0.12,
          }}
        />

        {/* Bracket frame */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            padding: "56px 96px",
            border: `6px solid ${GOLD}`,
            borderRadius: 8,
            background: "rgba(26, 26, 46, 0.85)",
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: 84,
              fontWeight: 700,
              letterSpacing: 6,
              color: GOLD,
              lineHeight: 1,
            }}
          >
            MARCH MADNESS
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 120,
              fontWeight: 700,
              color: ORANGE,
              lineHeight: 1.1,
              marginTop: 8,
            }}
          >
            {year}
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              marginTop: 24,
              fontSize: 40,
              letterSpacing: 8,
              color: CREAM,
            }}
          >
            <span style={{ color: GOLD, marginRight: 24 }}>·</span>
            BRACKET CHALLENGE
            <span style={{ color: GOLD, marginLeft: 24 }}>·</span>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            marginTop: 40,
            fontSize: 28,
            color: CREAM,
            opacity: 0.7,
            letterSpacing: 2,
          }}
        >
          Pick winners · Climb the leaderboard · Wager with friends
        </div>
      </div>
    ),
    { ...size }
  );
}

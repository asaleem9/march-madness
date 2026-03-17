"use client";

import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { RetroPlayer } from "./RetroPlayer";
import { RetroEffects } from "./RetroEffects";

export const DunkAnimation: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Basketball bounce animation
  const ballY = interpolate(
    frame,
    [0, 20, 40, 55, 70, 85],
    [200, 80, 200, 120, 60, -20],
    { extrapolateRight: "clamp" }
  );

  const ballX = interpolate(frame, [0, 90], [60, 340], {
    extrapolateRight: "clamp",
  });

  const ballScale = spring({
    frame: frame > 70 ? frame - 70 : 0,
    fps,
    config: { damping: 10, stiffness: 100 },
  });

  // Player running animation
  const playerX = interpolate(frame, [0, 60, 75], [20, 260, 300], {
    extrapolateRight: "clamp",
  });

  const playerJump = frame > 55
    ? interpolate(frame, [55, 70, 85], [0, -80, -40], {
        extrapolateRight: "clamp",
      })
    : 0;

  // Hoop position
  const hoopX = 340;
  const hoopY = 60;

  // Flash effect on dunk
  const flashOpacity = frame > 75 && frame < 82
    ? interpolate(frame, [75, 78, 82], [0, 0.5, 0], {
        extrapolateRight: "clamp",
      })
    : 0;

  // Score text
  const scoreScale = frame > 78
    ? spring({ frame: frame - 78, fps, config: { damping: 8, stiffness: 80 } })
    : 0;

  return (
    <AbsoluteFill style={{ backgroundColor: "#1a1a2e" }}>
      {/* Court floor */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 80,
          background: "linear-gradient(to bottom, #8B4513, #654321)",
          borderTop: "4px solid #d4a843",
        }}
      >
        {/* Court lines */}
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: 0,
            right: 0,
            height: 2,
            backgroundColor: "rgba(212, 168, 67, 0.3)",
          }}
        />
      </div>

      {/* Backboard */}
      <div
        style={{
          position: "absolute",
          left: hoopX + 20,
          top: hoopY - 30,
          width: 8,
          height: 80,
          backgroundColor: "#666",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: hoopX - 15,
          top: hoopY - 30,
          width: 50,
          height: 35,
          backgroundColor: "#fff",
          border: "3px solid #333",
        }}
      />

      {/* Rim */}
      <div
        style={{
          position: "absolute",
          left: hoopX - 20,
          top: hoopY + 5,
          width: 40,
          height: 6,
          backgroundColor: "#e94560",
          borderRadius: 3,
        }}
      />

      {/* Net (simple) */}
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: hoopX - 15 + i * 10,
            top: hoopY + 10,
            width: 2,
            height: 25,
            backgroundColor: "rgba(255,255,255,0.4)",
            transform: `rotate(${(i - 1.5) * 5}deg)`,
          }}
        />
      ))}

      {/* Basketball */}
      <div
        style={{
          position: "absolute",
          left: ballX,
          top: ballY,
          width: 20 * (1 + ballScale * 0.3),
          height: 20 * (1 + ballScale * 0.3),
          borderRadius: "50%",
          background: "radial-gradient(circle at 35% 35%, #ff8c42, #e94560)",
          border: "2px solid #333",
          transform: `rotate(${frame * 12}deg)`,
        }}
      >
        {/* Ball lines */}
        <div
          style={{
            position: "absolute",
            top: "48%",
            left: 0,
            right: 0,
            height: 1.5,
            backgroundColor: "#333",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: "48%",
            width: 1.5,
            backgroundColor: "#333",
          }}
        />
      </div>

      {/* Player */}
      <RetroPlayer x={playerX} y={160 + playerJump} frame={frame} />

      {/* Dunk flash */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundColor: "#d4a843",
          opacity: flashOpacity,
        }}
      />

      {/* Score text */}
      {scoreScale > 0 && (
        <div
          style={{
            position: "absolute",
            top: 30,
            left: 0,
            right: 0,
            textAlign: "center",
            fontFamily: "'Press Start 2P', monospace",
            fontSize: 24,
            color: "#d4a843",
            transform: `scale(${scoreScale})`,
            textShadow: "3px 3px 0 #e94560",
          }}
        >
          SLAM DUNK!
        </div>
      )}

      {/* Title at top */}
      <div
        style={{
          position: "absolute",
          top: 8,
          left: 0,
          right: 0,
          textAlign: "center",
          fontFamily: "'Press Start 2P', monospace",
          fontSize: 10,
          color: "#d4a843",
          letterSpacing: 2,
          opacity: frame < 75 ? 1 : 0.3,
        }}
      >
        MARCH MADNESS 2026
      </div>

      {/* CRT/Scanline overlay */}
      <RetroEffects />
    </AbsoluteFill>
  );
};

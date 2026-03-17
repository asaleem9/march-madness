"use client";

interface RetroPlayerProps {
  x: number;
  y: number;
  frame: number;
}

export const RetroPlayer: React.FC<RetroPlayerProps> = ({ x, y, frame }) => {
  const legPhase = Math.sin(frame * 0.5) > 0;
  const armPhase = frame > 55;

  return (
    <div style={{ position: "absolute", left: x, top: y }}>
      {/* Head */}
      <div
        style={{
          position: "absolute",
          left: 8,
          top: -40,
          width: 16,
          height: 16,
          backgroundColor: "#f5deb3",
          border: "2px solid #1a1a2e",
          borderRadius: 2,
        }}
      />
      {/* Jersey */}
      <div
        style={{
          position: "absolute",
          left: 4,
          top: -24,
          width: 24,
          height: 20,
          backgroundColor: "#e94560",
          border: "2px solid #1a1a2e",
          borderRadius: 2,
        }}
      />
      {/* Jersey number */}
      <div
        style={{
          position: "absolute",
          left: 10,
          top: -20,
          fontFamily: "'Press Start 2P', monospace",
          fontSize: 8,
          color: "white",
        }}
      >
        23
      </div>
      {/* Shorts */}
      <div
        style={{
          position: "absolute",
          left: 6,
          top: -4,
          width: 20,
          height: 12,
          backgroundColor: "white",
          border: "2px solid #1a1a2e",
          borderRadius: 2,
        }}
      />
      {/* Left arm */}
      <div
        style={{
          position: "absolute",
          left: -6,
          top: armPhase ? -36 : -18,
          width: 10,
          height: 6,
          backgroundColor: "#f5deb3",
          border: "2px solid #1a1a2e",
          transform: armPhase ? "rotate(-45deg)" : "rotate(0deg)",
        }}
      />
      {/* Right arm */}
      <div
        style={{
          position: "absolute",
          left: 28,
          top: armPhase ? -40 : -18,
          width: 10,
          height: 6,
          backgroundColor: "#f5deb3",
          border: "2px solid #1a1a2e",
          transform: armPhase ? "rotate(45deg)" : "rotate(0deg)",
        }}
      />
      {/* Left leg */}
      <div
        style={{
          position: "absolute",
          left: legPhase ? 4 : 10,
          top: 8,
          width: 8,
          height: 18,
          backgroundColor: "#f5deb3",
          border: "2px solid #1a1a2e",
          borderRadius: 2,
        }}
      />
      {/* Right leg */}
      <div
        style={{
          position: "absolute",
          left: legPhase ? 18 : 14,
          top: 8,
          width: 8,
          height: 18,
          backgroundColor: "#f5deb3",
          border: "2px solid #1a1a2e",
          borderRadius: 2,
        }}
      />
      {/* Left shoe */}
      <div
        style={{
          position: "absolute",
          left: legPhase ? 2 : 8,
          top: 26,
          width: 12,
          height: 6,
          backgroundColor: "#e94560",
          border: "2px solid #1a1a2e",
          borderRadius: 2,
        }}
      />
      {/* Right shoe */}
      <div
        style={{
          position: "absolute",
          left: legPhase ? 16 : 12,
          top: 26,
          width: 12,
          height: 6,
          backgroundColor: "#e94560",
          border: "2px solid #1a1a2e",
          borderRadius: 2,
        }}
      />
    </div>
  );
};

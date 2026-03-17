"use client";

export const RetroEffects: React.FC = () => {
  return (
    <>
      {/* Scanline overlay */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "repeating-linear-gradient(0deg, rgba(0,0,0,0.06), rgba(0,0,0,0.06) 1px, transparent 1px, transparent 3px)",
          pointerEvents: "none",
          zIndex: 10,
        }}
      />
      {/* Vignette */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.4) 100%)",
          pointerEvents: "none",
          zIndex: 11,
        }}
      />
      {/* Slight color aberration */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(90deg, rgba(233,69,96,0.02) 0%, transparent 50%, rgba(22,66,60,0.02) 100%)",
          pointerEvents: "none",
          zIndex: 12,
        }}
      />
    </>
  );
};

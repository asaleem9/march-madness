"use client";

import { Player } from "@remotion/player";
import { DunkAnimation } from "./DunkAnimation";

export default function DunkHero() {
  return (
    <div className="relative rounded-lg overflow-hidden border-4 border-gold">
      <div className="crt-effect">
        <Player
          component={DunkAnimation}
          durationInFrames={90}
          fps={30}
          compositionWidth={480}
          compositionHeight={300}
          style={{ width: "100%", aspectRatio: "480 / 300" }}
          loop
          autoPlay
          controls={false}
        />
      </div>
    </div>
  );
}

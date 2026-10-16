import type { MetadataRoute } from "next";

// A web app manifest is what lets iOS users "Add to Home Screen" and receive
// Web Push (Safari only delivers push to installed web apps).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "March Madness Bracket Challenge",
    short_name: "Brackets",
    description: "Fill out your bracket, compete with friends, and follow live scores.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#1a1a2e",
    theme_color: "#1a1a2e",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

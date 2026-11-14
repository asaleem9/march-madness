import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/utils";

/** The pages a signed-out visitor can read. Everything else sits behind a login. */
const PUBLIC_PATHS = ["/", "/leaderboard", "/schedule", "/scoring", "/login", "/signup"];

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_PATHS.map((path) => ({ url: `${SITE_URL}${path === "/" ? "" : path}` }));
}

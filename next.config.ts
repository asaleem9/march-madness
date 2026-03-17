import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
      },
      {
        protocol: "https",
        hostname: "a.espncdn.com",
      },
    ],
  },
  turbopack: {},
  serverExternalPackages: ["web-push"],
};

export default nextConfig;

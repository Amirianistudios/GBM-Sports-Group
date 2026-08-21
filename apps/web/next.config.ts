import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Provider-hosted player portraits. Stored as URLs by design, never
    // mirrored; next/image proxies + optimizes them. Anything else falls
    // back to the monogram in <PlayerPhoto>.
    remotePatterns: [
      { protocol: "https", hostname: "img.a.transfermarkt.technology" },
    ],
    // Portraits render at 40–120px; keep the generated size ladder small.
    imageSizes: [40, 48, 64, 96, 128, 160],
  },
};

export default nextConfig;

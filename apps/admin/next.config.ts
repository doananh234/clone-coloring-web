import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@vx/core-uikit", "@vx/auth-module", "@vx/coloring"],
  serverExternalPackages: ["pdfjs-dist", "@napi-rs/canvas", "canvas"],
  experimental: {
    serverActions: {
      bodySizeLimit: "500mb",
    },
    proxyClientMaxBodySize: "500mb",
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "image.lagroups.org",
      },
    ],
  },
  async rewrites() {
    // Upstream for the isolated /coloring surface. Defaults to the live deployment
    // so the new UI shows real data even when the local DB is unavailable. The
    // proxy avoids CORS (browser hits same-origin /coloring-api/*, Next forwards).
    const coloringUpstream = process.env.COLORING_API_UPSTREAM || "https://bookai.lagroups.org";
    // Image CDN doesn't send CORS headers, so client-side canvas work (cover
    // compose/export) taints. Proxy images same-origin so the canvas stays clean.
    const imgUpstream = process.env.COLORING_IMG_UPSTREAM || "https://image.lagroups.org";
    return [
      // Auth module calls /auth/* but API routes are at /api/auth/*
      { source: "/auth/:path*", destination: "/api/auth/:path*" },
      // Server-side proxy for the coloring surface (no CORS).
      { source: "/coloring-api/:path*", destination: `${coloringUpstream}/api/:path*` },
      // Same-origin image proxy for canvas compositing (cover editor).
      { source: "/coloring-img/:path*", destination: `${imgUpstream}/:path*` },
    ];
  },
};

export default nextConfig;

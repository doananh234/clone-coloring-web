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
    // Upstream for the isolated /coloring surface. Dev defaults to the live
    // deployment (local DB unavailable). On PROD the app IS the upstream, so we
    // set COLORING_API_UPSTREAM="" → rewrite to the RELATIVE /api (internal rewrite,
    // no external self-proxy hop). The self-proxy adds a Cloudflare round-trip that
    // times out at ~30s → 500 for slow AI routes (reproduce/redesign-page). Use ?? so
    // an explicit empty string is honored (means "same-origin"), unset → dev default.
    const coloringUpstream = process.env.COLORING_API_UPSTREAM ?? "https://bookai.lagroups.org";
    // Image CDN doesn't send CORS headers, so client-side canvas work (cover
    // compose/export) taints. Proxy images same-origin so the canvas stays clean.
    const imgUpstream = process.env.COLORING_IMG_UPSTREAM || "https://image.lagroups.org";
    return [
      // Auth module calls /auth/* but API routes are at /api/auth/*
      { source: "/auth/:path*", destination: "/api/auth/:path*" },
      // Server-side proxy for the coloring surface (no CORS). Empty upstream =
      // same-origin internal rewrite (prod) so slow AI routes don't hit a proxy timeout.
      { source: "/coloring-api/:path*", destination: coloringUpstream ? `${coloringUpstream}/api/:path*` : "/api/:path*" },
      // Same-origin image proxy for canvas compositing (cover editor).
      { source: "/coloring-img/:path*", destination: `${imgUpstream}/:path*` },
    ];
  },
};

export default nextConfig;

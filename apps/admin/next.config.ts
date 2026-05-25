import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@vx/core-uikit", "@vx/auth-module"],
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
    return [
      // Auth module calls /auth/* but API routes are at /api/auth/*
      { source: "/auth/:path*", destination: "/api/auth/:path*" },
    ];
  },
};

export default nextConfig;

// Client-safe text-overlay exports. Bundled by both server (Next.js API routes,
// worker) AND client (React components in apps/admin).
//
// Server-only bits (renderer + fonts loader) use Node built-ins (fs, path, os,
// @napi-rs/canvas) and would break browser bundling. They live at
// @vx/server-core/text-overlay/server — import from there in Node contexts.
export * from "./text-overlay-types";
export * from "./text-overlay-presets";
export * from "./blend-prompt";

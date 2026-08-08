import "dotenv/config";
import path from "node:path";
import { defineConfig } from "prisma/config";

// Migrated from the deprecated `package.json#prisma` block (removed in Prisma 7).
//
// A Prisma config file DISABLES Prisma's automatic `.env` loading, so we load it
// explicitly here to keep `prisma migrate`/`db seed`/`studio`/`db push` picking up
// DATABASE_URL + DIRECT_URL exactly as before. dotenv does not override variables
// already present in the environment (docker/CI/shell), so this is a no-op when
// they are already set, and loads a local `.env` (from the cwd, i.e. packages/db)
// when present.
export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  migrations: {
    // Replaces the old `package.json#prisma.seed`.
    seed: "tsx prisma/seed.ts",
  },
});

/**
 * The Firestore <-> Prisma sync mapping now lives in @vx/server-core/firestore
 * so it can be shared with the admin "sync one book" route (single source of
 * truth). This file re-exports it to keep the existing script imports stable.
 */
export * from "@vx/server-core/firestore";

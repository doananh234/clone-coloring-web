// Re-export the shared Prisma client as `db` to keep existing callers stable.
// The name `db` is preserved for compatibility with the previous Firestore module.
export { prisma as db } from "@vx/db";

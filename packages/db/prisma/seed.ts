import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const username = process.env.SEED_ADMIN_USERNAME;
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!username || !password) {
    console.warn("[seed] SEED_ADMIN_USERNAME / SEED_ADMIN_PASSWORD not set — skipping admin seed.");
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const operator = await prisma.operator.upsert({
    where: { username },
    update: {}, // never overwrite an existing admin's password on re-seed
    create: { username, name: "Administrator", role: "admin", passwordHash },
  });
  console.log(`[seed] admin operator ready: ${operator.username} (id=${operator.id})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

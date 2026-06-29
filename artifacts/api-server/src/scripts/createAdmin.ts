import { db } from "@workspace/db";
import { adminsTable } from "@workspace/db";
import bcrypt from "bcryptjs";

async function main() {
  const name = process.argv[2];
  const phone = process.argv[3];
  const password = process.argv[4];

  if (!name || !phone || !password) {
    console.error("Usage: tsx src/scripts/createAdmin.ts <name> <phone> <password>");
    process.exit(1);
  }

  if (!/^\d{10}$/.test(phone)) {
    console.error("Phone must be exactly 10 digits");
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 12);

  await db.insert(adminsTable).values({ name, phone, passwordHash });

  console.log(`✅ Admin created: ${name} (${phone})`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
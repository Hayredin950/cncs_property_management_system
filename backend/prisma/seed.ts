import { Role, Condition } from "@prisma/client";
import { prisma } from "../src/lib/prisma.js";
import argon2 from "argon2";
import { generateTagQR } from "../src/utils/qrGenerator.js";


const SEED_USERS = {
  admin: { email: "admin@cncs.aau.edu.et", password: "Admin123!" },
  staff: { email: "staff@cncs.aau.edu.et", password: "Staff123!" },
};

async function main() {
  console.log("Seeding categories...");
  const categoryNames = ["Electronics", "Furniture", "Lab Equipment", "Vehicles", "Office Supplies"];
  const categories = await Promise.all(
    categoryNames.map((name) =>
      prisma.category.upsert({
        where: { name },
        update: {},
        create: { name },
      })
    )
  );
  const byName = Object.fromEntries(categories.map((c) => [c.name, c]));

  console.log("Seeding users...");
  const admin = await prisma.user.upsert({
    where: { email: SEED_USERS.admin.email },
    update: {},
    create: {
      fullName: "System Admin",
      email: SEED_USERS.admin.email,
      passwordHash: await argon2.hash(SEED_USERS.admin.password, { type: argon2.argon2id }),
      role: Role.ADMIN,
    },
  });

  const staff = await prisma.user.upsert({
    where: { email: SEED_USERS.staff.email },
    update: {},
    create: {
      fullName: "Demo Staff",
      email: SEED_USERS.staff.email,
      passwordHash: await argon2.hash(SEED_USERS.staff.password, { type: argon2.argon2id }),
      role: Role.STAFF,
    },
  });

  console.log("Seeding sample items + QR tags...");
  // tagId values are fixed/deterministic on purpose (not random) so this
  // script stays idempotent across re-runs. NOTE: once Teammate B's
  // POST /items handler lands with its real tagId-generation logic, mirror
  // that format here so seeded items look identical to normally-created
  // ones — flag this in the integration PR as a follow-up.
  const sampleItems = [
    {
      tagId: "CNCS-DEMO-0001",
      name: "Dell Latitude Laptop",
      categoryId: byName["Electronics"].id,
      department: "Computer Science",
      building: "CNCS Building",
      floor: "3",
      room: "312",
      ownerId: staff.id,
      purchaseCost: 45000,
      condition: Condition.GOOD,
      brand: "Dell",
      model: "Latitude 5420",
    },
    {
      tagId: "CNCS-DEMO-0002",
      name: "Office Desk",
      categoryId: byName["Furniture"].id,
      department: "Administration",
      building: "CNCS Building",
      floor: "1",
      room: "101",
      ownerId: admin.id,
      purchaseCost: 8000,
      condition: Condition.NEW,
    },
    {
      tagId: "CNCS-DEMO-0003",
      name: "Microscope",
      categoryId: byName["Lab Equipment"].id,
      department: "Biology",
      building: "Science Complex",
      floor: "2",
      room: "204",
      ownerId: staff.id,
      purchaseCost: 120000,
      condition: Condition.FAIR,
      brand: "Olympus",
      model: "CX23",
    },
  ];

  for (const { tagId, ...data } of sampleItems) {
    const item = await prisma.item.upsert({
      where: { tagId },
      update: {},
      create: { ...data, tagId },
    });
    await generateTagQR(item.tagId);
  }

  console.log("Seed complete:");
  console.log(`  ${categories.length} categories`);
  console.log(
    `  2 users: ${SEED_USERS.admin.email} / ${SEED_USERS.admin.password} (ADMIN), ` +
      `${SEED_USERS.staff.email} / ${SEED_USERS.staff.password} (STAFF)`
  );
  console.log(`  ${sampleItems.length} items with QR tags generated under uploads/tags/`);
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
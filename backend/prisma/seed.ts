import { Role, Condition, ItemStatus, RequestStatus, RequestType } from "@prisma/client";
import { prisma } from "../src/lib/prisma.js";
import argon2 from "argon2";
import { generateTagQR } from "../src/utils/qrGenerator.js";
import { renderRequestSubmitted } from "../src/services/notifications.js";


const SEED_USERS = {
  admin: { email: "admin@cncs.aau.edu.et", password: "Admin123!" },
  staff: { email: "staff@cncs.aau.edu.et", password: "Staff123!" },
};

/**
 * Phase 2 workflow demo fixtures. Approval is ADMIN-only, so the two users above
 * are all the walkthrough needs: staff files, admin decides, and staff trying to
 * decide their own request is the 403 case.
 *
 * Ids are hardcoded (not generated) so re-running this script updates the same
 * rows instead of piling up duplicates — same reason the tagIds below are fixed.
 */
const LAPTOP_TAG_ID = "CNCS-DEMO-0001";
const CHARGER_TAG_ID = "CNCS-DEMO-0004";
const SEED_REQUEST_ID = "seed-req-0001";
const SEED_NOTIFICATION_ID = "seed-notif-0001";

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

  const seededItems = new Map<string, { id: string; tagId: string; name: string }>();
  for (const { tagId, ...data } of sampleItems) {
    const item = await prisma.item.upsert({
      where: { tagId },
      update: {},
      create: { ...data, tagId },
    });
    seededItems.set(item.tagId, item);
    await generateTagQR(item.tagId);
  }

  console.log("Seeding Phase 2 workflow fixtures (bundle, pending request, notification)...");
  const laptop = seededItems.get(LAPTOP_TAG_ID);
  if (!laptop) {
    throw new Error(`Expected ${LAPTOP_TAG_ID} to be seeded before the workflow fixtures.`);
  }

  // The accessory that makes the approval cascade demoable: approving a TRANSFER
  // on the laptop must move this charger with it, and a DISPOSAL must dispose it
  // with a "Disposed with parent item CNCS-DEMO-0001: ..." reason (decision D6).
  // `update` re-links it, so a demo that unlinked it is repeatable.
  const charger = await prisma.item.upsert({
    where: { tagId: CHARGER_TAG_ID },
    update: { parentItemId: laptop.id },
    create: {
      tagId: CHARGER_TAG_ID,
      name: "Dell 65W Charger",
      categoryId: byName["Electronics"].id,
      department: "Computer Science",
      building: "CNCS Building",
      floor: "3",
      room: "312",
      ownerId: staff.id,
      purchaseCost: 1200,
      condition: Condition.GOOD,
      brand: "Dell",
      model: "LA65NM130",
      parentItemId: laptop.id,
    },
  });
  await generateTagQR(charger.tagId);

  // Restore the bundle's baseline. Without this the walkthrough in
  // docs/phase-2.md runs exactly once ever: its disposal step sets
  // status=DISPOSED, and `upsert`'s `update: {}` on an existing row is a no-op,
  // so the next seed would leave the laptop disposed and every later step 409.
  // Scoped to the two tags this block owns — no other item is touched.
  await prisma.item.updateMany({
    where: { tagId: { in: [LAPTOP_TAG_ID, CHARGER_TAG_ID] } },
    data: {
      building: "CNCS Building",
      floor: "3",
      room: "312",
      ownerId: staff.id,
      status: ItemStatus.ACTIVE,
      disposalReason: null,
      disposedAt: null,
    },
  });

  // One PENDING TRANSFER, ready for `POST /requests/:id/approve`. The `update`
  // rewinds a decided request instead of leaving it APPROVED — same reasoning as
  // the reset above. Note it does NOT rewind the ItemEditLog rows that decision
  // wrote: history is append-only, and a growing trail is the point.
  const transferRequest = await prisma.request.upsert({
    where: { id: SEED_REQUEST_ID },
    update: {
      status: RequestStatus.PENDING,
      reviewedById: null,
      decidedAt: null,
      rejectionReason: null,
    },
    create: {
      id: SEED_REQUEST_ID,
      type: RequestType.TRANSFER,
      status: RequestStatus.PENDING,
      itemId: laptop.id,
      requestedById: staff.id,
      reason: "Laptop is moving with its user to the ground-floor office.",
      newLocationBuilding: "CNCS Building",
      newLocationFloor: "1",
      newLocationRoom: "101",
    },
  });

  // The reviewer's inbox row for that request. Rendered by the same helper the
  // API uses, so the seeded text cannot drift from the D3 template — including
  // the `[REQUEST_SUBMITTED]` prefix, which `GET /notifications` strips.
  //
  // Only one row, for the one admin: the real fan-out (D2 — every ADMIN except
  // the requester) is `notifyReviewersOfNewRequest`, exercised by the API, and
  // duplicating it here would mean non-deterministic ids for no demo value.
  const submittedMessage = renderRequestSubmitted({
    requesterName: staff.fullName,
    requestType: "TRANSFER",
    itemTagId: laptop.tagId,
    itemName: laptop.name,
  });
  await prisma.notification.upsert({
    where: { id: SEED_NOTIFICATION_ID },
    update: { message: submittedMessage, isRead: false },
    create: {
      id: SEED_NOTIFICATION_ID,
      userId: admin.id,
      message: submittedMessage,
      relatedRequestId: transferRequest.id,
    },
  });

  console.log("Seed complete:");
  console.log(`  ${categories.length} categories`);
  console.log(
    `  2 users: ${SEED_USERS.admin.email} / ${SEED_USERS.admin.password} (ADMIN), ` +
      `${SEED_USERS.staff.email} / ${SEED_USERS.staff.password} (STAFF)`
  );
  console.log(`  ${sampleItems.length + 1} items with QR tags generated under uploads/tags/`);
  console.log(`  ${CHARGER_TAG_ID} linked as an accessory of ${LAPTOP_TAG_ID}`);
  console.log(`  1 PENDING TRANSFER request (${SEED_REQUEST_ID}) on ${LAPTOP_TAG_ID}, filed by staff`);
  console.log(`  1 unread notification (${SEED_NOTIFICATION_ID}) in the admin's inbox`);
  // The request and accessory endpoints take item ids, not tagIds — printed here
  // so the walkthrough in docs/phase-2.md can be copy-pasted without a DB query.
  console.log(`  item ids: ${LAPTOP_TAG_ID}=${laptop.id}  ${CHARGER_TAG_ID}=${charger.id}`);
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
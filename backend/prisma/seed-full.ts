import {
  Role,
  Condition,
  ItemStatus,
  RequestStatus,
  RequestType,
  OrgUnitType,
} from "../src/generated/prisma/client.js";
import { prisma } from "../src/lib/prisma.js";
import argon2 from "argon2";
import { generateTagQR } from "../src/utils/qrGenerator.js";

const SEED_USERS = {
  admin: { email: "admin@cncs.aau.edu.et", password: "Admin123!" },
  officer: { email: "officer@cncs.aau.edu.et", password: "Officer123!" },
  deptHead: { email: "dept.head@cncs.aau.edu.et", password: "DeptHead123!" },
  auditor: { email: "auditor@cncs.aau.edu.et", password: "Auditor123!" },
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

  console.log("Seeding Buildings...");
  const cncsBuilding = await prisma.building.upsert({
    where: { code: "CNCS" },
    update: {},
    create: {
      name: "CNCS Building",
      code: "CNCS",
      description: "Main CNCS Building",
    },
  });

  const scienceBuilding = await prisma.building.upsert({
    where: { code: "SCIENCE" },
    update: {},
    create: {
      name: "Science Complex",
      code: "SCIENCE",
      description: "Science Complex Building",
    },
  });

  const chemBuilding = await prisma.building.upsert({
    where: { code: "CHEM" },
    update: {},
    create: {
      name: "Chemistry Building",
      code: "CHEM",
      description: "Chemistry Building",
    },
  });

  const physBuilding = await prisma.building.upsert({
    where: { code: "PHYS" },
    update: {},
    create: {
      name: "Physics Building",
      code: "PHYS",
      description: "Physics Building",
    },
  });

  console.log("Seeding OrgUnits...");
  const college = await prisma.orgUnit.upsert({
    where: { name: "CNCS" },
    update: {},
    create: {
      name: "CNCS",
      code: "CNCS",
      type: OrgUnitType.COLLEGE,
      isActive: true,
      acceptsSelfReg: false,
    },
  });

  const csDept = await prisma.orgUnit.upsert({
    where: { name: "Computer Science" },
    update: {},
    create: {
      name: "Computer Science",
      code: "CS",
      type: OrgUnitType.DEPARTMENT,
      isActive: true,
      acceptsSelfReg: true,
      parentId: college.id,
    },
  });

  const bioDept = await prisma.orgUnit.upsert({
    where: { name: "Biology" },
    update: {},
    create: {
      name: "Biology",
      code: "BIO",
      type: OrgUnitType.DEPARTMENT,
      isActive: true,
      acceptsSelfReg: true,
      parentId: college.id,
    },
  });

  const chemDept = await prisma.orgUnit.upsert({
    where: { name: "Chemistry" },
    update: {},
    create: {
      name: "Chemistry",
      code: "CHEM",
      type: OrgUnitType.DEPARTMENT,
      isActive: true,
      acceptsSelfReg: true,
      parentId: college.id,
    },
  });

  const physDept = await prisma.orgUnit.upsert({
    where: { name: "Physics" },
    update: {},
    create: {
      name: "Physics",
      code: "PHYS",
      type: OrgUnitType.DEPARTMENT,
      isActive: true,
      acceptsSelfReg: true,
      parentId: college.id,
    },
  });

  console.log("Seeding users...");
  const admin = await prisma.user.upsert({
    where: { email: SEED_USERS.admin.email },
    update: {},
    create: {
      fullName: "System Admin",
      email: SEED_USERS.admin.email,
      passwordHash: await argon2.hash(SEED_USERS.admin.password, { type: argon2.argon2id }),
      role: Role.SYSTEM_ADMIN,
    },
  });

  const officer = await prisma.user.upsert({
    where: { email: SEED_USERS.officer.email },
    update: {},
    create: {
      fullName: "Property Officer",
      email: SEED_USERS.officer.email,
      passwordHash: await argon2.hash(SEED_USERS.officer.password, { type: argon2.argon2id }),
      role: Role.PROPERTY_OFFICER,
    },
  });

  const csHead = await prisma.user.upsert({
    where: { email: "head.cs@cncs.aau.edu.et" },
    update: {},
    create: {
      fullName: "CS Department Head",
      email: "head.cs@cncs.aau.edu.et",
      passwordHash: await argon2.hash("HeadCS123!", { type: argon2.argon2id }),
      role: Role.DEPARTMENT_HEAD,
      orgUnitId: csDept.id,
      accountStatus: "ACTIVE",
    },
  });

  const bioHead = await prisma.user.upsert({
    where: { email: "head.bio@cncs.aau.edu.et" },
    update: {},
    create: {
      fullName: "Biology Department Head",
      email: "head.bio@cncs.aau.edu.et",
      passwordHash: await argon2.hash("HeadBIO123!", { type: argon2.argon2id }),
      role: Role.DEPARTMENT_HEAD,
      orgUnitId: bioDept.id,
      accountStatus: "ACTIVE",
    },
  });

  const chemHead = await prisma.user.upsert({
    where: { email: "head.chem@cncs.aau.edu.et" },
    update: {},
    create: {
      fullName: "Chemistry Department Head",
      email: "head.chem@cncs.aau.edu.et",
      passwordHash: await argon2.hash("HeadCHEM123!", { type: argon2.argon2id }),
      role: Role.DEPARTMENT_HEAD,
      orgUnitId: chemDept.id,
      accountStatus: "ACTIVE",
    },
  });

  const csStaff1 = await prisma.user.upsert({
    where: { email: "staff.cs1@cncs.aau.edu.et" },
    update: {},
    create: {
      fullName: "CS Staff 1",
      email: "staff.cs1@cncs.aau.edu.et",
      passwordHash: await argon2.hash("StaffCS123!", { type: argon2.argon2id }),
      role: Role.STAFF,
      orgUnitId: csDept.id,
      accountStatus: "ACTIVE",
      staffId: "STAFF-CS-001",
    },
  });

  const csStaff2 = await prisma.user.upsert({
    where: { email: "staff.cs2@cncs.aau.edu.et" },
    update: {},
    create: {
      fullName: "CS Staff 2",
      email: "staff.cs2@cncs.aau.edu.et",
      passwordHash: await argon2.hash("StaffCS123!", { type: argon2.argon2id }),
      role: Role.STAFF,
      orgUnitId: csDept.id,
      accountStatus: "ACTIVE",
      staffId: "STAFF-CS-002",
    },
  });

  const bioStaff1 = await prisma.user.upsert({
    where: { email: "staff.bio1@cncs.aau.edu.et" },
    update: {},
    create: {
      fullName: "Biology Staff 1",
      email: "staff.bio1@cncs.aau.edu.et",
      passwordHash: await argon2.hash("StaffBIO123!", { type: argon2.argon2id }),
      role: Role.STAFF,
      orgUnitId: bioDept.id,
      accountStatus: "ACTIVE",
      staffId: "STAFF-BIO-001",
    },
  });

  const chemStaff1 = await prisma.user.upsert({
    where: { email: "staff.chem1@cncs.aau.edu.et" },
    update: {},
    create: {
      fullName: "Chemistry Staff 1",
      email: "staff.chem1@cncs.aau.edu.et",
      passwordHash: await argon2.hash("StaffCHEM123!", { type: argon2.argon2id }),
      role: Role.STAFF,
      orgUnitId: chemDept.id,
      accountStatus: "ACTIVE",
      staffId: "STAFF-CHEM-001",
    },
  });

  const auditor = await prisma.user.upsert({
    where: { email: SEED_USERS.auditor.email },
    update: {},
    create: {
      fullName: "Auditor Test",
      email: SEED_USERS.auditor.email,
      passwordHash: await argon2.hash(SEED_USERS.auditor.password, { type: argon2.argon2id }),
      role: Role.AUDITOR,
    },
  });

  // Set department heads
  await prisma.orgUnit.update({
    where: { id: csDept.id },
    data: { headId: csHead.id },
  });
  await prisma.orgUnit.update({
    where: { id: bioDept.id },
    data: { headId: bioHead.id },
  });
  await prisma.orgUnit.update({
    where: { id: chemDept.id },
    data: { headId: chemHead.id },
  });

  console.log("Seeding items...");
  const sampleItems = [
    {
      tagId: "CNCS-DEMO-0001",
      name: "Dell Latitude Laptop",
      categoryId: byName["Electronics"].id,
      orgUnitId: csDept.id,
      buildingId: cncsBuilding.id,
      floor: "3",
      room: "312",
      ownerId: csStaff1.id,
      purchaseCost: 45000,
      condition: Condition.GOOD,
      brand: "Dell",
      model: "Latitude 5420",
      status: ItemStatus.ACTIVE,
    },
    {
      tagId: "CNCS-DEMO-0002",
      name: "Office Desk",
      categoryId: byName["Furniture"].id,
      orgUnitId: csDept.id,
      buildingId: cncsBuilding.id,
      floor: "1",
      room: "101",
      ownerId: csHead.id,
      purchaseCost: 8000,
      condition: Condition.NEW,
      status: ItemStatus.ACTIVE,
    },
    {
      tagId: "CNCS-DEMO-0003",
      name: "Microscope",
      categoryId: byName["Lab Equipment"].id,
      orgUnitId: bioDept.id,
      buildingId: scienceBuilding.id,
      floor: "2",
      room: "204",
      ownerId: bioStaff1.id,
      purchaseCost: 120000,
      condition: Condition.FAIR,
      brand: "Olympus",
      model: "CX23",
      status: ItemStatus.ACTIVE,
    },
    {
      tagId: "CNCS-DEMO-0004",
      name: "Dell 65W Charger",
      categoryId: byName["Electronics"].id,
      orgUnitId: chemDept.id,
      buildingId: chemBuilding.id,
      floor: "1",
      room: "101",
      ownerId: chemStaff1.id,
      purchaseCost: 1200,
      condition: Condition.GOOD,
      brand: "Dell",
      model: "LA65NM130",
      status: ItemStatus.ACTIVE,
    },
    {
      tagId: "CNCS-DEMO-0005",
      name: "Physics Lab Equipment",
      categoryId: byName["Lab Equipment"].id,
      orgUnitId: physDept.id,
      buildingId: physBuilding.id,
      floor: "1",
      room: "101",
      holderType: "DEPARTMENT",
      holderId: physDept.id,
      purchaseCost: 50000,
      condition: Condition.GOOD,
      status: ItemStatus.ACTIVE,
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

  const laptop = seededItems.get("CNCS-DEMO-0001");
  const microscope = seededItems.get("CNCS-DEMO-0003");

  if (!laptop || !microscope) {
    throw new Error("Required items not seeded");
  }

  console.log("Seeding requests with all statuses...");
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

  // PENDING
  await prisma.request.upsert({
    where: { id: "req-pending-001" },
    update: {},
    create: {
      id: "req-pending-001",
      type: RequestType.TRANSFER,
      status: RequestStatus.PENDING,
      itemId: laptop.id,
      requestedById: csStaff1.id,
      reason: "Pending transfer request",
      newLocationFloor: "2",
      newLocationRoom: "205",
      createdAt: now,
    },
  });

  // PENDING_STAGE1
  await prisma.request.upsert({
    where: { id: "req-stage1-001" },
    update: {},
    create: {
      id: "req-stage1-001",
      type: RequestType.TRANSFER,
      status: RequestStatus.PENDING_STAGE1,
      itemId: laptop.id,
      requestedById: csStaff2.id,
      reason: "Stage 1 approved transfer",
      newLocationFloor: "2",
      newLocationRoom: "206",
      reviewedById: csHead.id,
      stage1ApprovedById: csHead.id,
      stage1ApprovedAt: oneHourAgo,
      createdAt: twoHoursAgo,
    },
  });

  // PENDING_STAGE2
  await prisma.request.upsert({
    where: { id: "req-stage2-001" },
    update: {},
    create: {
      id: "req-stage2-001",
      type: RequestType.TRANSFER,
      status: RequestStatus.PENDING_STAGE2,
      itemId: laptop.id,
      requestedById: csStaff1.id,
      reason: "Stage 2 approved transfer",
      newLocationFloor: "2",
      newLocationRoom: "207",
      reviewedById: csHead.id,
      stage1ApprovedById: csHead.id,
      stage1ApprovedAt: twoHoursAgo,
      stage2ApprovedById: officer.id,
      stage2ApprovedAt: oneHourAgo,
      createdAt: new Date(now.getTime() - 3 * 60 * 60 * 1000),
    },
  });

  // APPROVED
  await prisma.request.upsert({
    where: { id: "req-approved-001" },
    update: {},
    create: {
      id: "req-approved-001",
      type: RequestType.TRANSFER,
      status: RequestStatus.APPROVED,
      itemId: microscope.id,
      requestedById: bioStaff1.id,
      reason: "Approved transfer",
      newLocationFloor: "3",
      newLocationRoom: "301",
      reviewedById: bioHead.id,
      stage1ApprovedById: bioHead.id,
      stage1ApprovedAt: twoHoursAgo,
      stage2ApprovedById: officer.id,
      stage2ApprovedAt: oneHourAgo,
      createdAt: new Date(now.getTime() - 4 * 60 * 60 * 1000),
    },
  });

  // REJECTED
  await prisma.request.upsert({
    where: { id: "req-rejected-001" },
    update: {},
    create: {
      id: "req-rejected-001",
      type: RequestType.TRANSFER,
      status: RequestStatus.REJECTED,
      itemId: laptop.id,
      requestedById: csStaff2.id,
      reason: "Rejected transfer request",
      newLocationFloor: "2",
      newLocationRoom: "208",
      reviewedById: csHead.id,
      rejectionReason: "Item is needed in current location",
      createdAt: new Date(now.getTime() - 5 * 60 * 60 * 1000),
    },
  });

  // WAITLISTED
  await prisma.request.upsert({
    where: { id: "req-waitlisted-001" },
    update: {},
    create: {
      id: "req-waitlisted-001",
      type: RequestType.TRANSFER,
      status: RequestStatus.WAITLISTED,
      itemId: laptop.id,
      requestedById: csStaff1.id,
      reason: "Waitlisted transfer",
      newLocationFloor: "2",
      newLocationRoom: "209",
      createdAt: new Date(now.getTime() - 6 * 60 * 60 * 1000),
    },
  });

  // WITHDRAWN
  await prisma.request.upsert({
    where: { id: "req-withdrawn-001" },
    update: {},
    create: {
      id: "req-withdrawn-001",
      type: RequestType.TRANSFER,
      status: RequestStatus.WITHDRAWN,
      itemId: microscope.id,
      requestedById: bioStaff1.id,
      reason: "Withdrawn by requester",
      newLocationFloor: "3",
      newLocationRoom: "302",
      withdrawnAt: oneHourAgo,
      withdrawnById: bioStaff1.id,
      createdAt: new Date(now.getTime() - 7 * 60 * 60 * 1000),
    },
  });

  // INVALIDATED
  await prisma.request.upsert({
    where: { id: "req-invalidated-001" },
    update: {},
    create: {
      id: "req-invalidated-001",
      type: RequestType.TRANSFER,
      status: RequestStatus.INVALIDATED,
      itemId: laptop.id,
      requestedById: csStaff2.id,
      reason: "Invalidated due to item status change",
      newLocationFloor: "2",
      newLocationRoom: "210",
      invalidatedAt: oneHourAgo,
      invalidatedReason: "Item status changed before decision",
      createdAt: new Date(now.getTime() - 8 * 60 * 60 * 1000),
    },
  });

  // RETURN_PENDING_CONFIRMATION
  await prisma.request.upsert({
    where: { id: "req-return-001" },
    update: {},
    create: {
      id: "req-return-001",
      type: RequestType.LOAN,
      status: RequestStatus.RETURN_PENDING_CONFIRMATION,
      itemId: microscope.id,
      requestedById: bioStaff1.id,
      reason: "Loan return pending confirmation",
      loanReturnedAt: oneHourAgo,
      createdAt: new Date(now.getTime() - 9 * 60 * 60 * 1000),
    },
  });

  console.log("Seeding pending account requests...");
  await prisma.user.upsert({
    where: { email: "pending.cs@cncs.aau.edu.et" },
    update: {},
    create: {
      fullName: "Pending CS Staff",
      email: "pending.cs@cncs.aau.edu.et",
      passwordHash: await argon2.hash("Pending123!", { type: argon2.argon2id }),
      role: Role.STAFF,
      orgUnitId: csDept.id,
      accountStatus: "PENDING_APPROVAL",
      staffId: "PENDING-CS-001",
    },
  });

  await prisma.user.upsert({
    where: { email: "pending.bio@cncs.aau.edu.et" },
    update: {},
    create: {
      fullName: "Pending Bio Staff",
      email: "pending.bio@cncs.aau.edu.et",
      passwordHash: await argon2.hash("Pending123!", { type: argon2.argon2id }),
      role: Role.STAFF,
      orgUnitId: bioDept.id,
      accountStatus: "PENDING_APPROVAL",
      staffId: "PENDING-BIO-001",
    },
  });

  console.log("Seeding audit session...");
  const auditSession = await prisma.auditSession.upsert({
    where: { reportNumber: "AUDIT-2026-001" },
    update: {},
    create: {
      reportNumber: "AUDIT-2026-001",
      sessionType: "ANNUAL_FULL_COUNT",
      startedById: auditor.id,
      orgUnitId: csDept.id,
      startedAt: oneHourAgo,
      graceEndsAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  console.log("Seeding audit item results...");
  await prisma.auditItemResultRow.upsert({
    where: {
      auditSessionId_itemId: {
        auditSessionId: auditSession.id,
        itemId: laptop.id,
      },
    },
    update: {},
    create: {
      auditSessionId: auditSession.id,
      itemId: laptop.id,
      result: "FOUND",
      scannedAt: now,
      scannedCondition: Condition.GOOD,
    },
  });

  console.log("Seeding custody events...");
  await prisma.custodyEvent.create({
    data: {
      itemId: laptop.id,
      eventType: "CREATED",
      actingUserId: officer.id,
      departmentHeadSnapshot: csHead.fullName,
    },
  });

  console.log("Seeding notifications...");
  await prisma.notification.create({
    data: {
      userId: officer.id,
      message: "Test notification for Property Officer",
      relatedRequestId: "req-pending-001",
      isRead: false,
    },
  });

  await prisma.notification.create({
    data: {
      userId: csHead.id,
      message: "Test notification for Department Head",
      relatedRequestId: "req-stage1-001",
      isRead: false,
    },
  });

  console.log("Full seed complete:");
  console.log(`  ${categories.length} categories`);
  console.log(`  1 College, 4 Departments`);
  console.log(`  1 SYSTEM_ADMIN, 1 PROPERTY_OFFICER, 3 DEPARTMENT_HEADS, 1 AUDITOR`);
  console.log(`  3 STAFF users (CS, Biology, Chemistry)`);
  console.log(`  5 Items across departments`);
  console.log(`  9 Requests (one of each status)`);
  console.log(`  2 Pending account requests`);
  console.log(`  1 Audit session with 1 item result`);
  console.log(`  1 Custody event`);
  console.log(`  2 Notifications`);
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

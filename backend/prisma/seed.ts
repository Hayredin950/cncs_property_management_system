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
import { renderRequestSubmitted } from "../src/services/notifications.js";
import { notifyReviewersOfNewRequest } from "../src/services/notifications.js";


const SEED_USERS = {
  admin: { email: "admin@cncs.aau.edu.et", password: "Admin123!" },
  officer: { email: "officer@cncs.aau.edu.et", password: "Officer123!" },
  staff: { email: "staff@cncs.aau.edu.et", password: "Staff123!" },
  deptHead: { email: "dept.head@cncs.aau.edu.et", password: "DeptHead123!" },
  auditor: { email: "auditor@cncs.aau.edu.et", password: "Auditor123!" },
};

/**
 * Phase 2 workflow demo fixtures. Approval is SYSTEM_ADMIN-only, so the two users above
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

  console.log("Seeding OrgUnits (College + Departments)...");
  // College
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

  // Departments
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
  await prisma.user.upsert({
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

  // CS Department Head
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

  // Biology Department Head
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

  // Chemistry Department Head
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

  // Physics has NO head (vacant) - for testing fallback

  // CS Staff
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

  // Biology Staff
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

  const bioStaff2 = await prisma.user.upsert({
    where: { email: "staff.bio2@cncs.aau.edu.et" },
    update: {},
    create: {
      fullName: "Biology Staff 2",
      email: "staff.bio2@cncs.aau.edu.et",
      passwordHash: await argon2.hash("StaffBIO123!", { type: argon2.argon2id }),
      role: Role.STAFF,
      orgUnitId: bioDept.id,
      accountStatus: "ACTIVE",
      staffId: "STAFF-BIO-002",
    },
  });

  // Chemistry Staff
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

  console.log("Seeding sample items + QR tags...");
  // tagId values are fixed/deterministic on purpose (not random) so this script
  // stays idempotent across re-runs.
  const sampleItems = [
    // CS items
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
      photoUrl: "/photos/laptop.jpg",
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
      photoUrl: "/photos/desk.jpg",
    },
    // Biology items
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
      photoUrl: "/photos/microscope.jpg",
    },
    // Chemistry items
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
      photoUrl: "/photos/charger.jpg",
    },
    // Physics items (no head)
    {
      tagId: "CNCS-DEMO-0005",
      name: "Physics Lab Equipment",
      categoryId: byName["Lab Equipment"].id,
      orgUnitId: physDept.id,
      buildingId: physBuilding.id,
      floor: "1",
      room: "101",
      ownerId: physDept.id, // Department-held
      holderType: "DEPARTMENT",
      holderId: physDept.id,
      purchaseCost: 50000,
      condition: Condition.GOOD,
      photoUrl: "/photos/physics.jpg",
    },
  ];

  const seededItems = new Map<string, { id: string; tagId: string; name: string }>();
  for (const { tagId, ...data } of sampleItems) {
    const item = await prisma.item.upsert({
      where: { tagId },
      update: { photoUrl: data.photoUrl },
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

  // The accessory that makes the approval cascade demoable
  const charger = await prisma.item.upsert({
    where: { tagId: CHARGER_TAG_ID },
    update: { parentItemId: laptop.id, photoUrl: "/photos/charger.jpg" },
    create: {
      tagId: CHARGER_TAG_ID,
      name: "Dell 65W Charger",
      categoryId: byName["Electronics"].id,
      orgUnitId: csDept.id,
      building: "CNCS Building",
      floor: "3",
      room: "312",
      ownerId: csStaff1.id,
      purchaseCost: 1200,
      condition: Condition.GOOD,
      brand: "Dell",
      model: "LA65NM130",
      parentItemId: laptop.id,
      photoUrl: "/photos/charger.jpg",
    },
  });
  await generateTagQR(charger.tagId);

  // Restore the bundle's baseline
  await prisma.item.updateMany({
    where: { tagId: { in: [LAPTOP_TAG_ID, CHARGER_TAG_ID] } },
    data: {
      building: "CNCS Building",
      floor: "3",
      room: "312",
      ownerId: csStaff1.id,
      status: ItemStatus.ACTIVE,
      disposalReason: null,
      disposedAt: null,
    },
  });

  // One PENDING TRANSFER
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
      requestedById: csStaff1.id,
      reason: "Laptop is moving with its user to the ground-floor office.",
      newLocationBuilding: "CNCS Building",
      newLocationFloor: "1",
      newLocationRoom: "101",
    },
  });

  const submittedMessage = renderRequestSubmitted({
    requesterName: csStaff1.fullName,
    requestType: "TRANSFER",
    itemTagId: laptop.tagId,
    itemName: laptop.name,
  });
  await prisma.notification.upsert({
    where: { id: SEED_NOTIFICATION_ID },
    update: { message: submittedMessage, isRead: false },
    create: {
      id: SEED_NOTIFICATION_ID,
      userId: officer.id,
      message: submittedMessage,
      relatedRequestId: transferRequest.id,
    },
  });

  // Also notify CS Department Head so they see "needs your review"
  await prisma.notification.upsert({
    where: { id: "seed-notif-dept-head" },
    update: { message: submittedMessage, isRead: false },
    create: {
      id: "seed-notif-dept-head",
      userId: csHead.id,
      message: submittedMessage,
      relatedRequestId: transferRequest.id,
    },
  });

  // Add a DISPOSAL request for the CS Department Head to review
  const disposalItem = seededItems.get("CNCS-DEMO-0002"); // Office Desk held by CS Head
  if (disposalItem) {
    const disposalRequest = await prisma.request.upsert({
      where: { id: "seed-req-disposal" },
      update: {
        status: RequestStatus.PENDING,
        reviewedById: null,
        decidedAt: null,
        rejectionReason: null,
      },
      create: {
        id: "seed-req-disposal",
        type: RequestType.DISPOSAL,
        status: RequestStatus.PENDING,
        itemId: disposalItem.id,
        requestedById: csHead.id,
        reason: "Office desk is damaged beyond repair and needs to be disposed.",
      },
    });

    const disposalMessage = renderRequestSubmitted({
      requesterName: csHead.fullName,
      requestType: "DISPOSAL",
      itemTagId: disposalItem.tagId,
      itemName: disposalItem.name,
    });
    await prisma.notification.upsert({
      where: { id: "seed-notif-disposal" },
      update: { message: disposalMessage, isRead: false },
      create: {
        id: "seed-notif-disposal",
        userId: officer.id,
        message: disposalMessage,
        relatedRequestId: disposalRequest.id,
      },
    });
    await prisma.notification.upsert({
      where: { id: "seed-notif-disposal-head" },
      update: { message: disposalMessage, isRead: false },
      create: {
        id: "seed-notif-disposal-head",
        userId: csHead.id,
        message: disposalMessage,
        relatedRequestId: disposalRequest.id,
      },
    });
  }

  // Also notify CS Department Head so they see "needs your review"
  await prisma.notification.upsert({
    where: { id: "seed-notif-dept-head" },
    update: { message: submittedMessage, isRead: false },
    create: {
      id: "seed-notif-dept-head",
      userId: csHead.id,
      message: submittedMessage,
      relatedRequestId: transferRequest.id,
    },
  });

  // --- Enhanced seed data for Department Head testing ---
  // Add a 3rd CS staff member
  const csStaff3 = await prisma.user.upsert({
    where: { email: "staff.cs3@cncs.aau.edu.et" },
    update: {},
    create: {
      fullName: "CS Staff 3",
      email: "staff.cs3@cncs.aau.edu.et",
      passwordHash: await argon2.hash("StaffCS123!", { type: argon2.argon2id }),
      role: Role.STAFF,
      orgUnitId: csDept.id,
      accountStatus: "ACTIVE",
      staffId: "STAFF-CS-003",
    },
  });

  // Add more items held by CS Department Head
  const headItems = [
    {
      tagId: "CNCS-SEED-0001",
      name: "MacBook Pro 16\"",
      categoryId: byName["Electronics"].id,
      orgUnitId: csDept.id,
      buildingId: cncsBuilding.id,
      floor: "3",
      room: "305",
      ownerId: csHead.id,
      purchaseCost: 120000,
      condition: Condition.NEW,
      brand: "Apple",
      model: "MacBook Pro M3",
      photoUrl: "/photos/macbook.jpg",
    },
    {
      tagId: "CNCS-SEED-0002",
      name: "Ergonomic Chair",
      categoryId: byName["Furniture"].id,
      orgUnitId: csDept.id,
      buildingId: cncsBuilding.id,
      floor: "3",
      room: "305",
      ownerId: csHead.id,
      purchaseCost: 15000,
      condition: Condition.GOOD,
      brand: "Herman Miller",
      model: "Aeron",
      photoUrl: "/photos/chair.jpg",
    },
    {
      tagId: "CNCS-SEED-0003",
      name: "External Monitor 27\"",
      categoryId: byName["Electronics"].id,
      orgUnitId: csDept.id,
      buildingId: cncsBuilding.id,
      floor: "3",
      room: "305",
      ownerId: csHead.id,
      purchaseCost: 25000,
      condition: Condition.NEW,
      brand: "Dell",
      model: "U2723QE",
      photoUrl: "/photos/monitor.jpg",
    },
    {
      tagId: "CNCS-SEED-0008",
      name: "Projector Epson",
      categoryId: byName["Electronics"].id,
      orgUnitId: csDept.id,
      buildingId: cncsBuilding.id,
      floor: "2",
      room: "201",
      ownerId: csHead.id,
      purchaseCost: 45000,
      condition: Condition.GOOD,
      brand: "Epson",
      model: "EB-U05",
      photoUrl: "/photos/projector.jpg",
    },
    {
      tagId: "CNCS-SEED-0009",
      name: "Conference Table",
      categoryId: byName["Furniture"].id,
      orgUnitId: csDept.id,
      buildingId: cncsBuilding.id,
      floor: "1",
      room: "105",
      ownerId: csHead.id,
      purchaseCost: 25000,
      condition: Condition.NEW,
      brand: "IKEA",
      model: "BEKANT",
      photoUrl: "/photos/table.jpg",
    },
  ];

  for (const { tagId, ...data } of headItems) {
    const item = await prisma.item.upsert({
      where: { tagId },
      update: { photoUrl: data.photoUrl },
      create: { ...data, tagId },
    });
    seededItems.set(item.tagId, item);
    await generateTagQR(item.tagId);
  }

  // Add a pending account request for CS department
  const pendingCSAccount = await prisma.user.upsert({
    where: { email: "newstaff.cs@cncs.aau.edu.et" },
    update: {},
    create: {
      fullName: "New CS Staff Applicant",
      email: "newstaff.cs@cncs.aau.edu.et",
      passwordHash: await argon2.hash("Pending123!", { type: argon2.argon2id }),
      role: Role.STAFF,
      orgUnitId: csDept.id,
      accountStatus: "PENDING_APPROVAL",
      staffId: "PENDING-CS-002",
    },
  });

  // Add Biology items for cross-department catalog
  const bioItems = [
    {
      tagId: "CNCS-SEED-0004",
      name: "Centrifuge",
      categoryId: byName["Lab Equipment"].id,
      orgUnitId: bioDept.id,
      buildingId: scienceBuilding.id,
      floor: "2",
      room: "210",
      ownerId: bioStaff1.id,
      purchaseCost: 80000,
      condition: Condition.GOOD,
      brand: "Eppendorf",
      model: "5425",
      photoUrl: "/photos/centrifuge.jpg",
    },
    {
      tagId: "CNCS-SEED-0005",
      name: "Incubator",
      categoryId: byName["Lab Equipment"].id,
      orgUnitId: bioDept.id,
      buildingId: scienceBuilding.id,
      floor: "2",
      room: "210",
      ownerId: bioStaff2.id,
      purchaseCost: 95000,
      condition: Condition.FAIR,
      brand: "Thermo Fisher",
      model: "Heracell 150i",
      photoUrl: "/photos/incubator.jpg",
    },
  ];

  for (const { tagId, ...data } of bioItems) {
    const item = await prisma.item.upsert({
      where: { tagId },
      update: { photoUrl: data.photoUrl },
      create: { ...data, tagId },
    });
    seededItems.set(item.tagId, item);
    await generateTagQR(item.tagId);
  }

  // Add Chemistry items for cross-department catalog
  const chemItems = [
    {
      tagId: "CNCS-SEED-0006",
      name: "Spectrophotometer",
      categoryId: byName["Lab Equipment"].id,
      orgUnitId: chemDept.id,
      buildingId: chemBuilding.id,
      floor: "1",
      room: "105",
      ownerId: chemStaff1.id,
      purchaseCost: 150000,
      condition: Condition.NEW,
      brand: "Agilent",
      model: "Cary 60",
      photoUrl: "/photos/spectro.jpg",
    },
    {
      tagId: "CNCS-SEED-0007",
      name: "Fume Hood",
      categoryId: byName["Lab Equipment"].id,
      orgUnitId: chemDept.id,
      buildingId: chemBuilding.id,
      floor: "1",
      room: "105",
      ownerId: chemStaff1.id,
      purchaseCost: 200000,
      condition: Condition.GOOD,
      brand: "Thermo Fisher",
      model: "1300 Series",
      photoUrl: "/photos/fumehood.jpg",
    },
  ];

  for (const { tagId, ...data } of chemItems) {
    const item = await prisma.item.upsert({
      where: { tagId },
      update: { photoUrl: data.photoUrl },
      create: { ...data, tagId },
    });
    seededItems.set(item.tagId, item);
    await generateTagQR(item.tagId);
  }

  // Create a PENDING_STAGE1 transfer request where CS Head is the receiving approver
  // This is a transfer FROM Biology TO CS department
  const bioLaptop = seededItems.get("CNCS-SEED-0004"); // Centrifuge from Biology
  if (bioLaptop) {
    const crossDeptRequest = await prisma.request.upsert({
      where: { id: "seed-req-cross-dept" },
      update: {
        status: RequestStatus.PENDING_STAGE1,
        reviewedById: null,
        decidedAt: null,
        rejectionReason: null,
      },
      create: {
        id: "seed-req-cross-dept",
        type: RequestType.TRANSFER,
        status: RequestStatus.PENDING_STAGE1,
        itemId: bioLaptop.id,
        requestedById: bioStaff1.id,
        reason: "Centrifuge moving to CS department for collaborative research project.",
        newLocationBuilding: "CNCS Building",
        newLocationFloor: "3",
        newLocationRoom: "310",
        newOwnerId: csHead.id,
        stage1ApprovedById: bioHead.id,
        stage1ApprovedAt: new Date(),
      },
    });

    // Notify CS Department Head (stage 2 approver)
    const crossDeptMessage = renderRequestSubmitted({
      requesterName: bioStaff1.fullName,
      requestType: "TRANSFER",
      itemTagId: bioLaptop.tagId,
      itemName: bioLaptop.name,
    });
    await prisma.notification.upsert({
      where: { id: "seed-notif-cross-dept" },
      update: { message: crossDeptMessage, isRead: false },
      create: {
        id: "seed-notif-cross-dept",
        userId: csHead.id,
        message: crossDeptMessage,
        relatedRequestId: crossDeptRequest.id,
      },
    });

    // Also notify the Property Officer
    await prisma.notification.upsert({
      where: { id: "seed-notif-cross-dept-officer" },
      update: { message: crossDeptMessage, isRead: false },
      create: {
        id: "seed-notif-cross-dept-officer",
        userId: officer.id,
        message: crossDeptMessage,
        relatedRequestId: crossDeptRequest.id,
      },
    });
  }

  // Add a few pending account requests per department
  const pendingCS = await prisma.user.upsert({
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

  const pendingBIO = await prisma.user.upsert({
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

  const pendingPHYS = await prisma.user.upsert({
    where: { email: "pending.phys@cncs.aau.edu.et" },
    update: {},
    create: {
      fullName: "Pending Phys Staff",
      email: "pending.phys@cncs.aau.edu.et",
      passwordHash: await argon2.hash("Pending123!", { type: argon2.argon2id }),
      role: Role.STAFF,
      orgUnitId: physDept.id,
      accountStatus: "PENDING_APPROVAL",
      staffId: "PENDING-PHYS-001",
    },
  });

  console.log("Seed complete:");
  console.log(`  ${categories.length} categories`);
  console.log(`  1 College, 4 Departments (CS, Biology, Chemistry, Physics)`);
  console.log(`  3 Department Heads (CS, Biology, Chemistry), Physics has NO head`);
  console.log(`  3 CS Staff, 2 Biology Staff, 1 Chemistry Staff`);
  console.log(`  8 Items across departments (3 held by CS Head, 2 Biology, 2 Chemistry, 1 Physics)`);
  console.log(`  3 Pending account requests (CS, Biology, Physics)`);
  console.log(`  1 PENDING TRANSFER request (${SEED_REQUEST_ID}) on ${LAPTOP_TAG_ID}, filed by CS Staff 1`);
  console.log(`  1 PENDING_STAGE1 cross-dept transfer (Centrifuge from Biology to CS)`);
  console.log(`  4 unread notifications (officer x2, CS Department Head x2)`);
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
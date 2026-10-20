import {
  AccountRequestStatus,
  AccountStatus,
  AuditItemResult,
  AuditSessionType,
  Condition,
  EmailTokenType,
  HolderType,
  ItemStatus,
  OrgUnitType,
  RequestStatus,
  RequestType,
  Role,
} from "../src/generated/prisma/client.js";
import { prisma } from "../src/lib/prisma.js";
import argon2 from "argon2";
import { generateTagQR } from "../src/utils/qrGenerator.js";
import { renderRequestDecided, renderRequestSubmitted } from "../src/services/notifications.js";
import { hashInviteToken } from "../src/services/invites.js";

/**
 * CNCS Property Management System — the demo seed.
 *
 * ── What this seed is for ────────────────────────────────────────────────────
 * The demo has to survive being *used*: a person signs in as any one account and
 * has to find, on the first screen they open, something that exercises the
 * capability their role holds. A seed with one laptop and one pending request
 * cannot do that — every walkthrough ends at an empty list and a hand-made
 * fixture.
 *
 * So the rule this file follows is: **every individual gets enough data to
 * exercise every capability their role has**, and the nine request states, the
 * account-approval states, the audit findings and the notification inbox all
 * have at least one real row.
 *
 * ── The three rules that are not negotiable ─────────────────────────────────
 *
 * 1. **Idempotent.** Running this twice converges on the same state. Every row
 *    is written with an `upsert` keyed on a unique column — `tagId`, `email`,
 *    `id`, or the compound key the audit result rows carry — so a second run
 *    updates the row it wrote the first time instead of adding another one.
 *    Nothing here uses `create` for a row that has to survive a re-run, and no
 *    id is random.
 *
 * 2. **Every demo account ends up ACTIVE, on the update branch too.** The
 *    schema's default for `User.accountStatus` is `PENDING_EMAIL_VERIFICATION`,
 *    so an account created by an earlier version of this file — or by an
 *    earlier run of this one — keeps whatever status it had. The update branch
 *    therefore sets the status (and the password hash) as well, not just the
 *    create branch. The bug this prevents is real: the administrator could not
 *    sign in, because the seeded account was left in the default status.
 *
 * 3. **Only columns that exist.** The schema has no `Item.department` and no
 *    `User.department`; `Item.ownerId` is a foreign key to `User`, so it must
 *    carry a real user id. An earlier version of this file wrote an OrgUnit id
 *    into it, which violates the constraint and fails on any database built
 *    from the migrations.
 *
 * ── Dates ────────────────────────────────────────────────────────────────────
 * Every relative date hangs off midnight UTC today rather than off "now", so a
 * re-run on the same day writes the same timestamps and the seed converges
 * exactly instead of drifting by milliseconds on every run.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Midnight UTC today — the anchor every relative date below hangs off. */
function todayAnchor(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

const TODAY = todayAnchor();
const daysAgo = (days: number): Date => new Date(TODAY.getTime() - days * DAY_MS);
const daysAhead = (days: number): Date => new Date(TODAY.getTime() + days * DAY_MS);

/**
 * The single-use token of the seeded privileged invitation.
 *
 * It is a fixed string on purpose: the invitation has to be *real* — a hash, a
 * future expiry, a row in the invite list — and a fixed token is the only way a
 * tester can open the accept-invite screen without reading the database for a
 * random value. The seed prints the URL at the end.
 */
const SEED_INVITE_TOKEN = "seed-invite-auditor2-2026";
const SEED_INVITE_TOKEN_ID = "seed-emailtoken-invite-auditor2";

/** Passwords, as documented in `docs/KNOWLEDGE-BASE.md` §20. */
const PASSWORDS = {
  admin: "Admin123!",
  officer: "Officer123!",
  headCS: "HeadCS123!",
  headBio: "HeadBIO123!",
  headChem: "HeadCHEM123!",
  staffCS: "StaffCS123!",
  staffBIO: "StaffBIO123!",
  staffCHEM: "StaffCHEM123!",
  auditor: "Auditor123!",
  pending: "Pending123!",
} as const;

/**
 * The hash of a secret nobody holds — what an *invited* account carries before
 * it is accepted.
 *
 * A sentinel string would be worse than nothing: `passwordHash` is not
 * nullable, and `argon2.verify` throws on a malformed encoding, which would
 * turn "sign in with this address before accepting" from the 403 the login gate
 * gives into a 500 from the password check that runs first. This is a real
 * argon2id hash over a value the seed never reveals, so the check answers
 * "false", which is the truth.
 */
const INVITED_ACCOUNT_SECRET = "unusable-password-seed-invite-placeholder";

const hashCache = new Map<string, string>();

/** One argon2 hash per distinct password per run, reused by every branch. */
async function hashPassword(password: string): Promise<string> {
  const cached = hashCache.get(password);
  if (cached) return cached;
  const hash = await argon2.hash(password, { type: argon2.argon2id });
  hashCache.set(password, hash);
  return hash;
}

type UnitKey = "college" | "cs" | "bio" | "chem" | "phys";
type UserKey =
  | "admin"
  | "officer"
  | "headCS"
  | "headBio"
  | "headChem"
  | "cs1"
  | "cs2"
  | "cs3"
  | "bio1"
  | "bio2"
  | "chem1"
  | "auditor"
  | "pendingCS"
  | "pendingBio"
  | "pendingPhys"
  | "newCS"
  | "escalatedCS"
  | "rejectedChem"
  | "invitedAuditor";

interface AccountSpec {
  key: UserKey;
  email: string;
  password: string;
  fullName: string;
  role: Role;
  unit: UnitKey | null;
  staffId: string | null;
  status: AccountStatus;
  /** Set for an account an administrator appointed; the head of an OrgUnit is. */
  appointed?: boolean;
  /** The note a decision-maker left on the account. */
  reviewNote?: string | null;
  /** The account that escalated this request to the System Admin queue. */
  escalatedBy?: UserKey | null;
  /** The account that decided this request. */
  reviewedBy?: UserKey | null;
}

/**
 * The accounts.
 *
 * Twelve of them can sign in and are the demo; the rest are the *account
 * approval* fixtures — they are deliberately not ACTIVE, and they carry a full
 * history (items, requests) so that every count in the demo holds for every
 * row the approval queue lists, not only for the ones a person can log in as.
 */
const ACCOUNTS: AccountSpec[] = [
  {
    key: "admin",
    email: "admin@cncs.aau.edu.et",
    password: PASSWORDS.admin,
    fullName: "Marta Tesfaye",
    role: Role.SYSTEM_ADMIN,
    unit: null,
    staffId: null,
    status: AccountStatus.ACTIVE,
  },
  {
    key: "officer",
    email: "officer@cncs.aau.edu.et",
    password: PASSWORDS.officer,
    fullName: "Daniel Mekonnen",
    role: Role.PROPERTY_OFFICER,
    unit: null,
    staffId: null,
    status: AccountStatus.ACTIVE,
  },
  {
    key: "headCS",
    email: "head.cs@cncs.aau.edu.et",
    password: PASSWORDS.headCS,
    fullName: "Dr. Selam Girma",
    role: Role.DEPARTMENT_HEAD,
    unit: "cs",
    staffId: null,
    status: AccountStatus.ACTIVE,
    appointed: true,
  },
  {
    key: "headBio",
    email: "head.bio@cncs.aau.edu.et",
    password: PASSWORDS.headBio,
    fullName: "Dr. Yonas Bekele",
    role: Role.DEPARTMENT_HEAD,
    unit: "bio",
    staffId: null,
    status: AccountStatus.ACTIVE,
    appointed: true,
  },
  {
    key: "headChem",
    email: "head.chem@cncs.aau.edu.et",
    password: PASSWORDS.headChem,
    fullName: "Dr. Hana Alemu",
    role: Role.DEPARTMENT_HEAD,
    unit: "chem",
    staffId: null,
    status: AccountStatus.ACTIVE,
    appointed: true,
  },
  {
    key: "cs1",
    email: "staff.cs1@cncs.aau.edu.et",
    password: PASSWORDS.staffCS,
    fullName: "Marta Abebe",
    role: Role.STAFF,
    unit: "cs",
    staffId: "STAFF-CS-001",
    status: AccountStatus.ACTIVE,
  },
  {
    key: "cs2",
    email: "staff.cs2@cncs.aau.edu.et",
    password: PASSWORDS.staffCS,
    fullName: "Kirubel Tadesse",
    role: Role.STAFF,
    unit: "cs",
    staffId: "STAFF-CS-002",
    status: AccountStatus.ACTIVE,
  },
  {
    key: "cs3",
    email: "staff.cs3@cncs.aau.edu.et",
    password: PASSWORDS.staffCS,
    fullName: "Bereket Wolde",
    role: Role.STAFF,
    unit: "cs",
    staffId: "STAFF-CS-003",
    status: AccountStatus.ACTIVE,
  },
  {
    key: "bio1",
    email: "staff.bio1@cncs.aau.edu.et",
    password: PASSWORDS.staffBIO,
    fullName: "Hiwot Mengistu",
    role: Role.STAFF,
    unit: "bio",
    staffId: "STAFF-BIO-001",
    status: AccountStatus.ACTIVE,
  },
  {
    key: "bio2",
    email: "staff.bio2@cncs.aau.edu.et",
    password: PASSWORDS.staffBIO,
    fullName: "Saron Solomon",
    role: Role.STAFF,
    unit: "bio",
    staffId: "STAFF-BIO-002",
    status: AccountStatus.ACTIVE,
  },
  {
    key: "chem1",
    email: "staff.chem1@cncs.aau.edu.et",
    password: PASSWORDS.staffCHEM,
    fullName: "Nardos Worku",
    role: Role.STAFF,
    unit: "chem",
    staffId: "STAFF-CHEM-001",
    status: AccountStatus.ACTIVE,
  },
  {
    key: "auditor",
    email: "auditor@cncs.aau.edu.et",
    password: PASSWORDS.auditor,
    fullName: "Tewodros Gebre",
    role: Role.AUDITOR,
    unit: null,
    staffId: null,
    status: AccountStatus.ACTIVE,
  },

  // ── The account-approval fixtures ─────────────────────────────────────────
  // Four waiting in the queue (one per department, including the headless one),
  // one escalated to the System Admin, one declined, one invited.
  {
    key: "pendingCS",
    email: "pending.cs@cncs.aau.edu.et",
    password: PASSWORDS.pending,
    fullName: "Fikru Yilma",
    role: Role.STAFF,
    unit: "cs",
    staffId: "PENDING-CS-001",
    status: AccountStatus.PENDING_APPROVAL,
    /**
     * The note is not decoration. `GET /users/approvals` filters a department
     * head's queue with `reviewNote: { not: { contains: "[ESCALATED]" } }`,
     * and a NULL note does not survive that filter — SQL's `NOT (NULL LIKE …)`
     * is unknown, not true — so a pending account without a note is invisible to
     * the very head who is meant to approve it. Every waiting account
     * therefore carries a plain note, and only the escalated one carries the
     * marker that takes it out of the head's queue and puts it in the System
     * Admin's.
     */
    reviewNote: "Account request submitted through the college portal; the staff ID is being verified.",
  },
  {
    key: "pendingBio",
    email: "pending.bio@cncs.aau.edu.et",
    password: PASSWORDS.pending,
    fullName: "Rahel Taye",
    role: Role.STAFF,
    unit: "bio",
    staffId: "PENDING-BIO-001",
    status: AccountStatus.PENDING_APPROVAL,
    reviewNote: "Account request submitted through the college portal; the staff ID is being verified.",
  },
  {
    key: "pendingPhys",
    email: "pending.phys@cncs.aau.edu.et",
    password: PASSWORDS.pending,
    fullName: "Dawit Zewdie",
    role: Role.STAFF,
    unit: "phys",
    staffId: "PENDING-PHYS-001",
    status: AccountStatus.PENDING_APPROVAL,
    reviewNote:
      "Account request submitted through the college portal. Physics has no department head, so this request can only be decided by a System Admin.",
  },
  {
    key: "newCS",
    email: "newstaff.cs@cncs.aau.edu.et",
    password: PASSWORDS.pending,
    fullName: "Amanuel Girma",
    role: Role.STAFF,
    unit: "cs",
    staffId: "PENDING-CS-002",
    status: AccountStatus.PENDING_APPROVAL,
    reviewNote: "Account request submitted through the college portal; the staff ID is being verified.",
  },
  {
    key: "escalatedCS",
    email: "escalated.cs@cncs.aau.edu.et",
    password: PASSWORDS.pending,
    fullName: "Meron Assefa",
    role: Role.STAFF,
    unit: "cs",
    staffId: "PENDING-CS-003",
    status: AccountStatus.PENDING_APPROVAL,
    // The exact marker `GET /users/approvals` filters on: a department head's
    // queue excludes every row whose note contains "[ESCALATED]", so this one
    // is visible to the System Admin and to nobody else.
    reviewNote:
      "The applicant's staff ID is not in the college personnel register.\n[ESCALATED] Not in my department",
    escalatedBy: "headCS",
  },
  {
    key: "rejectedChem",
    email: "rejected.chem@cncs.aau.edu.et",
    password: PASSWORDS.pending,
    fullName: "Yonas Kebede",
    role: Role.STAFF,
    unit: "chem",
    staffId: "REJECTED-CHEM-001",
    status: AccountStatus.REJECTED,
    reviewNote:
      "The staff ID does not match the college personnel register. Please re-apply with the ID printed on your ID card.",
    reviewedBy: "admin",
  },
  {
    key: "invitedAuditor",
    email: "auditor2@cncs.aau.edu.et",
    password: INVITED_ACCOUNT_SECRET,
    fullName: "Mekdes Haile",
    role: Role.AUDITOR,
    unit: null,
    staffId: null,
    status: AccountStatus.PENDING_EMAIL_VERIFICATION,
  },
];

interface ItemSpec {
  tagId: string;
  name: string;
  category: string;
  unit: UnitKey;
  building: string;
  floor: string;
  room: string;
  /** The legacy custodian column. Always a real user id. */
  owner: UserKey;
  holder: "STAFF" | "DEPARTMENT" | "COLLEGE";
  /** Who actually holds it, when that is not the owner (a loan). */
  holderUser?: UserKey;
  cost: number;
  condition: Condition;
  brand?: string;
  model?: string;
  photo?: string;
  notes?: string;
  status?: ItemStatus;
  disposalReason?: string;
  disposedDaysAgo?: number;
  voidReason?: string;
  voidedDaysAgo?: number;
  parentTagId?: string;
}

/**
 * The register.
 *
 * `CNCS-DEMO-…` is the college pool (plus the two Physics department assets),
 * `CNCS-STAFF-…` is department and personal holdings. Every staff member and
 * every department head holds at least five items, so that the "items I hold"
 * tile, the holdings export and the item list all have something to show the
 * moment someone signs in.
 */
const ITEMS: ItemSpec[] = [
  // ── College pool and Physics ─────────────────────────────────────────────
  {
    tagId: "CNCS-DEMO-0001",
    name: "Dell Latitude Laptop",
    category: "Electronics",
    unit: "cs",
    building: "CNCS",
    floor: "3",
    room: "312",
    owner: "cs1",
    holder: "STAFF",
    cost: 45000,
    condition: Condition.GOOD,
    brand: "Dell",
    model: "Latitude 5420",
    photo: "/photos/laptop.jpg",
  },
  {
    tagId: "CNCS-DEMO-0002",
    name: "Office Desk",
    category: "Furniture",
    unit: "cs",
    building: "CNCS",
    floor: "1",
    room: "101",
    owner: "headCS",
    holder: "STAFF",
    cost: 8000,
    condition: Condition.NEW,
    brand: "Generic",
    model: "Office Desk 120cm",
    photo: "/photos/desk.jpg",
  },
  {
    tagId: "CNCS-DEMO-0003",
    name: "Microscope",
    category: "Lab Equipment",
    unit: "bio",
    building: "SCIENCE",
    floor: "2",
    room: "204",
    owner: "bio1",
    holder: "STAFF",
    cost: 120000,
    condition: Condition.FAIR,
    brand: "Olympus",
    model: "CX23",
    photo: "/photos/microscope.jpg",
  },
  {
    tagId: "CNCS-DEMO-0004",
    name: "Dell 65W Charger",
    category: "Electronics",
    unit: "cs",
    building: "CNCS",
    floor: "3",
    room: "312",
    owner: "cs1",
    holder: "STAFF",
    cost: 1200,
    condition: Condition.GOOD,
    brand: "Dell",
    model: "LA65NM130",
    photo: "/photos/charger.jpg",
    notes: "Travel charger that belongs to the bundle of CNCS-DEMO-0001.",
    parentTagId: "CNCS-DEMO-0001",
  },
  {
    tagId: "CNCS-DEMO-0005",
    name: "Physics Lab Equipment",
    category: "Lab Equipment",
    unit: "phys",
    building: "PHYS",
    floor: "1",
    room: "101",
    owner: "officer",
    holder: "DEPARTMENT",
    cost: 50000,
    condition: Condition.GOOD,
    brand: "PHYWE",
    model: "Teaching Lab Kit",
    photo: "/photos/physics.jpg",
  },
  {
    tagId: "CNCS-DEMO-0006",
    name: "Portable Projector Cart",
    category: "Electronics",
    unit: "college",
    building: "CNCS",
    floor: "2",
    room: "201",
    owner: "officer",
    holder: "STAFF",
    holderUser: "cs1",
    cost: 60000,
    condition: Condition.GOOD,
    brand: "Epson",
    model: "EB-U05 Cart",
    photo: "/photos/projector-cart.jpg",
    status: ItemStatus.LOANED,
  },
  {
    tagId: "CNCS-DEMO-0007",
    name: "College Vehicle — Toyota Corolla",
    category: "Vehicles",
    unit: "college",
    building: "CNCS",
    floor: "0",
    room: "Parking",
    owner: "officer",
    holder: "STAFF",
    holderUser: "bio1",
    cost: 950000,
    condition: Condition.GOOD,
    brand: "Toyota",
    model: "Corolla",
    photo: "/photos/vehicle.jpg",
    status: ItemStatus.LOANED,
  },
  {
    tagId: "CNCS-DEMO-0008",
    name: "Multifunction Photocopier",
    category: "Office Supplies",
    unit: "college",
    building: "CNCS",
    floor: "1",
    room: "107",
    owner: "officer",
    holder: "COLLEGE",
    cost: 85000,
    condition: Condition.GOOD,
    brand: "Canon",
    model: "i-SENSYS MF445dw",
    photo: "/photos/photocopier.jpg",
  },
  {
    tagId: "CNCS-DEMO-0009",
    name: "Steel Filing Cabinet",
    category: "Furniture",
    unit: "college",
    building: "CNCS",
    floor: "1",
    room: "105",
    owner: "officer",
    holder: "COLLEGE",
    cost: 7000,
    condition: Condition.FAIR,
    brand: "Generic",
    model: "4-Drawer",
    photo: "/photos/filing-cabinet.jpg",
    status: ItemStatus.DISPOSED,
    disposalReason:
      "The college's steel filing cabinet is dented and the drawers no longer close.",
    disposedDaysAgo: 26,
  },
  {
    tagId: "CNCS-DEMO-0010",
    name: "Laptop Storage Trolley",
    category: "Furniture",
    unit: "college",
    building: "CNCS",
    floor: "1",
    room: "101",
    owner: "officer",
    holder: "STAFF",
    holderUser: "cs1",
    cost: 9500,
    condition: Condition.GOOD,
    brand: "Generic",
    model: "Trolley 15",
    photo: "/photos/trolley.jpg",
    status: ItemStatus.LOANED,
  },
  {
    tagId: "CNCS-DEMO-0011",
    name: "Digital Camera Kit",
    category: "Electronics",
    unit: "college",
    building: "CNCS",
    floor: "1",
    room: "101",
    owner: "officer",
    holder: "STAFF",
    holderUser: "cs2",
    cost: 56000,
    condition: Condition.NEW,
    brand: "Canon",
    model: "EOS 250D",
    photo: "/photos/camera-kit.jpg",
    status: ItemStatus.LOANED,
  },
  {
    tagId: "CNCS-DEMO-0012",
    name: "Field Measurement Kit",
    category: "Lab Equipment",
    unit: "college",
    building: "SCIENCE",
    floor: "2",
    room: "215",
    owner: "officer",
    holder: "STAFF",
    holderUser: "cs3",
    cost: 38000,
    condition: Condition.GOOD,
    brand: "Generic",
    model: "Field Kit",
    photo: "/photos/measurement-kit.jpg",
    status: ItemStatus.LOANED,
  },
  {
    tagId: "CNCS-DEMO-0013",
    name: "Oscilloscope (duplicate tag)",
    category: "Lab Equipment",
    unit: "college",
    building: "SCIENCE",
    floor: "2",
    room: "215",
    owner: "officer",
    holder: "COLLEGE",
    cost: 40000,
    condition: Condition.FAIR,
    brand: "Rigol",
    model: "DS1052Z",
    photo: "/photos/oscilloscope-duplicate.jpg",
    status: ItemStatus.VOIDED,
    voidReason:
      "Duplicate of the oscilloscope registered under CNCS-DEMO-0013A — found during the October inventory.",
    voidedDaysAgo: 7,
  },
  {
    tagId: "CNCS-DEMO-0014",
    name: "Oscilloscope",
    category: "Lab Equipment",
    unit: "phys",
    building: "PHYS",
    floor: "1",
    room: "102",
    owner: "officer",
    holder: "DEPARTMENT",
    cost: 72000,
    condition: Condition.GOOD,
    brand: "Rigol",
    model: "DS1104Z",
    photo: "/photos/oscilloscope.jpg",
  },
  {
    tagId: "CNCS-DEMO-0015",
    name: "Thermal Imaging Camera",
    category: "Electronics",
    unit: "college",
    building: "CNCS",
    floor: "1",
    room: "101",
    owner: "officer",
    holder: "STAFF",
    holderUser: "headBio",
    cost: 64000,
    condition: Condition.NEW,
    brand: "FLIR",
    model: "T865",
    photo: "/photos/thermal-camera.jpg",
    status: ItemStatus.LOANED,
  },
  {
    tagId: "CNCS-DEMO-0016",
    name: "Noise Measurement Kit",
    category: "Lab Equipment",
    unit: "college",
    building: "CHEM",
    floor: "1",
    room: "110",
    owner: "officer",
    holder: "STAFF",
    holderUser: "chem1",
    cost: 29500,
    condition: Condition.GOOD,
    brand: "Casella",
    model: "CEL-620",
    photo: "/photos/noise-kit.jpg",
    status: ItemStatus.LOANED,
  },
  {
    tagId: "CNCS-DEMO-0017",
    name: "Portable Sound Kit",
    category: "Electronics",
    unit: "college",
    building: "CNCS",
    floor: "2",
    room: "203",
    owner: "officer",
    holder: "STAFF",
    holderUser: "pendingBio",
    cost: 42000,
    condition: Condition.NEW,
    brand: "Zoom",
    model: "H5",
    photo: "/photos/sound-kit.jpg",
    status: ItemStatus.LOANED,
  },
  {
    tagId: "CNCS-DEMO-0018",
    name: "Mobile Whiteboard",
    category: "Furniture",
    unit: "college",
    building: "CNCS",
    floor: "1",
    room: "108",
    owner: "officer",
    holder: "COLLEGE",
    cost: 12000,
    condition: Condition.GOOD,
    brand: "Generic",
    model: "Mobile Whiteboard",
    photo: "/photos/mobile-whiteboard.jpg",
    status: ItemStatus.DISPOSED,
    disposalReason: "The mobile whiteboard's frame is bent and it can no longer be moved safely.",
    disposedDaysAgo: 22,
  },
  {
    tagId: "CNCS-DEMO-0019",
    name: "Meeting Room Tablet",
    category: "Electronics",
    unit: "college",
    building: "CNCS",
    floor: "1",
    room: "105",
    owner: "officer",
    holder: "COLLEGE",
    cost: 27000,
    condition: Condition.NEW,
    brand: "Samsung",
    model: "Tab A9",
    photo: "/photos/meeting-tablet.jpg",
  },
  {
    tagId: "CNCS-DEMO-0020",
    name: "Portable PA Speaker",
    category: "Electronics",
    unit: "college",
    building: "CNCS",
    floor: "2",
    room: "201",
    owner: "officer",
    holder: "COLLEGE",
    cost: 33000,
    condition: Condition.GOOD,
    brand: "JBL",
    model: "EON One",
    photo: "/photos/pa-speaker.jpg",
  },

  // ── Department and personal holdings ──────────────────────────────────────
  // The `CNCS-STAFF-` series continues the numbering the demo already used
  // (`CNCS-STAFF-0001..0010`); the rows below are the head and department
  // holdings that make the same series complete.
  {
    tagId: "CNCS-STAFF-0071",
    name: "MacBook Pro 16\"",
    category: "Electronics",
    unit: "cs",
    building: "CNCS",
    floor: "3",
    room: "305",
    owner: "headCS",
    holder: "STAFF",
    cost: 120000,
    condition: Condition.NEW,
    brand: "Apple",
    model: "MacBook Pro M3",
    photo: "/photos/macbook.jpg",
  },
  {
    tagId: "CNCS-STAFF-0072",
    name: "Ergonomic Chair",
    category: "Furniture",
    unit: "cs",
    building: "CNCS",
    floor: "3",
    room: "305",
    owner: "headCS",
    holder: "STAFF",
    cost: 15000,
    condition: Condition.GOOD,
    brand: "Herman Miller",
    model: "Aeron",
    photo: "/photos/chair.jpg",
  },
  {
    tagId: "CNCS-STAFF-0073",
    name: "External Monitor 27\"",
    category: "Electronics",
    unit: "cs",
    building: "CNCS",
    floor: "3",
    room: "305",
    owner: "headCS",
    holder: "STAFF",
    cost: 25000,
    condition: Condition.NEW,
    brand: "Dell",
    model: "U2723QE",
    photo: "/photos/monitor.jpg",
  },
  {
    tagId: "CNCS-STAFF-0074",
    name: "Centrifuge",
    category: "Lab Equipment",
    unit: "bio",
    building: "SCIENCE",
    floor: "2",
    room: "210",
    owner: "bio1",
    holder: "STAFF",
    cost: 80000,
    condition: Condition.GOOD,
    brand: "Eppendorf",
    model: "5425",
    photo: "/photos/centrifuge.jpg",
  },
  {
    tagId: "CNCS-STAFF-0075",
    name: "Incubator",
    category: "Lab Equipment",
    unit: "bio",
    building: "SCIENCE",
    floor: "2",
    room: "210",
    owner: "bio2",
    holder: "STAFF",
    cost: 95000,
    condition: Condition.FAIR,
    brand: "Thermo Fisher",
    model: "Heracell 150i",
    photo: "/photos/incubator.jpg",
  },
  {
    tagId: "CNCS-STAFF-0076",
    name: "Spectrophotometer",
    category: "Lab Equipment",
    unit: "chem",
    building: "CHEM",
    floor: "1",
    room: "105",
    owner: "chem1",
    holder: "STAFF",
    cost: 150000,
    condition: Condition.NEW,
    brand: "Agilent",
    model: "Cary 60",
    photo: "/photos/spectro.jpg",
  },
  {
    tagId: "CNCS-STAFF-0077",
    name: "Fume Hood",
    category: "Lab Equipment",
    unit: "chem",
    building: "CHEM",
    floor: "1",
    room: "105",
    owner: "chem1",
    holder: "STAFF",
    cost: 200000,
    condition: Condition.GOOD,
    brand: "Thermo Fisher",
    model: "1300 Series",
    photo: "/photos/fumehood.jpg",
  },
  {
    tagId: "CNCS-STAFF-0078",
    name: "Projector Epson",
    category: "Electronics",
    unit: "cs",
    building: "CNCS",
    floor: "2",
    room: "201",
    owner: "headCS",
    holder: "STAFF",
    cost: 45000,
    condition: Condition.GOOD,
    brand: "Epson",
    model: "EB-U05",
    photo: "/photos/projector.jpg",
  },
  {
    tagId: "CNCS-STAFF-0079",
    name: "Conference Table",
    category: "Furniture",
    unit: "cs",
    building: "CNCS",
    floor: "1",
    room: "105",
    owner: "headCS",
    holder: "STAFF",
    cost: 25000,
    condition: Condition.NEW,
    brand: "IKEA",
    model: "BEKANT",
    photo: "/photos/table.jpg",
    status: ItemStatus.DISPOSED,
    disposalReason: "The conference table's top is split and cannot be repaired.",
    disposedDaysAgo: 17,
  },
  {
    tagId: "CNCS-STAFF-0001",
    name: "MacBook Air M2",
    category: "Electronics",
    unit: "cs",
    building: "CNCS",
    floor: "3",
    room: "305",
    owner: "cs1",
    holder: "STAFF",
    cost: 85000,
    condition: Condition.NEW,
    brand: "Apple",
    model: "MacBook Air M2",
    photo: "/photos/macbook-air.jpg",
  },
  {
    tagId: "CNCS-STAFF-0002",
    name: "iPad Pro 12.9\"",
    category: "Electronics",
    unit: "cs",
    building: "CNCS",
    floor: "3",
    room: "305",
    owner: "cs1",
    holder: "STAFF",
    cost: 65000,
    condition: Condition.GOOD,
    brand: "Apple",
    model: "iPad Pro 12.9",
    photo: "/photos/ipad-pro.jpg",
  },
  {
    tagId: "CNCS-STAFF-0003",
    name: "Standing Desk",
    category: "Furniture",
    unit: "cs",
    building: "CNCS",
    floor: "3",
    room: "305",
    owner: "cs1",
    holder: "STAFF",
    cost: 12000,
    condition: Condition.NEW,
    brand: "IKEA",
    model: "BEKANT",
    photo: "/photos/standing-desk.jpg",
  },
  {
    tagId: "CNCS-STAFF-0004",
    name: "ThinkPad X1 Carbon",
    category: "Electronics",
    unit: "cs",
    building: "CNCS",
    floor: "2",
    room: "207",
    owner: "cs2",
    holder: "STAFF",
    cost: 75000,
    condition: Condition.GOOD,
    brand: "Lenovo",
    model: "ThinkPad X1 Carbon Gen 10",
    photo: "/photos/thinkpad.jpg",
  },
  {
    tagId: "CNCS-STAFF-0005",
    name: "Monitor 27\" Dell",
    category: "Electronics",
    unit: "cs",
    building: "CNCS",
    floor: "2",
    room: "205",
    owner: "cs2",
    holder: "STAFF",
    cost: 18000,
    condition: Condition.NEW,
    brand: "Dell",
    model: "U2723QE",
    photo: "/photos/dell-monitor.jpg",
  },
  {
    tagId: "CNCS-STAFF-0006",
    name: "Pipette Set",
    category: "Lab Equipment",
    unit: "bio",
    building: "SCIENCE",
    floor: "2",
    room: "210",
    owner: "bio1",
    holder: "STAFF",
    cost: 25000,
    condition: Condition.NEW,
    brand: "Eppendorf",
    model: "Research Plus",
    photo: "/photos/pipette.jpg",
  },
  {
    tagId: "CNCS-STAFF-0007",
    name: "Lab Coat Set",
    category: "Lab Equipment",
    unit: "bio",
    building: "SCIENCE",
    floor: "2",
    room: "210",
    owner: "bio1",
    holder: "STAFF",
    cost: 5000,
    condition: Condition.GOOD,
    brand: "Generic",
    model: "Lab Coat M",
    photo: "/photos/lab-coat.jpg",
  },
  {
    tagId: "CNCS-STAFF-0008",
    name: "Microscope Camera",
    category: "Lab Equipment",
    unit: "bio",
    building: "SCIENCE",
    floor: "2",
    room: "211",
    owner: "bio2",
    holder: "STAFF",
    cost: 35000,
    condition: Condition.NEW,
    brand: "Olympus",
    model: "DP74",
    photo: "/photos/micro-camera.jpg",
  },
  {
    tagId: "CNCS-STAFF-0009",
    name: "Lab Coat",
    category: "Lab Equipment",
    unit: "chem",
    building: "CHEM",
    floor: "1",
    room: "105",
    owner: "chem1",
    holder: "STAFF",
    cost: 3000,
    condition: Condition.GOOD,
    brand: "Generic",
    model: "Lab Coat L",
    photo: "/photos/lab-coat2.jpg",
  },
  {
    tagId: "CNCS-STAFF-0010",
    name: "Safety Goggles Set",
    category: "Lab Equipment",
    unit: "chem",
    building: "CHEM",
    floor: "1",
    room: "105",
    owner: "chem1",
    holder: "STAFF",
    cost: 2000,
    condition: Condition.NEW,
    brand: "3M",
    model: "Virtua",
    photo: "/photos/goggles.jpg",
  },
  {
    tagId: "CNCS-STAFF-0011",
    name: "Wireless Keyboard & Mouse Set",
    category: "Electronics",
    unit: "cs",
    building: "CNCS",
    floor: "3",
    room: "305",
    owner: "cs1",
    holder: "STAFF",
    cost: 4500,
    condition: Condition.GOOD,
    brand: "Logitech",
    model: "MK270",
    photo: "/photos/keyboard.jpg",
  },
  {
    tagId: "CNCS-STAFF-0012",
    name: "USB-C Docking Station",
    category: "Electronics",
    unit: "cs",
    building: "CNCS",
    floor: "2",
    room: "205",
    owner: "cs2",
    holder: "STAFF",
    cost: 12000,
    condition: Condition.NEW,
    brand: "CalDigit",
    model: "TS3 Plus",
    photo: "/photos/dock.jpg",
  },
  {
    tagId: "CNCS-STAFF-0013",
    name: "Ergonomic Office Chair",
    category: "Furniture",
    unit: "cs",
    building: "CNCS",
    floor: "2",
    room: "205",
    owner: "cs2",
    holder: "STAFF",
    cost: 9000,
    condition: Condition.GOOD,
    brand: "Steelcase",
    model: "Gesture",
    photo: "/photos/office-chair.jpg",
  },
  {
    tagId: "CNCS-STAFF-0014",
    name: "LED Desk Lamp",
    category: "Electronics",
    unit: "cs",
    building: "CNCS",
    floor: "2",
    room: "205",
    owner: "cs2",
    holder: "STAFF",
    cost: 2500,
    condition: Condition.NEW,
    brand: "Philips",
    model: "Eyecare",
    photo: "/photos/desk-lamp.jpg",
  },
  {
    tagId: "CNCS-STAFF-0015",
    name: "Acer Predator Gaming Laptop",
    category: "Electronics",
    unit: "cs",
    building: "CNCS",
    floor: "3",
    room: "307",
    owner: "cs3",
    holder: "STAFF",
    cost: 95000,
    condition: Condition.GOOD,
    brand: "Acer",
    model: "Predator Helios 300",
    photo: "/photos/predator.jpg",
  },
  {
    tagId: "CNCS-STAFF-0016",
    name: "GPU Training Rig",
    category: "Electronics",
    unit: "cs",
    building: "CNCS",
    floor: "3",
    room: "307",
    owner: "cs3",
    holder: "STAFF",
    cost: 110000,
    condition: Condition.DAMAGED,
    brand: "Custom Build",
    model: "RTX 4070",
    photo: "/photos/gpu-rig.jpg",
    status: ItemStatus.DISPOSED,
    disposalReason:
      "The GPU rig's power supply failed and the machine will not boot; requesting disposal.",
    disposedDaysAgo: 6,
  },
  {
    tagId: "CNCS-STAFF-0017",
    name: "Raspberry Pi 5 Kit",
    category: "Electronics",
    unit: "cs",
    building: "CNCS",
    floor: "3",
    room: "307",
    owner: "cs3",
    holder: "STAFF",
    cost: 8000,
    condition: Condition.NEW,
    brand: "Raspberry Pi",
    model: "5",
    photo: "/photos/raspberry-pi.jpg",
  },
  {
    tagId: "CNCS-STAFF-0018",
    name: "Bookshelf Unit",
    category: "Furniture",
    unit: "cs",
    building: "CNCS",
    floor: "3",
    room: "307",
    owner: "cs3",
    holder: "STAFF",
    cost: 6000,
    condition: Condition.GOOD,
    brand: "IKEA",
    model: "BILLY",
    photo: "/photos/bookshelf.jpg",
  },
  {
    tagId: "CNCS-STAFF-0019",
    name: "Network Switch 24-Port",
    category: "Electronics",
    unit: "cs",
    building: "CNCS",
    floor: "3",
    room: "307",
    owner: "cs3",
    holder: "STAFF",
    cost: 18000,
    condition: Condition.GOOD,
    brand: "TP-Link",
    model: "TL-SG1024D",
    photo: "/photos/network-switch.jpg",
  },
  {
    tagId: "CNCS-STAFF-0020",
    name: "Microcontroller Dev Kit",
    category: "Electronics",
    unit: "cs",
    building: "CNCS",
    floor: "3",
    room: "307",
    owner: "cs3",
    holder: "STAFF",
    cost: 5500,
    condition: Condition.NEW,
    brand: "Arduino",
    model: "Mega 2560",
    photo: "/photos/arduino.jpg",
  },
  {
    tagId: "CNCS-STAFF-0021",
    name: "Autoclave",
    category: "Lab Equipment",
    unit: "bio",
    building: "SCIENCE",
    floor: "2",
    room: "210",
    owner: "bio1",
    holder: "STAFF",
    cost: 210000,
    condition: Condition.GOOD,
    brand: "Tuttnauer",
    model: "2540",
    photo: "/photos/autoclave.jpg",
  },
  {
    tagId: "CNCS-STAFF-0022",
    name: "NanoDrop Spectrophotometer",
    category: "Lab Equipment",
    unit: "bio",
    building: "SCIENCE",
    floor: "2",
    room: "211",
    owner: "bio2",
    holder: "STAFF",
    cost: 165000,
    condition: Condition.NEW,
    brand: "Thermo Fisher",
    model: "NanoDrop One",
    photo: "/photos/nanodrop.jpg",
  },
  {
    tagId: "CNCS-STAFF-0023",
    name: "Biosafety Cabinet Class II",
    category: "Lab Equipment",
    unit: "bio",
    building: "SCIENCE",
    floor: "2",
    room: "211",
    owner: "bio2",
    holder: "STAFF",
    cost: 320000,
    condition: Condition.GOOD,
    brand: "Thermo Fisher",
    model: "1300 Series",
    photo: "/photos/biosafety-cabinet.jpg",
  },
  {
    tagId: "CNCS-STAFF-0024",
    name: "Ultra-Low Freezer -80°C",
    category: "Lab Equipment",
    unit: "bio",
    building: "SCIENCE",
    floor: "2",
    room: "211",
    owner: "bio2",
    holder: "STAFF",
    cost: 275000,
    condition: Condition.GOOD,
    brand: "Thermo Fisher",
    model: "TSX Ultra-Low",
    photo: "/photos/freezer.jpg",
  },
  {
    tagId: "CNCS-STAFF-0025",
    name: "Lab Stool",
    category: "Furniture",
    unit: "bio",
    building: "SCIENCE",
    floor: "2",
    room: "211",
    owner: "bio2",
    holder: "STAFF",
    cost: 3500,
    condition: Condition.GOOD,
    brand: "Generic",
    model: "Lab Stool",
    photo: "/photos/lab-stool.jpg",
  },
  {
    tagId: "CNCS-STAFF-0026",
    name: "Analytical Balance",
    category: "Lab Equipment",
    unit: "chem",
    building: "CHEM",
    floor: "1",
    room: "105",
    owner: "chem1",
    holder: "STAFF",
    cost: 42000,
    condition: Condition.NEW,
    brand: "Ohaus",
    model: "Explorer",
    photo: "/photos/balance.jpg",
  },
  {
    tagId: "CNCS-STAFF-0027",
    name: "Leica Microscope",
    category: "Lab Equipment",
    unit: "bio",
    building: "SCIENCE",
    floor: "2",
    room: "202",
    owner: "headBio",
    holder: "STAFF",
    cost: 195000,
    condition: Condition.NEW,
    brand: "Leica",
    model: "DMi8",
    photo: "/photos/leica-microscope.jpg",
  },
  {
    tagId: "CNCS-STAFF-0028",
    name: "Cryo Freezer",
    category: "Lab Equipment",
    unit: "bio",
    building: "SCIENCE",
    floor: "2",
    room: "202",
    owner: "headBio",
    holder: "STAFF",
    cost: 240000,
    condition: Condition.GOOD,
    brand: "Thermo Fisher",
    model: "CryoCube",
    photo: "/photos/cryo-freezer.jpg",
  },
  {
    tagId: "CNCS-STAFF-0029",
    name: "HP EliteBook Laptop",
    category: "Electronics",
    unit: "bio",
    building: "SCIENCE",
    floor: "2",
    room: "202",
    owner: "headBio",
    holder: "STAFF",
    cost: 72000,
    condition: Condition.NEW,
    brand: "HP",
    model: "EliteBook 840",
    photo: "/photos/elitebook.jpg",
  },
  {
    tagId: "CNCS-STAFF-0030",
    name: "Laboratory Workbench",
    category: "Furniture",
    unit: "bio",
    building: "SCIENCE",
    floor: "2",
    room: "202",
    owner: "headBio",
    holder: "STAFF",
    cost: 28000,
    condition: Condition.GOOD,
    brand: "Generic",
    model: "Lab Bench",
    photo: "/photos/workbench.jpg",
    status: ItemStatus.DISPOSED,
    disposalReason: "The workbench is warped and has been condemned by the safety officer.",
    disposedDaysAgo: 16,
  },
  {
    tagId: "CNCS-STAFF-0031",
    name: "Reagent Storage Cabinet",
    category: "Furniture",
    unit: "bio",
    building: "SCIENCE",
    floor: "2",
    room: "202",
    owner: "headBio",
    holder: "STAFF",
    cost: 19000,
    condition: Condition.GOOD,
    brand: "Generic",
    model: "Reagent Cabinet",
    photo: "/photos/reagent-cabinet.jpg",
  },
  {
    tagId: "CNCS-STAFF-0032",
    name: "NMR Spectrometer",
    category: "Lab Equipment",
    unit: "chem",
    building: "CHEM",
    floor: "1",
    room: "102",
    owner: "headChem",
    holder: "STAFF",
    cost: 1850000,
    condition: Condition.GOOD,
    brand: "Bruker",
    model: "AVANCE NEO",
    photo: "/photos/nmr.jpg",
  },
  {
    tagId: "CNCS-STAFF-0033",
    name: "Lenovo ThinkPad P1",
    category: "Electronics",
    unit: "chem",
    building: "CHEM",
    floor: "1",
    room: "102",
    owner: "headChem",
    holder: "STAFF",
    cost: 138000,
    condition: Condition.NEW,
    brand: "Lenovo",
    model: "ThinkPad P1",
    photo: "/photos/thinkpad-p1.jpg",
  },
  {
    tagId: "CNCS-STAFF-0034",
    name: "Hazardous Storage Cabinet",
    category: "Furniture",
    unit: "chem",
    building: "CHEM",
    floor: "1",
    room: "102",
    owner: "headChem",
    holder: "STAFF",
    cost: 46000,
    condition: Condition.GOOD,
    brand: "Generic",
    model: "Safety Cabinet",
    photo: "/photos/hazard-cabinet.jpg",
  },
  {
    tagId: "CNCS-STAFF-0035",
    name: "Magnetic Stirrer",
    category: "Lab Equipment",
    unit: "chem",
    building: "CHEM",
    floor: "1",
    room: "102",
    owner: "headChem",
    holder: "STAFF",
    cost: 22000,
    condition: Condition.NEW,
    brand: "Heidolph",
    model: "Hei-Mix S1",
    photo: "/photos/stirrer.jpg",
  },
  {
    tagId: "CNCS-STAFF-0036",
    name: "Lab Bench Stool Set",
    category: "Furniture",
    unit: "chem",
    building: "CHEM",
    floor: "1",
    room: "102",
    owner: "headChem",
    holder: "STAFF",
    cost: 6000,
    condition: Condition.GOOD,
    brand: "Generic",
    model: "Stool Set",
    photo: "/photos/stool-set.jpg",
    status: ItemStatus.DISPOSED,
    disposalReason: "The lab stool set is unsafe — one of the stools has a cracked column.",
    disposedDaysAgo: 13,
  },
  {
    tagId: "CNCS-STAFF-0037",
    name: "Conference Recording Kit",
    category: "Electronics",
    unit: "bio",
    building: "SCIENCE",
    floor: "2",
    room: "202",
    owner: "headBio",
    holder: "STAFF",
    cost: 32000,
    condition: Condition.NEW,
    brand: "Sony",
    model: "ICD-PX470",
    photo: "/photos/recording-kit.jpg",
  },
  {
    tagId: "CNCS-STAFF-0038",
    name: "Chemical Drying Cabinet",
    category: "Lab Equipment",
    unit: "chem",
    building: "CHEM",
    floor: "1",
    room: "102",
    owner: "headChem",
    holder: "STAFF",
    cost: 55000,
    condition: Condition.GOOD,
    brand: "Thermo Fisher",
    model: "FD Series",
    photo: "/photos/drying-cabinet.jpg",
  },
  {
    tagId: "CNCS-STAFF-0039",
    name: "Document Camera",
    category: "Electronics",
    unit: "cs",
    building: "CNCS",
    floor: "2",
    room: "207",
    owner: "cs2",
    holder: "STAFF",
    cost: 7800,
    condition: Condition.GOOD,
    brand: "Aver",
    model: "CUM130",
    photo: "/photos/document-camera.jpg",
  },
  {
    tagId: "CNCS-STAFF-0040",
    name: "Desktop PC",
    category: "Electronics",
    unit: "cs",
    building: "CNCS",
    floor: "3",
    room: "310",
    owner: "pendingCS",
    holder: "STAFF",
    cost: 48000,
    condition: Condition.GOOD,
    brand: "HP",
    model: "ProDesk 400 G9",
    photo: "/photos/desktop-pc.jpg",
  },
  {
    tagId: "CNCS-STAFF-0041",
    name: "USB-C Cable Set",
    category: "Electronics",
    unit: "cs",
    building: "CNCS",
    floor: "3",
    room: "310",
    owner: "pendingCS",
    holder: "STAFF",
    cost: 1800,
    condition: Condition.NEW,
    brand: "Anker",
    model: "240W",
    photo: "/photos/cables.jpg",
  },
  {
    tagId: "CNCS-STAFF-0042",
    name: "Notebook and Pen Set",
    category: "Office Supplies",
    unit: "cs",
    building: "CNCS",
    floor: "3",
    room: "310",
    owner: "pendingCS",
    holder: "STAFF",
    cost: 900,
    condition: Condition.NEW,
    brand: "Generic",
    model: "A5 Set",
    photo: "/photos/notebook.jpg",
  },
  {
    tagId: "CNCS-STAFF-0043",
    name: "Mini Refrigerator",
    category: "Electronics",
    unit: "cs",
    building: "CNCS",
    floor: "3",
    room: "310",
    owner: "pendingCS",
    holder: "STAFF",
    cost: 11000,
    condition: Condition.GOOD,
    brand: "Bosch",
    model: "Cooler Vario",
    photo: "/photos/mini-fridge.jpg",
  },
  {
    tagId: "CNCS-STAFF-0044",
    name: "Folding Guest Chair",
    category: "Furniture",
    unit: "cs",
    building: "CNCS",
    floor: "3",
    room: "310",
    owner: "pendingCS",
    holder: "STAFF",
    cost: 3200,
    condition: Condition.FAIR,
    brand: "Generic",
    model: "Folding",
    photo: "/photos/folding-chair.jpg",
  },
  {
    tagId: "CNCS-STAFF-0045",
    name: "Sample Vial Box",
    category: "Lab Equipment",
    unit: "bio",
    building: "SCIENCE",
    floor: "2",
    room: "213",
    owner: "pendingBio",
    holder: "STAFF",
    cost: 2400,
    condition: Condition.NEW,
    brand: "Corning",
    model: "5000",
    photo: "/photos/vial-box.jpg",
  },
  {
    tagId: "CNCS-STAFF-0046",
    name: "Benchtop Shaker",
    category: "Lab Equipment",
    unit: "bio",
    building: "SCIENCE",
    floor: "2",
    room: "213",
    owner: "pendingBio",
    holder: "STAFF",
    cost: 68000,
    condition: Condition.GOOD,
    brand: "Thermo Fisher",
    model: "888",
    photo: "/photos/shaker.jpg",
  },
  {
    tagId: "CNCS-STAFF-0047",
    name: "Incubator Sensor Probe",
    category: "Lab Equipment",
    unit: "bio",
    building: "SCIENCE",
    floor: "2",
    room: "213",
    owner: "pendingBio",
    holder: "STAFF",
    cost: 3600,
    condition: Condition.FAIR,
    brand: "Thermo Fisher",
    model: "Probe 9000",
    photo: "/photos/probe.jpg",
  },
  {
    tagId: "CNCS-STAFF-0048",
    name: "Laboratory Notebook",
    category: "Office Supplies",
    unit: "bio",
    building: "SCIENCE",
    floor: "2",
    room: "213",
    owner: "pendingBio",
    holder: "STAFF",
    cost: 700,
    condition: Condition.NEW,
    brand: "Generic",
    model: "A4",
    photo: "/photos/lab-notebook.jpg",
  },
  {
    tagId: "CNCS-STAFF-0049",
    name: "Adjustable Pipette Stand",
    category: "Lab Equipment",
    unit: "bio",
    building: "SCIENCE",
    floor: "2",
    room: "213",
    owner: "pendingBio",
    holder: "STAFF",
    cost: 5200,
    condition: Condition.NEW,
    brand: "Sartorius",
    model: "Easymax",
    photo: "/photos/pipette-stand.jpg",
  },
  {
    tagId: "CNCS-STAFF-0050",
    name: "Laser Distance Meter",
    category: "Lab Equipment",
    unit: "phys",
    building: "PHYS",
    floor: "1",
    room: "103",
    owner: "pendingPhys",
    holder: "STAFF",
    cost: 14500,
    condition: Condition.NEW,
    brand: "Leica",
    model: "Disto D2",
    photo: "/photos/distance-meter.jpg",
  },
  {
    tagId: "CNCS-STAFF-0051",
    name: "Optical Bench Kit",
    category: "Lab Equipment",
    unit: "phys",
    building: "PHYS",
    floor: "1",
    room: "103",
    owner: "pendingPhys",
    holder: "STAFF",
    cost: 88000,
    condition: Condition.GOOD,
    brand: "Thorlabs",
    model: "Educational Kit",
    photo: "/photos/optical-bench.jpg",
  },
  {
    tagId: "CNCS-STAFF-0052",
    name: "Signal Generator",
    category: "Lab Equipment",
    unit: "phys",
    building: "PHYS",
    floor: "1",
    room: "103",
    owner: "pendingPhys",
    holder: "STAFF",
    cost: 42000,
    condition: Condition.GOOD,
    brand: "Keysight",
    model: "33500B",
    photo: "/photos/signal-generator.jpg",
  },
  {
    tagId: "CNCS-STAFF-0053",
    name: "Physics Calculator Set",
    category: "Office Supplies",
    unit: "phys",
    building: "PHYS",
    floor: "1",
    room: "103",
    owner: "pendingPhys",
    holder: "STAFF",
    cost: 4200,
    condition: Condition.GOOD,
    brand: "Casio",
    model: "fx-991",
    photo: "/photos/calculators.jpg",
  },
  {
    tagId: "CNCS-STAFF-0054",
    name: "Vacuum Pump",
    category: "Lab Equipment",
    unit: "phys",
    building: "PHYS",
    floor: "1",
    room: "103",
    owner: "pendingPhys",
    holder: "STAFF",
    cost: 56000,
    condition: Condition.FAIR,
    brand: "Edwards",
    model: "RV5",
    photo: "/photos/vacuum-pump.jpg",
  },
  {
    tagId: "CNCS-STAFF-0055",
    name: "USB Microphone",
    category: "Electronics",
    unit: "cs",
    building: "CNCS",
    floor: "3",
    room: "311",
    owner: "newCS",
    holder: "STAFF",
    cost: 5200,
    condition: Condition.NEW,
    brand: "Blue",
    model: "Yeti",
    photo: "/photos/microphone.jpg",
  },
  {
    tagId: "CNCS-STAFF-0056",
    name: "Studio Webcam",
    category: "Electronics",
    unit: "cs",
    building: "CNCS",
    floor: "3",
    room: "311",
    owner: "newCS",
    holder: "STAFF",
    cost: 8900,
    condition: Condition.NEW,
    brand: "Logitech",
    model: "C920",
    photo: "/photos/webcam.jpg",
  },
  {
    tagId: "CNCS-STAFF-0057",
    name: "Desk Organiser Set",
    category: "Office Supplies",
    unit: "cs",
    building: "CNCS",
    floor: "3",
    room: "311",
    owner: "newCS",
    holder: "STAFF",
    cost: 1400,
    condition: Condition.GOOD,
    brand: "Generic",
    model: "Organiser",
    photo: "/photos/organiser.jpg",
  },
  {
    tagId: "CNCS-STAFF-0058",
    name: "Portable SSD 1TB",
    category: "Electronics",
    unit: "cs",
    building: "CNCS",
    floor: "3",
    room: "311",
    owner: "newCS",
    holder: "STAFF",
    cost: 9800,
    condition: Condition.NEW,
    brand: "Samsung",
    model: "T7",
    photo: "/photos/ssd.jpg",
  },
  {
    tagId: "CNCS-STAFF-0059",
    name: "Folding Desk",
    category: "Furniture",
    unit: "cs",
    building: "CNCS",
    floor: "3",
    room: "311",
    owner: "newCS",
    holder: "STAFF",
    cost: 7500,
    condition: Condition.FAIR,
    brand: "Generic",
    model: "Folding",
    photo: "/photos/folding-desk.jpg",
  },
  {
    tagId: "CNCS-STAFF-0060",
    name: "Development Laptop",
    category: "Electronics",
    unit: "cs",
    building: "CNCS",
    floor: "3",
    room: "312",
    owner: "escalatedCS",
    holder: "STAFF",
    cost: 62000,
    condition: Condition.GOOD,
    brand: "HP",
    model: "ZBook Fury 15",
    photo: "/photos/zbook.jpg",
    notes: "Issued against the staff ID; the account request is still with the property office.",
  },
  {
    tagId: "CNCS-STAFF-0061",
    name: "USB-C Hub 7-in-1",
    category: "Electronics",
    unit: "cs",
    building: "CNCS",
    floor: "3",
    room: "312",
    owner: "escalatedCS",
    holder: "STAFF",
    cost: 3800,
    condition: Condition.NEW,
    brand: "Anker",
    model: "565",
    photo: "/photos/usb-hub.jpg",
  },
  {
    tagId: "CNCS-STAFF-0062",
    name: "Code Review Toolkit",
    category: "Office Supplies",
    unit: "cs",
    building: "CNCS",
    floor: "3",
    room: "312",
    owner: "escalatedCS",
    holder: "STAFF",
    cost: 2400,
    condition: Condition.GOOD,
    brand: "Generic",
    model: "Toolkit",
    photo: "/photos/toolkit.jpg",
  },
  {
    tagId: "CNCS-STAFF-0063",
    name: "Adjustable Footrest",
    category: "Furniture",
    unit: "cs",
    building: "CNCS",
    floor: "3",
    room: "312",
    owner: "escalatedCS",
    holder: "STAFF",
    cost: 3600,
    condition: Condition.GOOD,
    brand: "Generic",
    model: "Footrest",
    photo: "/photos/footrest.jpg",
  },
  {
    tagId: "CNCS-STAFF-0064",
    name: "Noise-Cancelling Headset",
    category: "Electronics",
    unit: "cs",
    building: "CNCS",
    floor: "3",
    room: "312",
    owner: "escalatedCS",
    holder: "STAFF",
    cost: 12500,
    condition: Condition.NEW,
    brand: "Jabra",
    model: "Evolve2 65",
    photo: "/photos/headset.jpg",
  },
  {
    tagId: "CNCS-STAFF-0065",
    name: "Chemical Drying Cabinet",
    category: "Lab Equipment",
    unit: "chem",
    building: "CHEM",
    floor: "1",
    room: "105",
    owner: "rejectedChem",
    holder: "STAFF",
    cost: 21000,
    condition: Condition.GOOD,
    brand: "Thermo Fisher",
    model: "FD Series S",
    photo: "/photos/drying-cabinet-small.jpg",
    notes: "Issued against the staff ID; the account request was declined.",
  },
  {
    tagId: "CNCS-STAFF-0066",
    name: "Digital Hot Plate",
    category: "Lab Equipment",
    unit: "chem",
    building: "CHEM",
    floor: "1",
    room: "105",
    owner: "rejectedChem",
    holder: "STAFF",
    cost: 11500,
    condition: Condition.NEW,
    brand: "IKA",
    model: "C-MAG HS 7",
    photo: "/photos/hot-plate.jpg",
  },
  {
    tagId: "CNCS-STAFF-0067",
    name: "Fume Hood Glove Set",
    category: "Lab Equipment",
    unit: "chem",
    building: "CHEM",
    floor: "1",
    room: "105",
    owner: "rejectedChem",
    holder: "STAFF",
    cost: 1800,
    condition: Condition.FAIR,
    brand: "3M",
    model: "Vextra",
    photo: "/photos/gloves.jpg",
  },
  {
    tagId: "CNCS-STAFF-0068",
    name: "Lab Coat (Chemical)",
    category: "Lab Equipment",
    unit: "chem",
    building: "CHEM",
    floor: "1",
    room: "105",
    owner: "rejectedChem",
    holder: "STAFF",
    cost: 2800,
    condition: Condition.GOOD,
    brand: "Generic",
    model: "Lab Coat XL",
    photo: "/photos/lab-coat3.jpg",
  },
  {
    tagId: "CNCS-STAFF-0069",
    name: "Chemical Spill Kit",
    category: "Lab Equipment",
    unit: "chem",
    building: "CHEM",
    floor: "1",
    room: "105",
    owner: "rejectedChem",
    holder: "STAFF",
    cost: 6500,
    condition: Condition.NEW,
    brand: "Generic",
    model: "Spill Kit 20L",
    photo: "/photos/spill-kit.jpg",
  },
  {
    tagId: "CNCS-STAFF-0070",
    name: "Mini Server",
    category: "Electronics",
    unit: "cs",
    building: "CNCS",
    floor: "3",
    room: "307",
    owner: "cs3",
    holder: "STAFF",
    cost: 145000,
    condition: Condition.NEW,
    brand: "Dell",
    model: "PowerEdge T350",
    photo: "/photos/mini-server.jpg",
  },
];

interface RequestSpec {
  id: string;
  type: RequestType;
  status: RequestStatus;
  /** The item's tag id. */
  item: string;
  /** Who filed it. */
  by: UserKey;
  reason: string;
  createdDaysAgo: number;
  reviewer?: UserKey;
  decidedDaysAgo?: number;
  rejectionReason?: string;
  /**
   * The building the item moves to, by code — and **only** for a move that
   * crosses buildings.
   *
   * `buildTransferChanges()` writes `Request.newLocationBuilding` straight into
   * `Item.buildingId`, and that column is a foreign key to `Building.id`. A
   * request that names a building therefore has to name it by id, or the
   * approval fails on the constraint (`Item_buildingId_fkey`). A move inside one
   * building does not name a building at all: the request carries the new floor
   * and room and the item keeps the building it is already in.
   */
  newBuildingCode?: string;
  newFloor?: string;
  newRoom?: string;
  newOwner?: UserKey;
  stage1By?: UserKey;
  stage1DaysAgo?: number;
  stage2By?: UserKey;
  stage2DaysAgo?: number;
  /** Negative is a loan that is already overdue. */
  loanDueInDays?: number;
  withdrawnDaysAgo?: number;
  invalidatedDaysAgo?: number;
  invalidatedReason?: string;
}

/**
 * The request history.
 *
 * All nine states of the state machine are present, and they are spread across
 * the individuals rather than piled on one account: every staff member files at
 * least five requests of their own, every department head at least three, and
 * the two-stage transfer path, the loan path (including one overdue loan and one
 * waiting for a return confirmation), a waitlisted request and an invalidated
 * one all have a row to point at.
 */
const REQUESTS: RequestSpec[] = [
  // ── Computer Science staff 1 ─────────────────────────────────────────────
  {
    id: "seed-req-0001",
    type: RequestType.TRANSFER,
    status: RequestStatus.PENDING,
    item: "CNCS-DEMO-0001",
    by: "cs1",
    reason: "Laptop is moving with its user to the ground-floor office.",
    createdDaysAgo: 3,
    newFloor: "1",
    newRoom: "101",
  },
  {
    id: "seed-req-staff-transfer-1",
    type: RequestType.TRANSFER,
    status: RequestStatus.PENDING,
    item: "CNCS-STAFF-0001",
    by: "cs1",
    reason: "Moving to new office in ground floor lab.",
    createdDaysAgo: 2,
    newFloor: "1",
    newRoom: "105",
  },
  {
    id: "seed-req-cs1-disposal-pending",
    type: RequestType.DISPOSAL,
    status: RequestStatus.PENDING,
    item: "CNCS-STAFF-0011",
    by: "cs1",
    reason:
      "The wireless keyboard set drops keystrokes and its receiver is dead; requesting disposal.",
    createdDaysAgo: 2,
  },
  {
    id: "seed-req-cs1-loan-overdue",
    type: RequestType.LOAN,
    status: RequestStatus.APPROVED,
    item: "CNCS-DEMO-0006",
    by: "cs1",
    reason: "Borrowing the portable projector cart for the department open day.",
    createdDaysAgo: 24,
    reviewer: "officer",
    decidedDaysAgo: 22,
    loanDueInDays: -20,
  },
  {
    id: "seed-req-cs1-loan-return-pending",
    type: RequestType.LOAN,
    status: RequestStatus.RETURN_PENDING_CONFIRMATION,
    item: "CNCS-DEMO-0010",
    by: "cs1",
    reason: "Borrowing the laptop trolley for the graduation rehearsal.",
    createdDaysAgo: 14,
    reviewer: "officer",
    decidedDaysAgo: 12,
    loanDueInDays: 10,
  },
  {
    id: "seed-req-cs1-transfer-rejected",
    type: RequestType.TRANSFER,
    status: RequestStatus.REJECTED,
    item: "CNCS-STAFF-0002",
    by: "cs1",
    reason: "Moving the iPad to the mobile lab for the field week.",
    createdDaysAgo: 9,
    reviewer: "headCS",
    decidedDaysAgo: 8,
    rejectionReason:
      "The iPad is booked for the mobile-lab rotation until the end of the semester.",
    newFloor: "1",
    newRoom: "107",
  },
  {
    id: "seed-req-cs1-transfer-withdrawn",
    type: RequestType.TRANSFER,
    status: RequestStatus.WITHDRAWN,
    item: "CNCS-STAFF-0011",
    by: "cs1",
    reason: "Moving the keyboard set to the new lab office.",
    createdDaysAgo: 4,
    withdrawnDaysAgo: 1,
    newFloor: "3",
    newRoom: "309",
  },

  // ── Computer Science staff 2 ─────────────────────────────────────────────
  {
    id: "seed-req-staff-disposal-1",
    type: RequestType.DISPOSAL,
    status: RequestStatus.PENDING,
    item: "CNCS-STAFF-0005",
    by: "cs2",
    reason: "Monitor has dead pixels and needs replacement.",
    createdDaysAgo: 4,
  },
  {
    id: "seed-req-cs2-transfer-approved",
    type: RequestType.TRANSFER,
    status: RequestStatus.APPROVED,
    item: "CNCS-STAFF-0004",
    by: "cs2",
    reason: "Moving the ThinkPad into the new project room 207.",
    createdDaysAgo: 10,
    reviewer: "headCS",
    decidedDaysAgo: 8,
    stage1By: "headCS",
    stage1DaysAgo: 9,
    stage2By: "headCS",
    stage2DaysAgo: 8,
    newFloor: "2",
    newRoom: "207",
  },
  {
    id: "seed-req-cs2-loan-approved",
    type: RequestType.LOAN,
    status: RequestStatus.APPROVED,
    item: "CNCS-DEMO-0011",
    by: "cs2",
    reason: "Borrowing the digital camera kit for the departmental field trip.",
    createdDaysAgo: 12,
    reviewer: "officer",
    decidedDaysAgo: 10,
    loanDueInDays: 14,
  },
  {
    id: "seed-req-cs2-transfer-invalidated",
    type: RequestType.TRANSFER,
    status: RequestStatus.INVALIDATED,
    item: "CNCS-DEMO-0013",
    by: "cs2",
    reason: "Taking the oscilloscope from the physics store into the computer science lab.",
    createdDaysAgo: 8,
    invalidatedDaysAgo: 6,
    invalidatedReason:
      "Item status changed to VOIDED before this request could be decided",
    newFloor: "2",
    newRoom: "215",
  },
  {
    id: "seed-req-cs2-disposal-rejected",
    type: RequestType.DISPOSAL,
    status: RequestStatus.REJECTED,
    item: "CNCS-STAFF-0014",
    by: "cs2",
    reason: "The desk lamp flickers and the transformer is noisy; requesting disposal.",
    createdDaysAgo: 7,
    reviewer: "officer",
    decidedDaysAgo: 5,
    rejectionReason:
      "The lamp is serviceable — the flickering is a loose bulb in the property office store.",
  },
  {
    id: "seed-req-cs2-loan-waitlisted",
    type: RequestType.LOAN,
    status: RequestStatus.WAITLISTED,
    item: "CNCS-DEMO-0006",
    by: "cs2",
    reason:
      "Borrowing the projector cart for the computer science open-day booth — the same cart is already promised to another member of staff.",
    createdDaysAgo: 23,
    reviewer: "officer",
    decidedDaysAgo: 21,
    loanDueInDays: 5,
  },

  // ── Computer Science staff 3 ─────────────────────────────────────────────
  {
    id: "seed-req-cs3-transfer-stage2",
    type: RequestType.TRANSFER,
    status: RequestStatus.PENDING_STAGE2,
    item: "CNCS-STAFF-0019",
    by: "cs3",
    reason: "Moving the network switch to the Biology teaching lab.",
    createdDaysAgo: 5,
    stage1By: "headCS",
    stage1DaysAgo: 3,
    newBuildingCode: "SCIENCE",
    newFloor: "2",
    newRoom: "210",
    newOwner: "bio2",
  },
  {
    id: "seed-req-cs3-disposal-approved",
    type: RequestType.DISPOSAL,
    status: RequestStatus.APPROVED,
    item: "CNCS-STAFF-0016",
    by: "cs3",
    reason:
      "The GPU rig's power supply failed and the machine will not boot; requesting disposal.",
    createdDaysAgo: 8,
    reviewer: "officer",
    decidedDaysAgo: 6,
  },
  {
    id: "seed-req-cs3-transfer-pending",
    type: RequestType.TRANSFER,
    status: RequestStatus.PENDING,
    item: "CNCS-STAFF-0015",
    by: "cs3",
    reason: "Moving the laptop to the research room 309.",
    createdDaysAgo: 1,
    newFloor: "3",
    newRoom: "309",
  },
  {
    id: "seed-req-cs3-loan-approved",
    type: RequestType.LOAN,
    status: RequestStatus.APPROVED,
    item: "CNCS-DEMO-0012",
    by: "cs3",
    reason: "Borrowing the field measurement kit for the regional science fair.",
    createdDaysAgo: 13,
    reviewer: "officer",
    decidedDaysAgo: 11,
    loanDueInDays: 30,
  },
  {
    id: "seed-req-cs3-transfer-withdrawn",
    type: RequestType.TRANSFER,
    status: RequestStatus.WITHDRAWN,
    item: "CNCS-STAFF-0020",
    by: "cs3",
    reason: "Moving the development kit into the shared electronics lab.",
    createdDaysAgo: 5,
    withdrawnDaysAgo: 2,
    newFloor: "3",
    newRoom: "312",
  },

  // ── Biology staff 1 ──────────────────────────────────────────────────────
  {
    id: "seed-req-cross-dept",
    type: RequestType.TRANSFER,
    status: RequestStatus.PENDING_STAGE1,
    item: "CNCS-STAFF-0074",
    by: "bio1",
    reason: "Centrifuge moving to CS department for collaborative research project.",
    createdDaysAgo: 12,
    stage1By: "headBio",
    stage1DaysAgo: 11,
    newBuildingCode: "CNCS",
    newFloor: "3",
    newRoom: "310",
    newOwner: "headCS",
  },
  {
    id: "seed-req-bio1-transfer-pending",
    type: RequestType.TRANSFER,
    status: RequestStatus.PENDING,
    item: "CNCS-STAFF-0006",
    by: "bio1",
    reason: "Moving the pipette set to the new microbiology lab, room 208.",
    createdDaysAgo: 5,
    newFloor: "2",
    newRoom: "208",
  },
  {
    id: "seed-req-bio1-disposal-pending",
    type: RequestType.DISPOSAL,
    status: RequestStatus.PENDING,
    item: "CNCS-STAFF-0021",
    by: "bio1",
    reason:
      "The autoclave's door seal has failed and the chamber no longer holds pressure.",
    createdDaysAgo: 6,
  },
  {
    id: "seed-req-bio1-transfer-rejected",
    type: RequestType.TRANSFER,
    status: RequestStatus.REJECTED,
    item: "CNCS-STAFF-0007",
    by: "bio1",
    reason: "Taking the department lab coats for the field trip.",
    createdDaysAgo: 11,
    reviewer: "headBio",
    decidedDaysAgo: 9,
    rejectionReason:
      "Department-issue coats are issued centrally; personal replacements are not granted.",
    newFloor: "1",
    newRoom: "103",
  },
  {
    id: "seed-req-bio1-loan-approved",
    type: RequestType.LOAN,
    status: RequestStatus.APPROVED,
    item: "CNCS-DEMO-0007",
    by: "bio1",
    reason: "Borrowing the college vehicle for the weekend field trip to the Awash site.",
    createdDaysAgo: 15,
    reviewer: "officer",
    decidedDaysAgo: 13,
    loanDueInDays: 21,
  },
  {
    id: "seed-req-bio1-transfer-withdrawn",
    type: RequestType.TRANSFER,
    status: RequestStatus.WITHDRAWN,
    item: "CNCS-DEMO-0003",
    by: "bio1",
    reason: "Moving the microscope into the shared instrument room.",
    createdDaysAgo: 6,
    withdrawnDaysAgo: 3,
    newFloor: "2",
    newRoom: "210",
  },

  // ── Biology staff 2 ──────────────────────────────────────────────────────
  {
    id: "seed-req-bio2-disposal-pending",
    type: RequestType.DISPOSAL,
    status: RequestStatus.PENDING,
    item: "CNCS-STAFF-0075",
    by: "bio2",
    reason:
      "The incubator's temperature sensor drifts and the samples are no longer trustworthy.",
    createdDaysAgo: 4,
  },
  {
    id: "seed-req-bio2-transfer-approved",
    type: RequestType.TRANSFER,
    status: RequestStatus.APPROVED,
    item: "CNCS-STAFF-0008",
    by: "bio2",
    reason: "Moving the microscope camera to the imaging room, room 211.",
    createdDaysAgo: 9,
    reviewer: "headBio",
    decidedDaysAgo: 6,
    stage1By: "headBio",
    stage1DaysAgo: 7,
    stage2By: "headBio",
    stage2DaysAgo: 6,
    newFloor: "2",
    newRoom: "211",
  },
  {
    id: "seed-req-bio2-loan-rejected",
    type: RequestType.LOAN,
    status: RequestStatus.REJECTED,
    item: "CNCS-DEMO-0011",
    by: "bio2",
    reason: "Borrowing the camera kit for the biology documentation project.",
    createdDaysAgo: 17,
    reviewer: "officer",
    decidedDaysAgo: 15,
    rejectionReason:
      "The camera kit is reserved for the college open day and the request came after the booking.",
  },
  {
    id: "seed-req-bio2-transfer-pending",
    type: RequestType.TRANSFER,
    status: RequestStatus.PENDING,
    item: "CNCS-STAFF-0024",
    by: "bio2",
    reason: "Moving the ultra-low freezer into the new sample store.",
    createdDaysAgo: 2,
    newFloor: "2",
    newRoom: "215",
  },
  {
    id: "seed-req-bio2-disposal-rejected",
    type: RequestType.DISPOSAL,
    status: RequestStatus.REJECTED,
    item: "CNCS-STAFF-0025",
    by: "bio2",
    reason: "The lab stool's gas lift has failed; requesting disposal.",
    createdDaysAgo: 6,
    reviewer: "officer",
    decidedDaysAgo: 3,
    rejectionReason:
      "The stool is serviceable and the college store has no replacement in stock.",
  },

  // ── Chemistry staff 1 ────────────────────────────────────────────────────
  {
    id: "seed-req-chem1-transfer-pending",
    type: RequestType.TRANSFER,
    status: RequestStatus.PENDING,
    item: "CNCS-STAFF-0009",
    by: "chem1",
    reason: "Moving the lab coat to the new organic chemistry lab.",
    createdDaysAgo: 5,
    newFloor: "1",
    newRoom: "108",
  },
  {
    id: "seed-req-chem1-disposal-pending",
    type: RequestType.DISPOSAL,
    status: RequestStatus.PENDING,
    item: "CNCS-STAFF-0077",
    by: "chem1",
    reason:
      "The fume hood's airflow monitor has failed and the unit cannot be used until it is serviced.",
    createdDaysAgo: 7,
  },
  {
    id: "seed-req-chem1-loan-approved",
    type: RequestType.LOAN,
    status: RequestStatus.APPROVED,
    item: "CNCS-DEMO-0016",
    by: "chem1",
    reason: "Borrowing the noise measurement kit for the ventilation survey.",
    createdDaysAgo: 14,
    reviewer: "officer",
    decidedDaysAgo: 12,
    loanDueInDays: 18,
  },
  {
    id: "seed-req-chem1-disposal-rejected",
    type: RequestType.DISPOSAL,
    status: RequestStatus.REJECTED,
    item: "CNCS-STAFF-0026",
    by: "chem1",
    reason:
      "The analytical balance drifts by 12 mg and needs recalibration; requesting disposal.",
    createdDaysAgo: 8,
    reviewer: "officer",
    decidedDaysAgo: 6,
    rejectionReason:
      "The balance is out of calibration, not broken — send it for recalibration.",
  },
  {
    id: "seed-req-chem1-transfer-withdrawn",
    type: RequestType.TRANSFER,
    status: RequestStatus.WITHDRAWN,
    item: "CNCS-STAFF-0076",
    by: "chem1",
    reason: "Moving the spectrophotometer to the shared analysis room.",
    createdDaysAgo: 7,
    withdrawnDaysAgo: 4,
    newFloor: "1",
    newRoom: "110",
  },

  // ── The department heads ─────────────────────────────────────────────────
  {
    id: "seed-req-disposal",
    type: RequestType.DISPOSAL,
    status: RequestStatus.PENDING,
    item: "CNCS-DEMO-0002",
    by: "headCS",
    reason: "Office desk is damaged beyond repair and needs to be disposed.",
    createdDaysAgo: 14,
  },
  {
    id: "seed-req-head-cs-disposal-approved",
    type: RequestType.DISPOSAL,
    status: RequestStatus.APPROVED,
    item: "CNCS-STAFF-0079",
    by: "headCS",
    reason: "The conference table's top is split and cannot be repaired.",
    createdDaysAgo: 19,
    reviewer: "officer",
    decidedDaysAgo: 17,
  },
  {
    id: "seed-req-head-cs-loan-rejected",
    type: RequestType.LOAN,
    status: RequestStatus.REJECTED,
    item: "CNCS-DEMO-0011",
    by: "headCS",
    reason: "Borrowing the camera kit for the college open day.",
    createdDaysAgo: 20,
    reviewer: "officer",
    decidedDaysAgo: 18,
    rejectionReason: "The camera kit is already booked for the open day itself.",
  },
  {
    id: "seed-req-head-cs-transfer-pending",
    type: RequestType.TRANSFER,
    status: RequestStatus.PENDING,
    item: "CNCS-STAFF-0078",
    by: "headCS",
    reason: "Moving the projector into the seminar room for the weekly teaching block.",
    createdDaysAgo: 9,
    newFloor: "2",
    newRoom: "203",
  },
  {
    id: "seed-req-head-bio-transfer-pending",
    type: RequestType.TRANSFER,
    status: RequestStatus.PENDING,
    item: "CNCS-STAFF-0027",
    by: "headBio",
    reason: "Moving the Leica microscope into the department's teaching lab.",
    createdDaysAgo: 6,
    newFloor: "2",
    newRoom: "206",
  },
  {
    id: "seed-req-head-bio-disposal-approved",
    type: RequestType.DISPOSAL,
    status: RequestStatus.APPROVED,
    item: "CNCS-STAFF-0030",
    by: "headBio",
    reason: "The workbench is warped and has been condemned by the safety officer.",
    createdDaysAgo: 18,
    reviewer: "officer",
    decidedDaysAgo: 16,
  },
  {
    id: "seed-req-head-bio-loan-approved",
    type: RequestType.LOAN,
    status: RequestStatus.APPROVED,
    item: "CNCS-DEMO-0015",
    by: "headBio",
    reason: "Borrowing the thermal imaging camera for the building heat-loss survey.",
    createdDaysAgo: 16,
    reviewer: "officer",
    decidedDaysAgo: 14,
    loanDueInDays: 12,
  },
  {
    id: "seed-req-head-bio-transfer-rejected",
    type: RequestType.TRANSFER,
    status: RequestStatus.REJECTED,
    item: "CNCS-STAFF-0028",
    by: "headBio",
    reason: "Moving the cryo freezer into the department's own store.",
    createdDaysAgo: 21,
    reviewer: "officer",
    decidedDaysAgo: 19,
    rejectionReason:
      "The cryo freezer is shared with the sample repository; moving it would interrupt the sample audit trail.",
    newFloor: "2",
    newRoom: "220",
  },
  {
    id: "seed-req-head-chem-transfer-pending",
    type: RequestType.TRANSFER,
    status: RequestStatus.PENDING,
    item: "CNCS-STAFF-0032",
    by: "headChem",
    reason: "Moving the NMR spectrometer into the refurbished analysis room.",
    createdDaysAgo: 5,
    newFloor: "1",
    newRoom: "104",
  },
  {
    id: "seed-req-head-chem-disposal-approved",
    type: RequestType.DISPOSAL,
    status: RequestStatus.APPROVED,
    item: "CNCS-STAFF-0036",
    by: "headChem",
    reason: "The lab stool set is unsafe — one of the stools has a cracked column.",
    createdDaysAgo: 15,
    reviewer: "officer",
    decidedDaysAgo: 13,
  },
  {
    id: "seed-req-head-chem-loan-rejected",
    type: RequestType.LOAN,
    status: RequestStatus.REJECTED,
    item: "CNCS-DEMO-0016",
    by: "headChem",
    reason: "Borrowing the noise measurement kit for the departmental safety audit.",
    createdDaysAgo: 18,
    reviewer: "officer",
    decidedDaysAgo: 16,
    rejectionReason:
      "The noise measurement kit is booked for the occupational-safety inspection.",
  },
  {
    id: "seed-req-head-chem-transfer-withdrawn",
    type: RequestType.TRANSFER,
    status: RequestStatus.WITHDRAWN,
    item: "CNCS-STAFF-0035",
    by: "headChem",
    reason: "Moving the magnetic stirrer to the shared bench.",
    createdDaysAgo: 9,
    withdrawnDaysAgo: 7,
    newFloor: "1",
    newRoom: "101",
  },

  // ── The property officer's own requests ──────────────────────────────────
  {
    id: "seed-req-officer-transfer-approved",
    type: RequestType.TRANSFER,
    status: RequestStatus.APPROVED,
    item: "CNCS-DEMO-0008",
    by: "officer",
    reason: "The photocopier is moving out of the corridor into the department print room.",
    createdDaysAgo: 9,
    reviewer: "headCS",
    decidedDaysAgo: 6,
    stage1By: "headCS",
    stage1DaysAgo: 7,
    stage2By: "headCS",
    stage2DaysAgo: 6,
    newFloor: "1",
    newRoom: "107",
  },
  {
    id: "seed-req-officer-transfer-rejected",
    type: RequestType.TRANSFER,
    status: RequestStatus.REJECTED,
    item: "CNCS-DEMO-0020",
    by: "officer",
    reason: "Handing the portable PA speaker over to the college auditorium store.",
    createdDaysAgo: 12,
    reviewer: "headCS",
    decidedDaysAgo: 10,
    rejectionReason:
      "The speaker is booked for the college open day; request it again once the event is over.",
    newFloor: "2",
    newRoom: "205",
  },
  {
    id: "seed-req-officer-transfer-pending",
    type: RequestType.TRANSFER,
    status: RequestStatus.PENDING,
    item: "CNCS-DEMO-0019",
    by: "officer",
    reason: "Moving the meeting-room tablet to the new registrar desk.",
    createdDaysAgo: 2,
    newFloor: "1",
    newRoom: "102",
  },

  // ── The accounts still waiting for approval ──────────────────────────────
  // These carry a full history too, so the counts hold for every row the
  // approval queue lists and not only for the accounts a person can log in as.
  {
    id: "seed-req-pendingcs-transfer-pending",
    type: RequestType.TRANSFER,
    status: RequestStatus.PENDING,
    item: "CNCS-STAFF-0040",
    by: "pendingCS",
    reason: "Moving the desktop PC into the new tutorial room 310.",
    createdDaysAgo: 20,
    newFloor: "3",
    newRoom: "310",
  },
  {
    id: "seed-req-pendingcs-disposal-rejected",
    type: RequestType.DISPOSAL,
    status: RequestStatus.REJECTED,
    item: "CNCS-STAFF-0041",
    by: "pendingCS",
    reason: "The USB-C cable set no longer charges the new laptops.",
    createdDaysAgo: 27,
    reviewer: "headCS",
    decidedDaysAgo: 25,
    rejectionReason:
      "Cables are consumables and are replaced from the college store on request.",
  },
  {
    id: "seed-req-pendingcs-transfer-withdrawn",
    type: RequestType.TRANSFER,
    status: RequestStatus.WITHDRAWN,
    item: "CNCS-STAFF-0042",
    by: "pendingCS",
    reason: "Moving the notebook set into the seminar room.",
    createdDaysAgo: 23,
    withdrawnDaysAgo: 21,
    newFloor: "3",
    newRoom: "312",
  },
  {
    id: "seed-req-pendingcs-transfer-stage1",
    type: RequestType.TRANSFER,
    status: RequestStatus.PENDING_STAGE1,
    item: "CNCS-STAFF-0044",
    by: "pendingCS",
    reason: "Handing the folding guest chair over to the tutorial room store.",
    createdDaysAgo: 19,
    stage1By: "headCS",
    stage1DaysAgo: 18,
    newFloor: "3",
    newRoom: "311",
  },
  {
    id: "seed-req-pendingcs-disposal-approved",
    type: RequestType.DISPOSAL,
    status: RequestStatus.APPROVED,
    item: "CNCS-DEMO-0009",
    by: "pendingCS",
    reason:
      "The college's steel filing cabinet is dented and the drawers no longer close.",
    createdDaysAgo: 28,
    reviewer: "officer",
    decidedDaysAgo: 26,
  },
  {
    id: "seed-req-pendingbio-transfer-pending",
    type: RequestType.TRANSFER,
    status: RequestStatus.PENDING,
    item: "CNCS-STAFF-0046",
    by: "pendingBio",
    reason: "Moving the benchtop shaker into the new genetics lab.",
    createdDaysAgo: 18,
    newFloor: "2",
    newRoom: "214",
  },
  {
    id: "seed-req-pendingbio-disposal-rejected",
    type: RequestType.DISPOSAL,
    status: RequestStatus.REJECTED,
    item: "CNCS-STAFF-0047",
    by: "pendingBio",
    reason: "The incubator sensor probe is no longer reading correctly.",
    createdDaysAgo: 25,
    reviewer: "headBio",
    decidedDaysAgo: 23,
    rejectionReason:
      "The probe is a spare part for the incubator — order a replacement instead of disposing of it.",
  },
  {
    id: "seed-req-pendingbio-transfer-withdrawn",
    type: RequestType.TRANSFER,
    status: RequestStatus.WITHDRAWN,
    item: "CNCS-STAFF-0045",
    by: "pendingBio",
    reason: "Moving the sample vial box into the shared store.",
    createdDaysAgo: 21,
    withdrawnDaysAgo: 19,
    newFloor: "2",
    newRoom: "215",
  },
  {
    id: "seed-req-pendingbio-transfer-stage1",
    type: RequestType.TRANSFER,
    status: RequestStatus.PENDING_STAGE1,
    item: "CNCS-STAFF-0049",
    by: "pendingBio",
    reason: "Handing the pipette stand over to the departmental store.",
    createdDaysAgo: 17,
    stage1By: "headBio",
    stage1DaysAgo: 16,
    newFloor: "2",
    newRoom: "216",
  },
  {
    id: "seed-req-pendingbio-loan-approved",
    type: RequestType.LOAN,
    status: RequestStatus.APPROVED,
    item: "CNCS-DEMO-0017",
    by: "pendingBio",
    reason: "Borrowing the portable sound kit to record the student research presentations.",
    createdDaysAgo: 22,
    reviewer: "officer",
    decidedDaysAgo: 20,
    loanDueInDays: 25,
  },
  {
    id: "seed-req-pendingphys-transfer-pending",
    type: RequestType.TRANSFER,
    status: RequestStatus.PENDING,
    item: "CNCS-STAFF-0052",
    by: "pendingPhys",
    reason: "Moving the signal generator into the electronics teaching room.",
    createdDaysAgo: 16,
    newFloor: "1",
    newRoom: "104",
  },
  {
    id: "seed-req-pendingphys-disposal-rejected",
    type: RequestType.DISPOSAL,
    status: RequestStatus.REJECTED,
    item: "CNCS-STAFF-0053",
    by: "pendingPhys",
    reason: "The calculator set's covers are broken and the keys stick.",
    createdDaysAgo: 23,
    reviewer: "officer",
    decidedDaysAgo: 21,
    rejectionReason:
      "The calculators are college property; the store will replace the set.",
  },
  {
    id: "seed-req-pendingphys-transfer-withdrawn",
    type: RequestType.TRANSFER,
    status: RequestStatus.WITHDRAWN,
    item: "CNCS-STAFF-0050",
    by: "pendingPhys",
    reason: "Moving the laser distance meter into the corridor store.",
    createdDaysAgo: 19,
    withdrawnDaysAgo: 17,
    newFloor: "1",
    newRoom: "106",
  },
  {
    id: "seed-req-pendingphys-disposal-approved",
    type: RequestType.DISPOSAL,
    status: RequestStatus.APPROVED,
    item: "CNCS-DEMO-0018",
    by: "pendingPhys",
    reason:
      "The mobile whiteboard's frame is bent and it can no longer be moved safely.",
    createdDaysAgo: 24,
    reviewer: "officer",
    decidedDaysAgo: 22,
  },
  {
    id: "seed-req-pendingphys-loan-rejected",
    type: RequestType.LOAN,
    status: RequestStatus.REJECTED,
    item: "CNCS-DEMO-0012",
    by: "pendingPhys",
    reason: "Borrowing the field measurement kit for the physics practical.",
    createdDaysAgo: 26,
    reviewer: "officer",
    decidedDaysAgo: 24,
    rejectionReason:
      "The measurement kit is out with the computer science staff until the end of the month.",
  },
  {
    id: "seed-req-newcs-transfer-pending",
    type: RequestType.TRANSFER,
    status: RequestStatus.PENDING,
    item: "CNCS-STAFF-0055",
    by: "newCS",
    reason: "Moving the USB microphone into the recording booth.",
    createdDaysAgo: 14,
    newFloor: "3",
    newRoom: "311",
  },
  {
    id: "seed-req-newcs-disposal-rejected",
    type: RequestType.DISPOSAL,
    status: RequestStatus.REJECTED,
    item: "CNCS-STAFF-0058",
    by: "newCS",
    reason: "The portable SSD is not detected by the new laptops.",
    createdDaysAgo: 21,
    reviewer: "headCS",
    decidedDaysAgo: 19,
    rejectionReason:
      "Storage drives are replaced from the college store on request.",
  },
  {
    id: "seed-req-newcs-transfer-withdrawn",
    type: RequestType.TRANSFER,
    status: RequestStatus.WITHDRAWN,
    item: "CNCS-STAFF-0056",
    by: "newCS",
    reason: "Moving the webcam into the seminar room.",
    createdDaysAgo: 17,
    withdrawnDaysAgo: 15,
    newFloor: "2",
    newRoom: "203",
  },
  {
    id: "seed-req-newcs-loan-waitlisted",
    type: RequestType.LOAN,
    status: RequestStatus.WAITLISTED,
    item: "CNCS-DEMO-0011",
    by: "newCS",
    reason:
      "Borrowing the digital camera kit for the student club's photo session — the kit is already promised to another member of staff.",
    createdDaysAgo: 20,
    reviewer: "officer",
    decidedDaysAgo: 18,
    loanDueInDays: 8,
  },
  {
    id: "seed-req-newcs-transfer-stage1",
    type: RequestType.TRANSFER,
    status: RequestStatus.PENDING_STAGE1,
    item: "CNCS-STAFF-0059",
    by: "newCS",
    reason: "Handing the folding desk over to the tutorial room store.",
    createdDaysAgo: 13,
    stage1By: "headCS",
    stage1DaysAgo: 12,
    newFloor: "3",
    newRoom: "311",
  },
  {
    id: "seed-req-escalatedcs-transfer-pending",
    type: RequestType.TRANSFER,
    status: RequestStatus.PENDING,
    item: "CNCS-STAFF-0060",
    by: "escalatedCS",
    reason: "Moving the development laptop into the new research room 312.",
    createdDaysAgo: 15,
    newFloor: "3",
    newRoom: "312",
  },
  {
    id: "seed-req-escalatedcs-disposal-rejected",
    type: RequestType.DISPOSAL,
    status: RequestStatus.REJECTED,
    item: "CNCS-STAFF-0061",
    by: "escalatedCS",
    reason: "The USB-C hub drops the second display every time it is plugged in.",
    createdDaysAgo: 15,
    reviewer: "headCS",
    decidedDaysAgo: 13,
    rejectionReason:
      "Peripherals are replaced from the college store on request; they are not disposed of.",
  },
  {
    id: "seed-req-escalatedcs-transfer-withdrawn",
    type: RequestType.TRANSFER,
    status: RequestStatus.WITHDRAWN,
    item: "CNCS-STAFF-0062",
    by: "escalatedCS",
    reason: "Moving the toolkit into the shared lab store.",
    createdDaysAgo: 13,
    withdrawnDaysAgo: 11,
    newFloor: "2",
    newRoom: "204",
  },
  {
    id: "seed-req-escalatedcs-transfer-stage1",
    type: RequestType.TRANSFER,
    status: RequestStatus.PENDING_STAGE1,
    item: "CNCS-STAFF-0063",
    by: "escalatedCS",
    reason: "Handing the footrest over to the department store.",
    createdDaysAgo: 9,
    stage1By: "headCS",
    stage1DaysAgo: 8,
    newFloor: "2",
    newRoom: "206",
  },
  {
    id: "seed-req-escalatedcs-loan-waitlisted",
    type: RequestType.LOAN,
    status: RequestStatus.WAITLISTED,
    item: "CNCS-DEMO-0011",
    by: "escalatedCS",
    reason:
      "Borrowing the digital camera kit for the departmental workshop — the kit is already promised to another member of staff.",
    createdDaysAgo: 12,
    reviewer: "officer",
    decidedDaysAgo: 10,
    loanDueInDays: 11,
  },
  {
    id: "seed-req-rejectedchem-transfer-pending",
    type: RequestType.TRANSFER,
    status: RequestStatus.PENDING,
    item: "CNCS-STAFF-0065",
    by: "rejectedChem",
    reason: "Moving the drying cabinet into the new synthesis room.",
    createdDaysAgo: 14,
    newFloor: "1",
    newRoom: "106",
  },
  {
    id: "seed-req-rejectedchem-disposal-rejected",
    type: RequestType.DISPOSAL,
    status: RequestStatus.REJECTED,
    item: "CNCS-STAFF-0066",
    by: "rejectedChem",
    reason: "The hot plate's display flickers and the reading cannot be trusted.",
    createdDaysAgo: 14,
    reviewer: "officer",
    decidedDaysAgo: 12,
    rejectionReason:
      "PPE and small instruments are replaced from the college store; send the hot plate for service instead.",
  },
  {
    id: "seed-req-rejectedchem-transfer-withdrawn",
    type: RequestType.TRANSFER,
    status: RequestStatus.WITHDRAWN,
    item: "CNCS-STAFF-0067",
    by: "rejectedChem",
    reason: "Moving the glove set into the shared store.",
    createdDaysAgo: 12,
    withdrawnDaysAgo: 10,
    newFloor: "1",
    newRoom: "101",
  },
  {
    id: "seed-req-rejectedchem-transfer-stage1",
    type: RequestType.TRANSFER,
    status: RequestStatus.PENDING_STAGE1,
    item: "CNCS-STAFF-0068",
    by: "rejectedChem",
    reason: "Handing the lab coat over to the departmental store.",
    createdDaysAgo: 8,
    stage1By: "headChem",
    stage1DaysAgo: 7,
    newFloor: "1",
    newRoom: "101",
  },
  {
    id: "seed-req-rejectedchem-loan-waitlisted",
    type: RequestType.LOAN,
    status: RequestStatus.WAITLISTED,
    item: "CNCS-DEMO-0016",
    by: "rejectedChem",
    reason:
      "Borrowing the noise measurement kit for the departmental safety audit — the kit is already promised to another member of staff.",
    createdDaysAgo: 11,
    reviewer: "officer",
    decidedDaysAgo: 9,
    loanDueInDays: 13,
  },
];

interface NotificationSpec {
  id: string;
  /** The account the message lands in. */
  to: UserKey;
  message: string;
  request?: string;
  isRead?: boolean;
  createdDaysAgo: number;
}

interface AuditResultSpec {
  item: string;
  result: AuditItemResult;
  scannedDaysAgo?: number;
}

interface EditLogSpec {
  id: string;
  item: string;
  by: UserKey;
  field: string;
  oldValue: string;
  newValue: string;
  daysAgo: number;
}

async function main() {
  console.log("Seeding categories...");
  const categoryNames = ["Electronics", "Furniture", "Lab Equipment", "Vehicles", "Office Supplies"];
  const categories = await Promise.all(
    categoryNames.map((name) =>
      prisma.category.upsert({
        where: { name },
        update: {},
        create: { name },
      }),
    ),
  );
  const categoriesByName = Object.fromEntries(categories.map((c) => [c.name, c]));

  console.log("Seeding Buildings...");
  const buildingSpecs = [
    { code: "CNCS", name: "CNCS Building", description: "Main CNCS Building" },
    { code: "SCIENCE", name: "Science Complex", description: "Science Complex Building" },
    { code: "CHEM", name: "Chemistry Building", description: "Chemistry Building" },
    { code: "PHYS", name: "Physics Building", description: "Physics Building" },
  ];
  const buildings = await Promise.all(
    buildingSpecs.map((spec) =>
      prisma.building.upsert({
        where: { code: spec.code },
        update: { name: spec.name, description: spec.description },
        create: spec,
      }),
    ),
  );
  const buildingsByCode = Object.fromEntries(buildings.map((b) => [b.code, b]));

  console.log("Seeding OrgUnits (College + Departments)...");
  const college = await prisma.orgUnit.upsert({
    where: { name: "CNCS" },
    update: { code: "CNCS", type: OrgUnitType.COLLEGE, isActive: true, acceptsSelfReg: false },
    create: {
      name: "CNCS",
      code: "CNCS",
      type: OrgUnitType.COLLEGE,
      isActive: true,
      acceptsSelfReg: false,
    },
  });

  const departmentSpecs = [
    { name: "Computer Science", code: "CS" },
    { name: "Biology", code: "BIO" },
    { name: "Chemistry", code: "CHEM" },
    { name: "Physics", code: "PHYS" },
  ];
  const departments = new Map<UnitKey, { id: string; name: string }>();
  for (const spec of departmentSpecs) {
    const unit = await prisma.orgUnit.upsert({
      where: { name: spec.name },
      update: {
        code: spec.code,
        type: OrgUnitType.DEPARTMENT,
        isActive: true,
        acceptsSelfReg: true,
        parentId: college.id,
      },
      create: {
        name: spec.name,
        code: spec.code,
        type: OrgUnitType.DEPARTMENT,
        isActive: true,
        acceptsSelfReg: true,
        parentId: college.id,
      },
    });
    departments.set(spec.code.toLowerCase() as UnitKey, { id: unit.id, name: unit.name });
  }
  const units = new Map<UnitKey, string>([["college", college.id]]);
  for (const [key, value] of departments) units.set(key, value.id);

  console.log("Seeding users...");
  const users = new Map<UserKey, { id: string; email: string; fullName: string }>();
  for (const account of ACCOUNTS) {
    const passwordHash = await hashPassword(account.password);
    const orgUnitId = account.unit ? (units.get(account.unit) ?? null) : null;
    const reviewerId = account.reviewedBy
      ? (users.get(account.reviewedBy)?.id ?? null)
      : null;
    const escalatedById = account.escalatedBy
      ? (users.get(account.escalatedBy)?.id ?? null)
      : null;

    const user = await prisma.user.upsert({
      where: { email: account.email },
      /**
       * The update branch carries the same facts as the create branch — status,
       * role, unit, password. The status matters most: the schema default is
       * `PENDING_EMAIL_VERIFICATION`, so a row that already exists keeps
       * whatever status it had unless the update says otherwise. Leaving the
       * status out of the update branch is what made the seeded administrator
       * unable to sign in.
       */
      update: {
        fullName: account.fullName,
        passwordHash,
        role: account.role,
        orgUnitId,
        staffId: account.staffId,
        accountStatus: account.status,
        mustChangePassword: false,
        tokenVersion: 0,
        reviewNote: account.reviewNote ?? null,
        reviewedById: reviewerId,
        reviewedAt: account.status === AccountStatus.REJECTED ? daysAgo(5) : null,
        escalatedAt: escalatedById ? daysAgo(2) : null,
        escalatedById,
      },
      create: {
        fullName: account.fullName,
        email: account.email,
        passwordHash,
        role: account.role,
        orgUnitId,
        staffId: account.staffId,
        accountStatus: account.status,
        mustChangePassword: false,
        reviewNote: account.reviewNote ?? null,
        reviewedById: reviewerId,
        reviewedAt: account.status === AccountStatus.REJECTED ? daysAgo(5) : null,
        escalatedAt: escalatedById ? daysAgo(2) : null,
        escalatedById,
      },
    });
    users.set(account.key, { id: user.id, email: user.email, fullName: user.fullName });
  }

  // The department heads. Physics deliberately has none — the vacant-head
  // fallback is one of the things the demo has to be able to show.
  const headAssignments: Array<[UnitKey, UserKey]> = [
    ["cs", "headCS"],
    ["bio", "headBio"],
    ["chem", "headChem"],
  ];
  for (const [unitKey, userKey] of headAssignments) {
    await prisma.orgUnit.update({
      where: { id: units.get(unitKey)! },
      data: { headId: users.get(userKey)!.id },
    });
  }

  console.log("Seeding items + QR tags...");
  const items = new Map<
    string,
    { id: string; tagId: string; name: string; holderType: HolderType | null; holderId: string | null }
  >();

  for (const [index, spec] of ITEMS.entries()) {
    const category = categoriesByName[spec.category];
    if (!category) {
      throw new Error(`Unknown category "${spec.category}" for ${spec.tagId}`);
    }
    const building = buildingsByCode[spec.building];
    if (!building) {
      throw new Error(`Unknown building "${spec.building}" for ${spec.tagId}`);
    }
    const owner = users.get(spec.owner);
    if (!owner) {
      throw new Error(`Unknown owner "${spec.owner}" for ${spec.tagId}`);
    }

    const holderType =
      spec.holder === "STAFF"
        ? HolderType.STAFF
        : spec.holder === "DEPARTMENT"
          ? HolderType.DEPARTMENT
          : HolderType.COLLEGE;
    const holderId =
      holderType === HolderType.STAFF
        ? (users.get(spec.holderUser ?? spec.owner)?.id ?? null)
        : holderType === HolderType.DEPARTMENT
          ? (units.get(spec.unit) ?? null)
          : null;

    const data = {
      name: spec.name,
      categoryId: category.id,
      orgUnitId: units.get(spec.unit) ?? null,
      buildingId: building.id,
      floor: spec.floor,
      room: spec.room,
      ownerId: owner.id,
      holderType,
      holderId,
      purchaseCost: spec.cost,
      currentValue: Math.round(spec.cost * 0.7),
      condition: spec.condition,
      brand: spec.brand ?? null,
      model: spec.model ?? null,
      serialNumber: `CNCS-SN-${spec.tagId.replace(/^CNCS-/, "")}`,
      photoUrl: spec.photo ?? null,
      notes: spec.notes ?? null,
      status: spec.status ?? ItemStatus.ACTIVE,
      disposalReason: spec.disposalReason ?? null,
      disposedAt: spec.disposedDaysAgo !== undefined ? daysAgo(spec.disposedDaysAgo) : null,
      voidReason: spec.voidReason ?? null,
      voidedAt: spec.voidedDaysAgo !== undefined ? daysAgo(spec.voidedDaysAgo) : null,
      voidedById: spec.voidedDaysAgo !== undefined ? (users.get("officer")?.id ?? null) : null,
      claimedAt: null,
      claimDueAt: null,
      lastAuditedAt: null,
      lastVerifiedAt: null,
      lastVerifiedById: null,
      registeredAt: daysAgo(180 - (index % 90)),
    };

    const item = await prisma.item.upsert({
      where: { tagId: spec.tagId },
      update: data,
      create: { tagId: spec.tagId, ...data },
    });
    items.set(item.tagId, {
      id: item.id,
      tagId: item.tagId,
      name: item.name,
      holderType: item.holderType,
      holderId: item.holderId,
    });
  }

  // The accessory link, once both rows exist: the charger travels with the
  // laptop it belongs to, and the cascade rules read this column.
  for (const spec of ITEMS) {
    if (!spec.parentTagId) continue;
    const parent = items.get(spec.parentTagId);
    const child = items.get(spec.tagId);
    if (!parent || !child) {
      throw new Error(`Accessory ${spec.tagId} / parent ${spec.parentTagId} did not seed.`);
    }
    await prisma.item.update({
      where: { id: child.id },
      data: { parentItemId: parent.id },
    });
  }

  console.log("Generating QR tags...");
  for (const spec of ITEMS) {
    await generateTagQR(spec.tagId);
  }

  console.log("Seeding requests (all nine states)...");
  const requests = new Map<string, { id: string }>();
  for (const spec of REQUESTS) {
    const item = items.get(spec.item);
    if (!item) {
      throw new Error(`Unknown item "${spec.item}" for request ${spec.id}`);
    }
    const requester = users.get(spec.by);
    if (!requester) {
      throw new Error(`Unknown requester "${spec.by}" for request ${spec.id}`);
    }
    const reviewer = spec.reviewer ? users.get(spec.reviewer) : undefined;
    if (spec.reviewer && !reviewer) {
      throw new Error(`Unknown reviewer "${spec.reviewer}" for request ${spec.id}`);
    }
    const newOwner = spec.newOwner ? users.get(spec.newOwner) : undefined;
    if (spec.newOwner && !newOwner) {
      throw new Error(`Unknown new owner "${spec.newOwner}" for request ${spec.id}`);
    }

    const data = {
      type: spec.type,
      status: spec.status,
      itemId: item.id,
      requestedById: requester.id,
      reviewedById: reviewer?.id ?? null,
      reason: spec.reason,
      rejectionReason: spec.rejectionReason ?? null,
      /**
       * The building the request names, by id — the value the workflow writes
       * into `Item.buildingId`, which is a foreign key. A request that does not
       * change buildings names none, and the item keeps the building it is in.
       */
      newLocationBuilding: spec.newBuildingCode
        ? (buildingsByCode[spec.newBuildingCode]?.id ?? null)
        : null,
      newLocationFloor: spec.newFloor ?? null,
      newLocationRoom: spec.newRoom ?? null,
      newOwnerId: newOwner?.id ?? null,
      /**
       * The holder pair travels with the request that names a new custodian:
       * where the item is coming from, and where it is going. The app records
       * the same pair on the custody event; the request keeps it so the row
       * still says who was supposed to take it.
       */
      fromHolderType: newOwner ? item.holderType : null,
      fromHolderId: newOwner ? item.holderId : null,
      toHolderType: newOwner ? HolderType.STAFF : null,
      toHolderId: newOwner ? newOwner.id : null,
      stage1ApprovedById: spec.stage1By ? (users.get(spec.stage1By)?.id ?? null) : null,
      stage1ApprovedAt:
        spec.stage1DaysAgo !== undefined ? daysAgo(spec.stage1DaysAgo) : null,
      stage2ApprovedById: spec.stage2By ? (users.get(spec.stage2By)?.id ?? null) : null,
      stage2ApprovedAt:
        spec.stage2DaysAgo !== undefined ? daysAgo(spec.stage2DaysAgo) : null,
      loanDueDate: spec.loanDueInDays !== undefined ? daysAhead(spec.loanDueInDays) : null,
      loanReturnedAt: null,
      loanReturnedById: null,
      withdrawnAt: spec.withdrawnDaysAgo !== undefined ? daysAgo(spec.withdrawnDaysAgo) : null,
      withdrawnById: spec.withdrawnDaysAgo !== undefined ? requester.id : null,
      invalidatedAt:
        spec.invalidatedDaysAgo !== undefined ? daysAgo(spec.invalidatedDaysAgo) : null,
      invalidatedReason: spec.invalidatedReason ?? null,
      createdAt: daysAgo(spec.createdDaysAgo),
      decidedAt: spec.decidedDaysAgo !== undefined ? daysAgo(spec.decidedDaysAgo) : null,
    };

    const request = await prisma.request.upsert({
      where: { id: spec.id },
      update: data,
      create: { id: spec.id, ...data },
    });
    requests.set(request.id, { id: request.id });
  }

  console.log("Seeding account approval requests...");
  const accountRequestSpecs = [
    {
      user: "pendingCS" as UserKey,
      unit: "cs" as UnitKey,
      status: AccountRequestStatus.PENDING_APPROVAL,
      submittedDaysAgo: 9,
    },
    {
      user: "pendingBio" as UserKey,
      unit: "bio" as UnitKey,
      status: AccountRequestStatus.PENDING_APPROVAL,
      submittedDaysAgo: 8,
    },
    {
      // Physics has no head, so no department head can decide this one — it is
      // the request that only a System Admin can act on.
      user: "pendingPhys" as UserKey,
      unit: "phys" as UnitKey,
      status: AccountRequestStatus.PENDING_APPROVAL,
      submittedDaysAgo: 7,
    },
    {
      user: "newCS" as UserKey,
      unit: "cs" as UnitKey,
      status: AccountRequestStatus.PENDING_APPROVAL,
      submittedDaysAgo: 6,
    },
    {
      user: "escalatedCS" as UserKey,
      unit: "cs" as UnitKey,
      status: AccountRequestStatus.ESCALATED,
      submittedDaysAgo: 12,
      escalatedBy: "headCS" as UserKey,
      escalationReason: "Not in my department",
    },
    {
      user: "rejectedChem" as UserKey,
      unit: "chem" as UnitKey,
      status: AccountRequestStatus.REJECTED,
      submittedDaysAgo: 10,
      decidedBy: "admin" as UserKey,
      rejectionReason:
        "The staff ID does not match the college personnel register. Please re-apply with the ID printed on your ID card.",
      decisionNote: "Declined by the System Admin after checking the personnel register.",
    },
    {
      // The outstanding privileged invitation.
      user: "invitedAuditor" as UserKey,
      unit: "college" as UnitKey,
      status: AccountRequestStatus.PENDING_APPROVAL,
      submittedDaysAgo: 1,
      invitedBy: "admin" as UserKey,
      authorizedBy: "College Dean, Addis Ababa University",
      authorizationRef: "AAU/HR/2026/114",
      authorizationNote:
        "Approved as the second college auditor for the 2026 stock-take.",
    },
  ];

  for (const spec of accountRequestSpecs) {
    const user = users.get(spec.user);
    if (!user) {
      throw new Error(`Unknown account request for "${spec.user}"`);
    }
    const decidedById = spec.decidedBy ? (users.get(spec.decidedBy)?.id ?? null) : null;
    const escalatedById = spec.escalatedBy ? (users.get(spec.escalatedBy)?.id ?? null) : null;
    const invitedById = spec.invitedBy ? (users.get(spec.invitedBy)?.id ?? null) : null;

    const data = {
      requestedUnitId: units.get(spec.unit)!,
      confirmedUnitId: null,
      status: spec.status,
      submittedAt: daysAgo(spec.submittedDaysAgo),
      decidedAt: spec.status === AccountRequestStatus.REJECTED ? daysAgo(5) : null,
      decidedById,
      decisionNote: spec.decisionNote ?? null,
      rejectionReason: spec.rejectionReason ?? null,
      escalatedAt: escalatedById ? daysAgo(2) : null,
      escalatedById,
      escalationReason: spec.escalationReason ?? null,
      authorizedBy: spec.authorizedBy ?? null,
      authorizationRef: spec.authorizationRef ?? null,
      authorizationNote: spec.authorizationNote ?? null,
      invitedById,
      invitedAt: invitedById ? daysAgo(spec.submittedDaysAgo) : null,
    };

    await prisma.accountRequest.upsert({
      where: { userId: user.id },
      update: data,
      create: { userId: user.id, ...data },
    });
  }

  console.log("Seeding the outstanding privileged invitation...");
  const invited = users.get("invitedAuditor")!;
  /**
   * A resend replaces the token row, so the seed first clears any other live
   * invitation for this address. Without that, a seed run after a resend would
   * leave two invitation rows for one person and the invite list would show the
   * same appointment twice.
   */
  await prisma.emailToken.deleteMany({
    where: {
      userId: invited.id,
      type: EmailTokenType.INVITE,
      id: { not: SEED_INVITE_TOKEN_ID },
    },
  });
  await prisma.emailToken.upsert({
    where: { id: SEED_INVITE_TOKEN_ID },
    update: {
      userId: invited.id,
      type: EmailTokenType.INVITE,
      tokenHash: hashInviteToken(SEED_INVITE_TOKEN),
      expiresAt: daysAhead(2),
      usedAt: null,
    },
    create: {
      id: SEED_INVITE_TOKEN_ID,
      userId: invited.id,
      type: EmailTokenType.INVITE,
      tokenHash: hashInviteToken(SEED_INVITE_TOKEN),
      expiresAt: daysAhead(2),
    },
  });

  console.log("Seeding the administrator's action log...");
  const actionLogSpecs = [
    {
      id: "seed-actionlog-0001",
      action: "ACCOUNT_APPROVED",
      actor: "admin",
      target: "headCS",
      unit: "cs",
      daysAgo: 210,
      authorizedBy: "College Dean, Addis Ababa University",
      authorizationRef: "AAU/HR/2024/07",
    },
    {
      id: "seed-actionlog-0002",
      action: "ACCOUNT_INVITE_SENT",
      actor: "admin",
      target: "invitedAuditor",
      unit: null,
      daysAgo: 1,
      authorizedBy: "College Dean, Addis Ababa University",
      authorizationRef: "AAU/HR/2026/114",
    },
    {
      id: "seed-actionlog-0003",
      action: "ACCOUNT_ESCALATED",
      actor: "headCS",
      target: "escalatedCS",
      unit: "cs",
      daysAgo: 2,
      authorizedBy: null,
      authorizationRef: null,
    },
    {
      id: "seed-actionlog-0004",
      action: "ACCOUNT_REJECTED",
      actor: "admin",
      target: "rejectedChem",
      unit: "chem",
      daysAgo: 5,
      authorizedBy: null,
      authorizationRef: null,
    },
  ];
  for (const spec of actionLogSpecs) {
    const data = {
      actorId: users.get(spec.actor)!.id,
      action: spec.action,
      targetUserId: users.get(spec.target)!.id,
      unitId: spec.unit ? (units.get(spec.unit) ?? null) : null,
      authorizedBy: spec.authorizedBy,
      authorizationRef: spec.authorizationRef,
      createdAt: daysAgo(spec.daysAgo),
    };
    await prisma.adminActionLog.upsert({
      where: { id: spec.id },
      update: data,
      create: { id: spec.id, ...data },
    });
  }

  console.log("Seeding notifications...");
  /**
   * The message helpers are the app's own, so the `[CODE]` prefix is exactly
   * the form `parseNotificationMessage()` expects: `REQUEST_SUBMITTED` for a
   * request that needs a decision, `REQUEST_APPROVED` / `REQUEST_REJECTED` for
   * one that has been decided. Nothing here invents a code the app cannot
   * parse — a row whose prefix is not one of the three is returned to the
   * client with its prefix still in the text.
   */
  const submitted = (
    by: UserKey,
    type: "TRANSFER" | "DISPOSAL" | "LOAN",
    tagId: string,
  ): string =>
    renderRequestSubmitted({
      requesterName: users.get(by)!.fullName,
      requestType: type,
      itemTagId: tagId,
      itemName: items.get(tagId)!.name,
    });

  const decided = (
    decision: "APPROVED" | "REJECTED",
    type: "TRANSFER" | "DISPOSAL" | "LOAN",
    tagId: string,
    by: UserKey,
    rejectionReason?: string,
  ): string =>
    renderRequestDecided({
      decision,
      requestType: type,
      itemTagId: tagId,
      itemName: items.get(tagId)!.name,
      reviewerName: users.get(by)!.fullName,
      ...(rejectionReason ? { rejectionReason } : {}),
    });

  const notificationSpecs: NotificationSpec[] = [
    // ── The property officer ───────────────────────────────────────────────
    // The app fans every request out to the officer, so this inbox is mostly
    // "needs your review" — plus the two decisions that came back to them.
    {
      id: "seed-notif-0001",
      to: "officer",
      request: "seed-req-0001",
      message: submitted("cs1", "TRANSFER", "CNCS-DEMO-0001"),
      createdDaysAgo: 3,
    },
    {
      id: "seed-notif-disposal",
      to: "officer",
      request: "seed-req-disposal",
      message: submitted("headCS", "DISPOSAL", "CNCS-DEMO-0002"),
      createdDaysAgo: 14,
    },
    {
      id: "seed-notif-cross-dept-officer",
      to: "officer",
      request: "seed-req-cross-dept",
      message: submitted("bio1", "TRANSFER", "CNCS-STAFF-0074"),
      createdDaysAgo: 12,
    },
    {
      id: "seed-notif-staff-transfer-1-officer",
      to: "officer",
      request: "seed-req-staff-transfer-1",
      message: submitted("cs1", "TRANSFER", "CNCS-STAFF-0001"),
      createdDaysAgo: 2,
    },
    {
      id: "seed-notif-staff-disposal-1-officer",
      to: "officer",
      request: "seed-req-staff-disposal-1",
      message: submitted("cs2", "DISPOSAL", "CNCS-STAFF-0005"),
      createdDaysAgo: 4,
    },
    {
      id: "seed-notif-officer-submitted-bio2",
      to: "officer",
      request: "seed-req-bio2-disposal-pending",
      message: submitted("bio2", "DISPOSAL", "CNCS-STAFF-0075"),
      createdDaysAgo: 4,
    },
    {
      id: "seed-notif-officer-approved",
      to: "officer",
      request: "seed-req-officer-transfer-approved",
      message: decided("APPROVED", "TRANSFER", "CNCS-DEMO-0008", "headCS"),
      createdDaysAgo: 6,
    },
    {
      id: "seed-notif-officer-rejected",
      to: "officer",
      request: "seed-req-officer-transfer-rejected",
      message: decided(
        "REJECTED",
        "TRANSFER",
        "CNCS-DEMO-0020",
        "headCS",
        "The speaker is booked for the college open day; request it again once the event is over.",
      ),
      createdDaysAgo: 10,
    },

    // ── The Computer Science department head ───────────────────────────────
    {
      id: "seed-notif-dept-head",
      to: "headCS",
      request: "seed-req-0001",
      message: submitted("cs1", "TRANSFER", "CNCS-DEMO-0001"),
      createdDaysAgo: 3,
    },
    {
      id: "seed-notif-disposal-head",
      to: "headCS",
      request: "seed-req-disposal",
      message: submitted("headCS", "DISPOSAL", "CNCS-DEMO-0002"),
      createdDaysAgo: 14,
      isRead: true,
    },
    {
      id: "seed-notif-cross-dept",
      to: "headCS",
      request: "seed-req-cross-dept",
      message: submitted("bio1", "TRANSFER", "CNCS-STAFF-0074"),
      createdDaysAgo: 12,
    },
    {
      id: "seed-notif-staff-transfer-1",
      to: "headCS",
      request: "seed-req-staff-transfer-1",
      message: submitted("cs1", "TRANSFER", "CNCS-STAFF-0001"),
      createdDaysAgo: 2,
    },
    {
      id: "seed-notif-staff-disposal-1",
      to: "headCS",
      request: "seed-req-staff-disposal-1",
      message: submitted("cs2", "DISPOSAL", "CNCS-STAFF-0005"),
      createdDaysAgo: 4,
    },
    {
      id: "seed-notif-headcs-submitted-bio1",
      to: "headCS",
      request: "seed-req-bio1-transfer-pending",
      message: submitted("bio1", "TRANSFER", "CNCS-STAFF-0006"),
      createdDaysAgo: 5,
    },
    {
      id: "seed-notif-headcs-submitted-cs3",
      to: "headCS",
      request: "seed-req-cs3-transfer-stage2",
      message: submitted("cs3", "TRANSFER", "CNCS-STAFF-0019"),
      createdDaysAgo: 5,
    },
    {
      id: "seed-notif-headcs-approved",
      to: "headCS",
      request: "seed-req-head-cs-disposal-approved",
      message: decided("APPROVED", "DISPOSAL", "CNCS-STAFF-0079", "officer"),
      createdDaysAgo: 17,
    },
    {
      id: "seed-notif-headcs-rejected",
      to: "headCS",
      request: "seed-req-head-cs-loan-rejected",
      message: decided(
        "REJECTED",
        "LOAN",
        "CNCS-DEMO-0011",
        "officer",
        "The camera kit is already booked for the open day itself.",
      ),
      createdDaysAgo: 18,
    },

    // ── The Biology department head ────────────────────────────────────────
    {
      id: "seed-notif-headbio-submitted-bio2",
      to: "headBio",
      request: "seed-req-bio2-transfer-approved",
      message: submitted("bio2", "TRANSFER", "CNCS-STAFF-0008"),
      createdDaysAgo: 9,
    },
    {
      id: "seed-notif-headbio-submitted-cs3",
      to: "headBio",
      request: "seed-req-cs3-transfer-stage2",
      message: submitted("cs3", "TRANSFER", "CNCS-STAFF-0019"),
      createdDaysAgo: 5,
    },
    {
      id: "seed-notif-headbio-submitted-bio1",
      to: "headBio",
      request: "seed-req-bio1-transfer-pending",
      message: submitted("bio1", "TRANSFER", "CNCS-STAFF-0006"),
      createdDaysAgo: 5,
    },
    {
      id: "seed-notif-headbio-approved",
      to: "headBio",
      request: "seed-req-head-bio-loan-approved",
      message: decided("APPROVED", "LOAN", "CNCS-DEMO-0015", "officer"),
      createdDaysAgo: 14,
    },
    {
      id: "seed-notif-headbio-rejected",
      to: "headBio",
      request: "seed-req-head-bio-transfer-rejected",
      message: decided(
        "REJECTED",
        "TRANSFER",
        "CNCS-STAFF-0028",
        "officer",
        "The cryo freezer is shared with the sample repository; moving it would interrupt the sample audit trail.",
      ),
      createdDaysAgo: 19,
    },

    // ── The Chemistry department head ──────────────────────────────────────
    {
      id: "seed-notif-headchem-submitted-cs1",
      to: "headChem",
      request: "seed-req-staff-transfer-1",
      message: submitted("cs1", "TRANSFER", "CNCS-STAFF-0001"),
      createdDaysAgo: 2,
    },
    {
      id: "seed-notif-headchem-submitted-chem1",
      to: "headChem",
      request: "seed-req-chem1-transfer-pending",
      message: submitted("chem1", "TRANSFER", "CNCS-STAFF-0009"),
      createdDaysAgo: 5,
    },
    {
      id: "seed-notif-headchem-submitted-bio1",
      to: "headChem",
      request: "seed-req-bio1-transfer-pending",
      message: submitted("bio1", "TRANSFER", "CNCS-STAFF-0006"),
      createdDaysAgo: 5,
    },
    {
      id: "seed-notif-headchem-approved",
      to: "headChem",
      request: "seed-req-head-chem-disposal-approved",
      message: decided("APPROVED", "DISPOSAL", "CNCS-STAFF-0036", "officer"),
      createdDaysAgo: 13,
    },
    {
      id: "seed-notif-headchem-rejected",
      to: "headChem",
      request: "seed-req-head-chem-loan-rejected",
      message: decided(
        "REJECTED",
        "LOAN",
        "CNCS-DEMO-0016",
        "officer",
        "The noise measurement kit is booked for the occupational-safety inspection.",
      ),
      createdDaysAgo: 16,
    },

    // ── The staff — the decisions that came back to them ───────────────────
    {
      id: "seed-notif-cs1-rejected",
      to: "cs1",
      request: "seed-req-cs1-transfer-rejected",
      message: decided(
        "REJECTED",
        "TRANSFER",
        "CNCS-STAFF-0002",
        "headCS",
        "The iPad is booked for the mobile-lab rotation until the end of the semester.",
      ),
      createdDaysAgo: 8,
    },
    {
      id: "seed-notif-cs1-approved",
      to: "cs1",
      request: "seed-req-cs1-loan-overdue",
      message: decided("APPROVED", "LOAN", "CNCS-DEMO-0006", "officer"),
      createdDaysAgo: 22,
      isRead: true,
    },
    {
      id: "seed-notif-cs2-approved",
      to: "cs2",
      request: "seed-req-cs2-transfer-approved",
      message: decided("APPROVED", "TRANSFER", "CNCS-STAFF-0004", "headCS"),
      createdDaysAgo: 8,
    },
    {
      id: "seed-notif-cs2-rejected",
      to: "cs2",
      request: "seed-req-cs2-disposal-rejected",
      message: decided(
        "REJECTED",
        "DISPOSAL",
        "CNCS-STAFF-0014",
        "officer",
        "The lamp is serviceable — the flickering is a loose bulb in the property office store.",
      ),
      createdDaysAgo: 5,
    },
    {
      id: "seed-notif-cs3-approved",
      to: "cs3",
      request: "seed-req-cs3-disposal-approved",
      message: decided("APPROVED", "DISPOSAL", "CNCS-STAFF-0016", "officer"),
      createdDaysAgo: 6,
    },
    {
      id: "seed-notif-cs3-loan-approved",
      to: "cs3",
      request: "seed-req-cs3-loan-approved",
      message: decided("APPROVED", "LOAN", "CNCS-DEMO-0012", "officer"),
      createdDaysAgo: 11,
    },
    {
      id: "seed-notif-bio1-approved",
      to: "bio1",
      request: "seed-req-bio1-loan-approved",
      message: decided("APPROVED", "LOAN", "CNCS-DEMO-0007", "officer"),
      createdDaysAgo: 13,
    },
    {
      id: "seed-notif-bio1-rejected",
      to: "bio1",
      request: "seed-req-bio1-transfer-rejected",
      message: decided(
        "REJECTED",
        "TRANSFER",
        "CNCS-STAFF-0007",
        "headBio",
        "Department-issue coats are issued centrally; personal replacements are not granted.",
      ),
      createdDaysAgo: 9,
    },
    {
      id: "seed-notif-bio2-approved",
      to: "bio2",
      request: "seed-req-bio2-transfer-approved",
      message: decided("APPROVED", "TRANSFER", "CNCS-STAFF-0008", "headBio"),
      createdDaysAgo: 6,
    },
    {
      id: "seed-notif-bio2-rejected",
      to: "bio2",
      request: "seed-req-bio2-loan-rejected",
      message: decided(
        "REJECTED",
        "LOAN",
        "CNCS-DEMO-0011",
        "officer",
        "The camera kit is reserved for the college open day and the request came after the booking.",
      ),
      createdDaysAgo: 15,
    },
    {
      id: "seed-notif-chem1-approved",
      to: "chem1",
      request: "seed-req-chem1-loan-approved",
      message: decided("APPROVED", "LOAN", "CNCS-DEMO-0016", "officer"),
      createdDaysAgo: 12,
    },
    {
      id: "seed-notif-chem1-rejected",
      to: "chem1",
      request: "seed-req-chem1-disposal-rejected",
      message: decided(
        "REJECTED",
        "DISPOSAL",
        "CNCS-STAFF-0026",
        "officer",
        "The balance is out of calibration, not broken — send it for recalibration.",
      ),
      createdDaysAgo: 6,
    },

    // ── The system administrator ───────────────────────────────────────────
    /**
     * The administrator's work is accounts, not assets — the request
     * notifications above carry item names and tag ids, and the admin must not
     * see asset data at all. So this inbox is written in plain text, exactly
     * as the app writes its own non-request notifications: `parseNotificationMessage()`
     * returns the message unchanged and the client renders it as it stands.
     */
    {
      id: "seed-notif-admin-pending-cs",
      to: "admin",
      message:
        "A new account request from pending.cs@cncs.aau.edu.et (Computer Science) is waiting for approval.",
      createdDaysAgo: 9,
    },
    {
      id: "seed-notif-admin-pending-bio",
      to: "admin",
      message:
        "A new account request from pending.bio@cncs.aau.edu.et (Biology) is waiting for approval.",
      createdDaysAgo: 8,
    },
    {
      id: "seed-notif-admin-pending-phys",
      to: "admin",
      message:
        "A new account request from pending.phys@cncs.aau.edu.et (Physics) is waiting for approval. Physics has no department head, so only a System Admin can decide it.",
      createdDaysAgo: 7,
    },
    {
      id: "seed-notif-admin-escalated",
      to: "admin",
      message:
        "The account request from escalated.cs@cncs.aau.edu.et (Computer Science) was escalated to the System Admin queue by the Computer Science department head.",
      createdDaysAgo: 2,
    },
    {
      id: "seed-notif-admin-rejected",
      to: "admin",
      message:
        "The account request from rejected.chem@cncs.aau.edu.et (Chemistry) was declined. Reason: The staff ID does not match the college personnel register.",
      createdDaysAgo: 5,
    },
    {
      id: "seed-notif-admin-invite",
      to: "admin",
      message:
        "A privileged invitation for auditor2@cncs.aau.edu.et (Auditor) is outstanding and has not been accepted yet.",
      createdDaysAgo: 1,
    },
  ];

  for (const spec of notificationSpecs) {
    const user = users.get(spec.to);
    if (!user) {
      throw new Error(`Unknown notification recipient "${spec.to}"`);
    }
    const relatedRequestId = spec.request ? (requests.get(spec.request)?.id ?? null) : null;
    const data = {
      userId: user.id,
      message: spec.message,
      relatedRequestId,
      isRead: spec.isRead ?? false,
      createdAt: daysAgo(spec.createdDaysAgo),
    };
    await prisma.notification.upsert({
      where: { id: spec.id },
      update: data,
      create: { id: spec.id, ...data },
    });
  }

  console.log("Seeding audit sessions...");
  /**
   * Two sessions, because the auditor's dashboard has two widgets: the last
   * completed count (with its report and its findings) and the session still
   * open, waiting to be scanned.
   *
   * The scope values are what `POST /audits` accepts: `DEPARTMENT` or
   * `BUILDING` with a name, matched case-insensitively against the item's
   * OrgUnit or Building.
   */
  const completedAudit = await prisma.auditSession.upsert({
    where: { id: "seed-audit-2026-annual-cs" },
    update: {
      sessionType: AuditSessionType.ANNUAL_FULL_COUNT,
      reportNumber: "CNCS-AUD-2026-001",
      scopeType: "DEPARTMENT",
      scopeValue: "Computer Science",
      runById: users.get("auditor")!.id,
      startedAt: daysAgo(3),
      completedAt: daysAgo(2),
      graceEndsAt: daysAhead(5),
    },
    create: {
      id: "seed-audit-2026-annual-cs",
      sessionType: AuditSessionType.ANNUAL_FULL_COUNT,
      reportNumber: "CNCS-AUD-2026-001",
      scopeType: "DEPARTMENT",
      scopeValue: "Computer Science",
      runById: users.get("auditor")!.id,
      startedAt: daysAgo(3),
      completedAt: daysAgo(2),
      graceEndsAt: daysAhead(5),
    },
  });

  const activeAudit = await prisma.auditSession.upsert({
    where: { id: "seed-audit-2026-active-bio" },
    update: {
      sessionType: AuditSessionType.SPOT_CHECK,
      reportNumber: null,
      scopeType: "DEPARTMENT",
      scopeValue: "Biology",
      runById: users.get("auditor")!.id,
      startedAt: daysAgo(1),
      completedAt: null,
      graceEndsAt: null,
    },
    create: {
      id: "seed-audit-2026-active-bio",
      sessionType: AuditSessionType.SPOT_CHECK,
      reportNumber: null,
      scopeType: "DEPARTMENT",
      scopeValue: "Biology",
      runById: users.get("auditor")!.id,
      startedAt: daysAgo(1),
      completedAt: null,
      graceEndsAt: null,
    },
  });

  const completedAuditResults: AuditResultSpec[] = [
    { item: "CNCS-DEMO-0001", result: AuditItemResult.FOUND, scannedDaysAgo: 2 },
    { item: "CNCS-STAFF-0071", result: AuditItemResult.FOUND, scannedDaysAgo: 2 },
    { item: "CNCS-STAFF-0001", result: AuditItemResult.FOUND, scannedDaysAgo: 2 },
    { item: "CNCS-STAFF-0004", result: AuditItemResult.FOUND, scannedDaysAgo: 2 },
    { item: "CNCS-STAFF-0015", result: AuditItemResult.FOUND, scannedDaysAgo: 2 },
    { item: "CNCS-STAFF-0017", result: AuditItemResult.MISSING },
    { item: "CNCS-STAFF-0019", result: AuditItemResult.MISSING },
    { item: "CNCS-STAFF-0002", result: AuditItemResult.LOCATION_MISMATCH, scannedDaysAgo: 2 },
    { item: "CNCS-STAFF-0013", result: AuditItemResult.LOCATION_MISMATCH, scannedDaysAgo: 2 },
  ];

  const activeAuditResults: AuditResultSpec[] = [
    { item: "CNCS-STAFF-0075", result: AuditItemResult.FOUND, scannedDaysAgo: 1 },
    { item: "CNCS-STAFF-0006", result: AuditItemResult.FOUND, scannedDaysAgo: 1 },
    { item: "CNCS-STAFF-0074", result: AuditItemResult.PENDING },
    { item: "CNCS-STAFF-0022", result: AuditItemResult.PENDING },
  ];

  for (const [session, specs] of [
    [completedAudit, completedAuditResults],
    [activeAudit, activeAuditResults],
  ] as const) {
    for (const spec of specs) {
      const item = items.get(spec.item);
      if (!item) {
        throw new Error(`Unknown item "${spec.item}" in audit ${session.id}`);
      }
      const data = {
        result: spec.result,
        scannedAt: spec.scannedDaysAgo !== undefined ? daysAgo(spec.scannedDaysAgo) : null,
      };
      await prisma.auditItemResultRow.upsert({
        where: { auditSessionId_itemId: { auditSessionId: session.id, itemId: item.id } },
        update: data,
        create: { auditSessionId: session.id, itemId: item.id, ...data },
      });
    }
  }

  // The audit is what makes an item "verified since" a date, and only the
  // items the audit actually found carry it.
  for (const spec of completedAuditResults) {
    if (spec.result !== AuditItemResult.FOUND) continue;
    const item = items.get(spec.item);
    if (!item) continue;
    await prisma.item.update({
      where: { id: item.id },
      data: {
        lastAuditedAt: daysAgo(2),
        lastVerifiedAt: daysAgo(2),
        lastVerifiedById: users.get("auditor")!.id,
      },
    });
  }

  console.log("Seeding item edit history...");
  /**
   * The item history screen reads `ItemEditLog`, and the rows of one decision
   * share one `editedAt` — that timestamp is the correlation key the screen
   * groups by. These are the decisions the seed above recorded.
   */
  const editLogSpecs: EditLogSpec[] = [
    {
      id: "seed-editlog-0001",
      item: "CNCS-STAFF-0004",
      by: "headCS",
      field: "room",
      oldValue: "205",
      newValue: "207",
      daysAgo: 8,
    },
    {
      id: "seed-editlog-0002",
      item: "CNCS-STAFF-0008",
      by: "headBio",
      field: "room",
      oldValue: "210",
      newValue: "211",
      daysAgo: 6,
    },
    {
      id: "seed-editlog-0003",
      item: "CNCS-STAFF-0079",
      by: "officer",
      field: "status",
      oldValue: "ACTIVE",
      newValue: "DISPOSED",
      daysAgo: 17,
    },
    {
      id: "seed-editlog-0004",
      item: "CNCS-STAFF-0016",
      by: "officer",
      field: "status",
      oldValue: "ACTIVE",
      newValue: "DISPOSED",
      daysAgo: 6,
    },
    {
      id: "seed-editlog-0005",
      item: "CNCS-STAFF-0030",
      by: "officer",
      field: "status",
      oldValue: "ACTIVE",
      newValue: "DISPOSED",
      daysAgo: 16,
    },
    {
      id: "seed-editlog-0006",
      item: "CNCS-STAFF-0036",
      by: "officer",
      field: "status",
      oldValue: "ACTIVE",
      newValue: "DISPOSED",
      daysAgo: 13,
    },
    {
      id: "seed-editlog-0007",
      item: "CNCS-DEMO-0009",
      by: "officer",
      field: "status",
      oldValue: "ACTIVE",
      newValue: "DISPOSED",
      daysAgo: 26,
    },
    {
      id: "seed-editlog-0008",
      item: "CNCS-DEMO-0018",
      by: "officer",
      field: "status",
      oldValue: "ACTIVE",
      newValue: "DISPOSED",
      daysAgo: 22,
    },
    {
      id: "seed-editlog-0009",
      item: "CNCS-DEMO-0013",
      by: "officer",
      field: "status",
      oldValue: "ACTIVE",
      newValue: "VOIDED",
      daysAgo: 7,
    },
    {
      id: "seed-editlog-0010",
      item: "CNCS-DEMO-0008",
      by: "headCS",
      field: "room",
      oldValue: "105",
      newValue: "107",
      daysAgo: 6,
    },
    {
      id: "seed-editlog-0011",
      item: "CNCS-DEMO-0006",
      by: "officer",
      field: "status",
      oldValue: "ACTIVE",
      newValue: "LOANED",
      daysAgo: 22,
    },
    {
      id: "seed-editlog-0012",
      item: "CNCS-DEMO-0007",
      by: "officer",
      field: "status",
      oldValue: "ACTIVE",
      newValue: "LOANED",
      daysAgo: 13,
    },
    {
      id: "seed-editlog-0013",
      item: "CNCS-DEMO-0011",
      by: "officer",
      field: "status",
      oldValue: "ACTIVE",
      newValue: "LOANED",
      daysAgo: 10,
    },
    {
      id: "seed-editlog-0014",
      item: "CNCS-DEMO-0012",
      by: "officer",
      field: "status",
      oldValue: "ACTIVE",
      newValue: "LOANED",
      daysAgo: 11,
    },
    {
      id: "seed-editlog-0015",
      item: "CNCS-DEMO-0015",
      by: "officer",
      field: "status",
      oldValue: "ACTIVE",
      newValue: "LOANED",
      daysAgo: 14,
    },
    {
      id: "seed-editlog-0016",
      item: "CNCS-DEMO-0016",
      by: "officer",
      field: "status",
      oldValue: "ACTIVE",
      newValue: "LOANED",
      daysAgo: 12,
    },
    {
      id: "seed-editlog-0017",
      item: "CNCS-DEMO-0017",
      by: "officer",
      field: "status",
      oldValue: "ACTIVE",
      newValue: "LOANED",
      daysAgo: 20,
    },
    {
      id: "seed-editlog-0018",
      item: "CNCS-DEMO-0010",
      by: "officer",
      field: "status",
      oldValue: "ACTIVE",
      newValue: "LOANED",
      daysAgo: 12,
    },
  ];

  for (const spec of editLogSpecs) {
    const item = items.get(spec.item);
    if (!item) {
      throw new Error(`Unknown item "${spec.item}" in edit log ${spec.id}`);
    }
    const data = {
      itemId: item.id,
      editedById: users.get(spec.by)!.id,
      fieldChanged: spec.field,
      oldValue: spec.oldValue,
      newValue: spec.newValue,
      editedAt: daysAgo(spec.daysAgo),
    };
    await prisma.itemEditLog.upsert({
      where: { id: spec.id },
      update: data,
      create: { id: spec.id, ...data },
    });
  }

  console.log("Seed complete:");
  console.log(`  ${categories.length} categories`);
  console.log("  1 College, 4 Departments (CS, Biology, Chemistry, Physics)");
  console.log("  3 Department Heads (CS, Biology, Chemistry), Physics has NO head");
  console.log("  6 Staff + 1 Auditor + 1 Officer + 1 System Admin can sign in");
  console.log("  4 account requests waiting, 1 escalated, 1 declined, 1 privileged invite outstanding");
  console.log(`  ${ITEMS.length} items (every staff member and head holds at least five)`);
  console.log(`  ${REQUESTS.length} requests covering all nine states`);
  console.log(`  ${notificationSpecs.length} notifications`);
  console.log("  1 completed audit session (report CNCS-AUD-2026-001) + 1 active session");
  console.log("");
  console.log("  Sign in with:");
  console.log("    admin@cncs.aau.edu.et    / Admin123!      (SYSTEM_ADMIN)");
  console.log("    officer@cncs.aau.edu.et  / Officer123!    (PROPERTY_OFFICER)");
  console.log("    head.cs@cncs.aau.edu.et  / HeadCS123!     (DEPARTMENT_HEAD, CS)");
  console.log("    head.bio@cncs.aau.edu.et / HeadBIO123!    (DEPARTMENT_HEAD, Biology)");
  console.log("    head.chem@cncs.aau.edu.et/ HeadCHEM123!   (DEPARTMENT_HEAD, Chemistry)");
  console.log("    staff.cs1@cncs.aau.edu.et/ StaffCS123!    (STAFF, Computer Science)");
  console.log("    staff.bio1@cncs.aau.edu.et/ StaffBIO123!  (STAFF, Biology)");
  console.log("    staff.chem1@cncs.aau.edu.et/ StaffCHEM123!(STAFF, Chemistry)");
  console.log("    auditor@cncs.aau.edu.et / Auditor123!    (AUDITOR)");
  console.log("");
  console.log(`  Outstanding invitation (accept-invite): /accept-invite?token=${SEED_INVITE_TOKEN}`);
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
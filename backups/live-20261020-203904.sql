--
-- PostgreSQL database dump
--

\restrict PnM2K2ctyJg6vb0PKdSyIAtLBXbvKpV5a0HExtq0B5teZAHgtFrjumf4nmxTNaa

-- Dumped from database version 18.6 (653b019)
-- Dumped by pg_dump version 18.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: AccountRequestStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."AccountRequestStatus" AS ENUM (
    'PENDING_APPROVAL',
    'APPROVED',
    'REJECTED',
    'ESCALATED'
);


--
-- Name: AccountStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."AccountStatus" AS ENUM (
    'ACTIVE',
    'PENDING_EMAIL_VERIFICATION',
    'PENDING_APPROVAL',
    'REJECTED',
    'DEACTIVATED'
);


--
-- Name: AuditItemResult; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."AuditItemResult" AS ENUM (
    'FOUND',
    'MISSING',
    'LOCATION_MISMATCH',
    'PENDING',
    'DAMAGED'
);


--
-- Name: AuditSessionType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."AuditSessionType" AS ENUM (
    'ANNUAL_FULL_COUNT',
    'SPOT_CHECK',
    'COMPLIANCE',
    'HANDOVER'
);


--
-- Name: Condition; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."Condition" AS ENUM (
    'NEW',
    'GOOD',
    'FAIR',
    'DAMAGED',
    'BEYOND_REPAIR'
);


--
-- Name: CustodyEventType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."CustodyEventType" AS ENUM (
    'CREATED',
    'CLAIMED',
    'CLAIM_REFUSED',
    'CLAIM_EXPIRED',
    'REVERTED',
    'TRANSFERRED',
    'DISPOSED',
    'LOST',
    'RECOVERED',
    'LOCATION_CHANGED',
    'VERIFIED',
    'HOLDER_DEACTIVATED',
    'EDITED',
    'CLAIMED_WITH_CORRECTION',
    'DISPOSAL_REVERSED',
    'VOIDED'
);


--
-- Name: EmailTokenType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."EmailTokenType" AS ENUM (
    'VERIFY',
    'INVITE',
    'RESET'
);


--
-- Name: HolderType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."HolderType" AS ENUM (
    'STAFF',
    'DEPARTMENT',
    'COLLEGE'
);


--
-- Name: ItemStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ItemStatus" AS ENUM (
    'ACTIVE',
    'DISPOSED',
    'PENDING_CLAIM',
    'REVERTED_UNVERIFIED',
    'LOANED',
    'LOST',
    'VOIDED'
);


--
-- Name: OrgUnitType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."OrgUnitType" AS ENUM (
    'COLLEGE',
    'DEPARTMENT',
    'LAB_GROUP'
);


--
-- Name: RequestStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."RequestStatus" AS ENUM (
    'PENDING',
    'APPROVED',
    'REJECTED',
    'WAITLISTED',
    'PENDING_STAGE1',
    'PENDING_STAGE2',
    'WITHDRAWN',
    'INVALIDATED',
    'RETURN_PENDING_CONFIRMATION'
);


--
-- Name: RequestType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."RequestType" AS ENUM (
    'TRANSFER',
    'DISPOSAL',
    'LOAN'
);


--
-- Name: Role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."Role" AS ENUM (
    'SYSTEM_ADMIN',
    'PROPERTY_OFFICER',
    'DEPARTMENT_HEAD',
    'STAFF',
    'AUDITOR'
);


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: AccountRequest; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AccountRequest" (
    id text NOT NULL,
    "userId" text NOT NULL,
    "requestedUnitId" text NOT NULL,
    "confirmedUnitId" text,
    status public."AccountRequestStatus" DEFAULT 'PENDING_APPROVAL'::public."AccountRequestStatus" NOT NULL,
    "submittedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "decidedAt" timestamp(3) without time zone,
    "decidedById" text,
    "decisionNote" text,
    "rejectionReason" text,
    "escalatedAt" timestamp(3) without time zone,
    "escalatedById" text,
    "escalationReason" text,
    "authorizedBy" text,
    "authorizationRef" text,
    "authorizationNote" text,
    "invitedById" text,
    "invitedAt" timestamp(3) without time zone
);


--
-- Name: AdminActionLog; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AdminActionLog" (
    id text NOT NULL,
    "actorId" text NOT NULL,
    action text NOT NULL,
    "targetUserId" text,
    "unitId" text,
    before jsonb,
    after jsonb,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "authorizedBy" text,
    "authorizationRef" text
);


--
-- Name: AuditItemResultRow; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AuditItemResultRow" (
    id text NOT NULL,
    "auditSessionId" text NOT NULL,
    "itemId" text NOT NULL,
    result public."AuditItemResult" DEFAULT 'PENDING'::public."AuditItemResult" NOT NULL,
    "scannedAt" timestamp(3) without time zone
);


--
-- Name: AuditSession; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AuditSession" (
    id text NOT NULL,
    "scopeType" text NOT NULL,
    "scopeValue" text,
    "runById" text NOT NULL,
    "startedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "completedAt" timestamp(3) without time zone,
    "graceEndsAt" timestamp(3) without time zone,
    "reportNumber" text,
    "sessionType" public."AuditSessionType" DEFAULT 'ANNUAL_FULL_COUNT'::public."AuditSessionType" NOT NULL
);


--
-- Name: Building; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Building" (
    id text NOT NULL,
    name text NOT NULL,
    code character varying(10) NOT NULL,
    description text,
    address text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: Category; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Category" (
    id text NOT NULL,
    name text NOT NULL
);


--
-- Name: CustodyEvent; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."CustodyEvent" (
    id text NOT NULL,
    "itemId" text NOT NULL,
    "eventType" public."CustodyEventType" NOT NULL,
    "fromHolderType" public."HolderType",
    "fromHolderId" text,
    "toHolderType" public."HolderType",
    "toHolderId" text,
    "actingUserId" text NOT NULL,
    reason text,
    "departmentHeadSnapshot" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: EmailToken; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."EmailToken" (
    id text NOT NULL,
    "userId" text NOT NULL,
    type public."EmailTokenType" NOT NULL,
    "tokenHash" text NOT NULL,
    "expiresAt" timestamp(3) without time zone NOT NULL,
    "usedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: Item; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Item" (
    id text NOT NULL,
    "tagId" text NOT NULL,
    name text NOT NULL,
    "categoryId" text NOT NULL,
    floor text NOT NULL,
    room text NOT NULL,
    "ownerId" text NOT NULL,
    "purchaseCost" numeric(65,30) NOT NULL,
    "currentValue" numeric(65,30),
    condition public."Condition" NOT NULL,
    brand text,
    model text,
    "serialNumber" text,
    "photoUrl" text,
    notes text,
    status public."ItemStatus" DEFAULT 'ACTIVE'::public."ItemStatus" NOT NULL,
    "disposalReason" text,
    "disposedAt" timestamp(3) without time zone,
    "registeredAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "lastAuditedAt" timestamp(3) without time zone,
    "parentItemId" text,
    "claimDueAt" timestamp(3) without time zone,
    "claimedAt" timestamp(3) without time zone,
    "holderId" text,
    "holderType" public."HolderType",
    "lastVerifiedAt" timestamp(3) without time zone,
    "lastVerifiedById" text,
    pin text,
    version integer DEFAULT 0 NOT NULL,
    "voidReason" text,
    "voidedAt" timestamp(3) without time zone,
    "voidedById" text,
    "orgUnitId" text,
    "buildingId" text
);


--
-- Name: ItemEditLog; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ItemEditLog" (
    id text NOT NULL,
    "itemId" text NOT NULL,
    "editedById" text NOT NULL,
    "fieldChanged" text NOT NULL,
    "oldValue" text,
    "newValue" text,
    "editedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: Notification; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Notification" (
    id text NOT NULL,
    "userId" text NOT NULL,
    message text NOT NULL,
    "relatedRequestId" text,
    "isRead" boolean DEFAULT false NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: OrgUnit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."OrgUnit" (
    id text NOT NULL,
    name text NOT NULL,
    code text NOT NULL,
    type public."OrgUnitType" NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "acceptsSelfReg" boolean DEFAULT false NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "parentId" text,
    "headId" text
);


--
-- Name: Request; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Request" (
    id text NOT NULL,
    type public."RequestType" NOT NULL,
    status public."RequestStatus" DEFAULT 'PENDING'::public."RequestStatus" NOT NULL,
    "itemId" text NOT NULL,
    "requestedById" text NOT NULL,
    "reviewedById" text,
    reason text NOT NULL,
    "rejectionReason" text,
    "newLocationBuilding" text,
    "newLocationFloor" text,
    "newLocationRoom" text,
    "newOwnerId" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "decidedAt" timestamp(3) without time zone,
    "fromHolderId" text,
    "fromHolderType" public."HolderType",
    "toHolderId" text,
    "toHolderType" public."HolderType",
    "loanDueDate" timestamp(3) without time zone,
    "loanReturnedAt" timestamp(3) without time zone,
    "loanReturnedById" text,
    "stage1ApprovedAt" timestamp(3) without time zone,
    "stage1ApprovedById" text,
    "stage2ApprovedAt" timestamp(3) without time zone,
    "stage2ApprovedById" text,
    "invalidatedAt" timestamp(3) without time zone,
    "invalidatedReason" text,
    "withdrawnAt" timestamp(3) without time zone,
    "withdrawnById" text
);


--
-- Name: User; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."User" (
    id text NOT NULL,
    "fullName" text NOT NULL,
    email text NOT NULL,
    "passwordHash" text NOT NULL,
    role public."Role" NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "tokenVersion" integer DEFAULT 0 NOT NULL,
    "mustChangePassword" boolean DEFAULT false NOT NULL,
    "accountStatus" public."AccountStatus" DEFAULT 'PENDING_EMAIL_VERIFICATION'::public."AccountStatus" NOT NULL,
    "reviewedById" text,
    "reviewedAt" timestamp(3) without time zone,
    "reviewNote" text,
    "orgUnitId" text,
    "staffId" text,
    "escalatedAt" timestamp(3) without time zone,
    "escalatedById" text
);


--
-- Name: _prisma_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public._prisma_migrations (
    id character varying(36) NOT NULL,
    checksum character varying(64) NOT NULL,
    finished_at timestamp with time zone,
    migration_name character varying(255) NOT NULL,
    logs text,
    rolled_back_at timestamp with time zone,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    applied_steps_count integer DEFAULT 0 NOT NULL
);


--
-- Data for Name: AccountRequest; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."AccountRequest" (id, "userId", "requestedUnitId", "confirmedUnitId", status, "submittedAt", "decidedAt", "decidedById", "decisionNote", "rejectionReason", "escalatedAt", "escalatedById", "escalationReason", "authorizedBy", "authorizationRef", "authorizationNote", "invitedById", "invitedAt") FROM stdin;
\.


--
-- Data for Name: AdminActionLog; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."AdminActionLog" (id, "actorId", action, "targetUserId", "unitId", before, after, "createdAt", "authorizedBy", "authorizationRef") FROM stdin;
dc206527-100f-4255-9038-ea6387bd9088	f086ebee-dfc5-48b2-a181-56fac9845b37	ACCOUNT_APPROVED	9db8adfc-fa2d-4362-85e0-ac98f772752c	\N	{"accountStatus": "PENDING"}	{"accountStatus": "ACTIVE"}	2026-10-17 08:57:33.595	\N	\N
459cba46-46fb-4576-a6bc-aebd2100992b	f086ebee-dfc5-48b2-a181-56fac9845b37	ACCOUNT_APPROVED	9db8adfc-fa2d-4362-85e0-ac98f772752c	\N	{"accountStatus": "PENDING"}	{"accountStatus": "ACTIVE"}	2026-10-17 08:58:40.387	\N	\N
\.


--
-- Data for Name: AuditItemResultRow; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."AuditItemResultRow" (id, "auditSessionId", "itemId", result, "scannedAt") FROM stdin;
e77f1480-8dee-47f3-977b-1f0bf55f9ed3	855e0071-c4a0-48f3-9e7e-28b0f91bdf20	49c3aabb-c76f-4234-9b32-ccc73489a894	FOUND	2026-09-25 11:47:34.522
12fedf29-abef-4d84-9802-f7da6ab707e3	855e0071-c4a0-48f3-9e7e-28b0f91bdf20	2807aa69-9e34-44ac-a103-9f2eabc68872	FOUND	2026-09-25 11:48:07.659
88909cf7-b22c-4d61-8854-254e4560b7ba	855e0071-c4a0-48f3-9e7e-28b0f91bdf20	c084eea2-06c2-431c-a60c-bae35676142c	FOUND	2026-09-25 11:48:22.903
4eaa6c33-8efd-4c16-b6d9-fe726a7062cd	a310be7f-d35e-4116-a391-a3cbd6f580bf	49c3aabb-c76f-4234-9b32-ccc73489a894	FOUND	2026-09-25 11:51:47.455
109dd251-9ea4-4c6b-b392-2a61b6f53792	a310be7f-d35e-4116-a391-a3cbd6f580bf	2807aa69-9e34-44ac-a103-9f2eabc68872	FOUND	2026-09-25 11:52:00.637
c28142ff-64a9-414b-8e1b-f8dd20386e03	a310be7f-d35e-4116-a391-a3cbd6f580bf	c084eea2-06c2-431c-a60c-bae35676142c	FOUND	2026-09-25 11:52:24.164
df35ee6d-4db0-4fd0-8d75-6080b53682fe	a310be7f-d35e-4116-a391-a3cbd6f580bf	49beb5cd-66ee-4c16-b659-1155c4e1aa50	FOUND	2026-09-25 11:53:29.102
ead31f15-4bb0-44d4-af41-0dc843c93a3a	a310be7f-d35e-4116-a391-a3cbd6f580bf	50f19c36-bac3-4d67-8d5f-097e1810a7c2	FOUND	2026-09-25 11:54:24.48
20af7407-7c7e-4ae0-8f25-c5a74eb54933	a310be7f-d35e-4116-a391-a3cbd6f580bf	29f43025-5cb8-42e3-8fb5-3865a2ae85d8	LOCATION_MISMATCH	2026-09-25 11:53:51.086
5669fd0f-03ef-4321-bf1b-14759770871f	a310be7f-d35e-4116-a391-a3cbd6f580bf	2383cdcc-88e7-40cc-8664-84a79604ba57	LOCATION_MISMATCH	2026-09-25 11:54:11.07
04722a07-1977-43aa-a159-72859ea092db	75ba77a8-e2a6-4c9d-8ae1-1c8875a0e0af	2807aa69-9e34-44ac-a103-9f2eabc68872	FOUND	2026-09-25 18:13:21.908
0c3109c8-314d-440f-bca4-3d61fddb9c3d	75ba77a8-e2a6-4c9d-8ae1-1c8875a0e0af	c084eea2-06c2-431c-a60c-bae35676142c	FOUND	2026-09-25 18:13:45.325
01d8bffd-8a79-41be-9ed9-ccf3d26de1e7	75ba77a8-e2a6-4c9d-8ae1-1c8875a0e0af	49beb5cd-66ee-4c16-b659-1155c4e1aa50	FOUND	2026-09-25 18:14:04.215
45c2bd13-f56a-4435-afb1-b62e61d7887b	75ba77a8-e2a6-4c9d-8ae1-1c8875a0e0af	50f19c36-bac3-4d67-8d5f-097e1810a7c2	FOUND	2026-09-25 18:15:02.736
cc1eb313-1fea-4aa7-8d65-bee9b3105e97	75ba77a8-e2a6-4c9d-8ae1-1c8875a0e0af	49c3aabb-c76f-4234-9b32-ccc73489a894	LOCATION_MISMATCH	2026-09-25 18:12:55.567
2dbe5f17-6e8d-4eb2-b02c-8e21b26aaced	75ba77a8-e2a6-4c9d-8ae1-1c8875a0e0af	29f43025-5cb8-42e3-8fb5-3865a2ae85d8	LOCATION_MISMATCH	2026-09-25 18:14:15.819
4eebb699-dcd2-4ed0-9bd9-eba3f97c20e6	75ba77a8-e2a6-4c9d-8ae1-1c8875a0e0af	2383cdcc-88e7-40cc-8664-84a79604ba57	LOCATION_MISMATCH	2026-09-25 18:14:38.616
e8f5ecf2-23ba-4afb-842c-0ee0af2aad7f	0c162b19-92d9-4bd5-a2b7-465e386fff75	2807aa69-9e34-44ac-a103-9f2eabc68872	FOUND	2026-09-25 18:22:00.961
3e7995b0-b908-4559-ad77-877b49c58fe8	0c162b19-92d9-4bd5-a2b7-465e386fff75	50f19c36-bac3-4d67-8d5f-097e1810a7c2	MISSING	\N
98d6900d-a622-413c-98fb-9b8a4ad39625	0c162b19-92d9-4bd5-a2b7-465e386fff75	49beb5cd-66ee-4c16-b659-1155c4e1aa50	MISSING	\N
03b7849f-ee8b-4194-871d-0e5e6a01e005	0c162b19-92d9-4bd5-a2b7-465e386fff75	c084eea2-06c2-431c-a60c-bae35676142c	MISSING	\N
35f45afe-1d95-4ead-b13d-0468efe61793	24f3fb08-39b5-4b60-b580-02db1a8b4c1f	2c7706bb-d2d3-43e3-b879-a631f2c03238	FOUND	2026-09-25 19:09:35.34
af7b93f2-89ed-4aec-a98c-e7cb04d1b4c7	b70d75d7-a165-4ba5-8e0a-d2d8ab313450	50f19c36-bac3-4d67-8d5f-097e1810a7c2	FOUND	2026-09-26 04:26:04.452
965739ee-4d75-46bc-989b-6819ae7d16ec	b70d75d7-a165-4ba5-8e0a-d2d8ab313450	29f43025-5cb8-42e3-8fb5-3865a2ae85d8	LOCATION_MISMATCH	2026-09-26 04:26:44.772
abd51c1f-93f9-4622-9f36-1d6f4f240a62	b70d75d7-a165-4ba5-8e0a-d2d8ab313450	49beb5cd-66ee-4c16-b659-1155c4e1aa50	MISSING	\N
e5bcb018-c062-423f-b09e-1358079bac7d	b70d75d7-a165-4ba5-8e0a-d2d8ab313450	c084eea2-06c2-431c-a60c-bae35676142c	MISSING	\N
855d1240-0c5e-45c2-9f46-3c870685611f	b70d75d7-a165-4ba5-8e0a-d2d8ab313450	2807aa69-9e34-44ac-a103-9f2eabc68872	MISSING	\N
aa9d07ee-bdd6-40ed-8762-7950f93f7188	ce9b00a4-58ef-444f-bc22-3d176ab23436	aea934b7-c2cd-4895-9ff3-4b58ebc81306	FOUND	2026-10-08 07:18:55.767
984c7ec6-4d6e-471e-9a8e-ac13a5637d58	ce9b00a4-58ef-444f-bc22-3d176ab23436	46ebb65a-4a00-467b-b14c-c4d5306ac743	FOUND	2026-10-08 07:19:56.07
edc144e6-a858-4f61-8c77-cf680ae3a375	ce9b00a4-58ef-444f-bc22-3d176ab23436	49c3aabb-c76f-4234-9b32-ccc73489a894	LOCATION_MISMATCH	2026-10-08 07:20:23.679
f01dd3de-454b-4c39-ab02-6fc0ba4d89f7	ce9b00a4-58ef-444f-bc22-3d176ab23436	c084eea2-06c2-431c-a60c-bae35676142c	MISSING	\N
6075e16b-223f-4e86-ab5b-047d6f5382cb	ce9b00a4-58ef-444f-bc22-3d176ab23436	50f19c36-bac3-4d67-8d5f-097e1810a7c2	MISSING	\N
b6559039-920d-43fe-a021-7ec6e8416ab7	ce9b00a4-58ef-444f-bc22-3d176ab23436	49beb5cd-66ee-4c16-b659-1155c4e1aa50	MISSING	\N
\.


--
-- Data for Name: AuditSession; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."AuditSession" (id, "scopeType", "scopeValue", "runById", "startedAt", "completedAt", "graceEndsAt", "reportNumber", "sessionType") FROM stdin;
16980db1-7040-4fdf-9d7f-c5c2d751dd22	DEPARTMENT	Computer Science	30484dea-6436-43f6-9e89-11169dce5312	2026-09-22 10:35:18.711	\N	\N	\N	ANNUAL_FULL_COUNT
c727af91-bc0e-4eb1-9363-f4fd88d8d8af	DEPARTMENT	Computer Science	30484dea-6436-43f6-9e89-11169dce5312	2026-09-23 14:38:49.604	\N	\N	\N	ANNUAL_FULL_COUNT
95111a2b-3dd4-4baf-a718-675d1a8e100d	DEPARTMENT	Computer Science	30484dea-6436-43f6-9e89-11169dce5312	2026-09-23 16:18:15.616	\N	\N	\N	ANNUAL_FULL_COUNT
96dcaae3-fd73-4950-818f-52d86922cad1	DEPARTMENT	Computer Science	901f48e1-9abb-43ac-8d09-00eda3a91fd6	2026-09-24 07:59:40.259	\N	\N	\N	ANNUAL_FULL_COUNT
57798865-b472-455d-aa2c-145e882d8757	DEPARTMENT	Administration	901f48e1-9abb-43ac-8d09-00eda3a91fd6	2026-09-25 11:01:47.256	\N	\N	\N	ANNUAL_FULL_COUNT
fc55c6ab-c5cc-49b2-91e2-8beb9255387c	DEPARTMENT	Computer Science	30484dea-6436-43f6-9e89-11169dce5312	2026-09-25 11:43:22.527	\N	\N	\N	ANNUAL_FULL_COUNT
855e0071-c4a0-48f3-9e7e-28b0f91bdf20	DEPARTMENT	Computer Science	30484dea-6436-43f6-9e89-11169dce5312	2026-09-25 11:47:30.632	\N	\N	\N	ANNUAL_FULL_COUNT
a310be7f-d35e-4116-a391-a3cbd6f580bf	DEPARTMENT	Computer Science	30484dea-6436-43f6-9e89-11169dce5312	2026-09-25 11:51:32.627	2026-09-25 11:54:59.746	\N	\N	ANNUAL_FULL_COUNT
f2bfd6db-9ffc-461a-8668-80c212c620cc	DEPARTMENT	Computer Science	30484dea-6436-43f6-9e89-11169dce5312	2026-09-25 11:56:29.256	\N	\N	\N	ANNUAL_FULL_COUNT
75ba77a8-e2a6-4c9d-8ae1-1c8875a0e0af	DEPARTMENT	Computer Science	4e819244-1e21-4f6f-bd3a-29b7c75501b1	2026-09-25 18:12:48.395	2026-09-25 18:15:27.418	\N	\N	ANNUAL_FULL_COUNT
0c162b19-92d9-4bd5-a2b7-465e386fff75	DEPARTMENT	Computer Science	30484dea-6436-43f6-9e89-11169dce5312	2026-09-25 18:21:45.902	2026-09-25 18:22:29.334	\N	\N	ANNUAL_FULL_COUNT
9ef226db-5e47-448c-849d-e8cbb289e0f5	DEPARTMENT	Computer Science	901f48e1-9abb-43ac-8d09-00eda3a91fd6	2026-09-25 18:27:37.176	\N	\N	\N	ANNUAL_FULL_COUNT
24f3fb08-39b5-4b60-b580-02db1a8b4c1f	DEPARTMENT	Administration	9db8adfc-fa2d-4362-85e0-ac98f772752c	2026-09-25 19:09:20.482	\N	\N	\N	ANNUAL_FULL_COUNT
4ab6227b-6893-4f47-aeec-e9c7739f524c	DEPARTMENT	Computer Science	30484dea-6436-43f6-9e89-11169dce5312	2026-09-26 04:24:58.395	\N	\N	\N	ANNUAL_FULL_COUNT
b70d75d7-a165-4ba5-8e0a-d2d8ab313450	DEPARTMENT	Computer Science	30484dea-6436-43f6-9e89-11169dce5312	2026-09-26 04:25:47.495	2026-09-26 04:27:21.87	\N	\N	ANNUAL_FULL_COUNT
1067be56-93f2-475c-a50e-f9d7ce9ce33a	DEPARTMENT	Computer Science	901f48e1-9abb-43ac-8d09-00eda3a91fd6	2026-10-08 06:36:10.576	\N	\N	\N	ANNUAL_FULL_COUNT
964ca16a-e3c4-4bbb-a8ea-f3f5722f5a21	DEPARTMENT	Computer Science	901f48e1-9abb-43ac-8d09-00eda3a91fd6	2026-10-08 06:40:32.762	\N	\N	\N	ANNUAL_FULL_COUNT
3c4ad64d-3e4c-40e7-bfd6-6e03eced4d2b	DEPARTMENT	Computer Science	901f48e1-9abb-43ac-8d09-00eda3a91fd6	2026-10-08 06:41:39.465	\N	\N	\N	ANNUAL_FULL_COUNT
b7e27329-20e6-49d9-af72-f8cc22332958	DEPARTMENT	Computer Science	901f48e1-9abb-43ac-8d09-00eda3a91fd6	2026-10-08 06:43:05.004	\N	\N	\N	ANNUAL_FULL_COUNT
ce9b00a4-58ef-444f-bc22-3d176ab23436	DEPARTMENT	Computer Science	ff4e1bc9-a69a-4646-b6c6-82d306a84513	2026-10-08 07:17:23.506	2026-10-08 07:20:36.436	\N	\N	ANNUAL_FULL_COUNT
224265b4-18fc-41f2-bc7a-72da4242ebcf	DEPARTMENT	Physics	4ee48cf7-3323-4da9-9965-aba8d65cfc94	2026-10-17 13:24:59.856	\N	\N	\N	ANNUAL_FULL_COUNT
\.


--
-- Data for Name: Building; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."Building" (id, name, code, description, address, "createdAt") FROM stdin;
aac5ea31-0597-4f13-a1b7-64cd7b4377d8	Physics Building	PHY-BLD	\N	\N	2026-10-14 05:36:57.314
ac1bc00f-a127-436a-9cd1-18ea2b48a123	New Building	NEW-BLD	\N	\N	2026-10-14 05:36:57.314
4455056e-dbfa-4414-857e-39b8adb2236b	CNCS BLG	CNCS-BLG	\N	\N	2026-10-14 05:36:57.314
e64984fa-54e5-42d2-a6d5-4e72fca0b210	402	B402	\N	\N	2026-10-14 05:36:57.314
0cbef882-294b-4eec-9e4c-4ae397ac56b9	QA Test Building	QA-BLD	\N	\N	2026-10-14 05:36:57.314
0eb43922-2dcc-40a1-8604-f07488a54717	CNCS Building	CNCS-BLD	\N	\N	2026-10-14 05:36:57.314
88db6cba-57be-4d53-8e01-40be54bab59c	306	B306	\N	\N	2026-10-14 05:36:57.314
9a3fbf04-cc13-41fb-afa7-1f45c6aeb1bf	Science Complex	SCI-CPLX	\N	\N	2026-10-14 05:36:57.314
\.


--
-- Data for Name: Category; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."Category" (id, name) FROM stdin;
2cb48022-c2ba-498c-95b7-fa7a6be6317f	Lab Equipment
acb72a72-3912-4e0b-9fc7-03fcef0494f2	Office Supplies
40e08c1d-adc0-45d1-bdb9-1e56cee4cc85	Electronics
4fbc7aa4-4778-4363-adc8-d7ec8c1e4c3b	Furniture
062afc82-1672-424c-8395-9abb08f64f3d	Kitchen Appliances
7ab8b19e-be21-44e3-b4b9-22f463676f14	Vehicles
\.


--
-- Data for Name: CustodyEvent; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."CustodyEvent" (id, "itemId", "eventType", "fromHolderType", "fromHolderId", "toHolderType", "toHolderId", "actingUserId", reason, "departmentHeadSnapshot", "createdAt") FROM stdin;
9e2762f7-a009-46ca-a908-0e221d23924a	50f19c36-bac3-4d67-8d5f-097e1810a7c2	TRANSFERRED	STAFF	901f48e1-9abb-43ac-8d09-00eda3a91fd6	STAFF	a541e5b4-96a5-4fd8-98d7-034d7749e5a0	30484dea-6436-43f6-9e89-11169dce5312	Seed data correction: reassign item to departmental staff (2026-10-14)	CS Department Head	2026-10-14 06:13:45.238
9f2f0360-cd6b-4a74-ac1e-1eaec82a6f56	c084eea2-06c2-431c-a60c-bae35676142c	TRANSFERRED	STAFF	901f48e1-9abb-43ac-8d09-00eda3a91fd6	STAFF	d4f7c39e-196c-4a65-b6e3-e77e0129450a	30484dea-6436-43f6-9e89-11169dce5312	Seed data correction: reassign item to departmental staff (2026-10-14)	Biology Department Head	2026-10-14 06:13:45.238
ea4a8aaf-26b0-426e-8453-ae72a1f849d2	46ebb65a-4a00-467b-b14c-c4d5306ac743	TRANSFERRED	STAFF	901f48e1-9abb-43ac-8d09-00eda3a91fd6	STAFF	a541e5b4-96a5-4fd8-98d7-034d7749e5a0	30484dea-6436-43f6-9e89-11169dce5312	Seed data correction: reassign item to departmental staff (2026-10-14)	CS Department Head	2026-10-14 06:13:45.238
5659fb1d-4544-46f0-9d24-9440e7dc0681	aea934b7-c2cd-4895-9ff3-4b58ebc81306	TRANSFERRED	STAFF	901f48e1-9abb-43ac-8d09-00eda3a91fd6	STAFF	a541e5b4-96a5-4fd8-98d7-034d7749e5a0	30484dea-6436-43f6-9e89-11169dce5312	Seed data correction: reassign item to departmental staff (2026-10-14)	CS Department Head	2026-10-14 06:13:45.238
e194f1af-f2ce-467e-a8a1-7a58063535e8	2383cdcc-88e7-40cc-8664-84a79604ba57	TRANSFERRED	STAFF	901f48e1-9abb-43ac-8d09-00eda3a91fd6	STAFF	a541e5b4-96a5-4fd8-98d7-034d7749e5a0	30484dea-6436-43f6-9e89-11169dce5312	Seed data correction: reassign item to departmental staff (2026-10-14)	CS Department Head	2026-10-14 06:13:45.238
56468a82-b1e8-4853-9fc4-fdc966f44718	49c3aabb-c76f-4234-9b32-ccc73489a894	TRANSFERRED	STAFF	901f48e1-9abb-43ac-8d09-00eda3a91fd6	STAFF	d4f7c39e-196c-4a65-b6e3-e77e0129450a	30484dea-6436-43f6-9e89-11169dce5312	Seed data correction: reassign item to departmental staff (2026-10-14)	Biology Department Head	2026-10-14 06:13:45.238
f37dbf12-97b8-4d84-8447-efdb9d6cb320	49beb5cd-66ee-4c16-b659-1155c4e1aa50	TRANSFERRED	STAFF	901f48e1-9abb-43ac-8d09-00eda3a91fd6	STAFF	3c956caa-993b-4730-8f75-e855cb9f0ee9	30484dea-6436-43f6-9e89-11169dce5312	Seed data correction: reassign item to departmental staff (2026-10-14)	Chemistry Department Head	2026-10-14 06:13:45.238
c82e74f5-8c44-407f-8455-c8305bcb3fcc	2c7706bb-d2d3-43e3-b879-a631f2c03238	TRANSFERRED	STAFF	901f48e1-9abb-43ac-8d09-00eda3a91fd6	STAFF	d4f7c39e-196c-4a65-b6e3-e77e0129450a	30484dea-6436-43f6-9e89-11169dce5312	Seed data correction: reassign item to departmental staff (2026-10-14)	Biology Department Head	2026-10-14 06:13:45.238
\.


--
-- Data for Name: EmailToken; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."EmailToken" (id, "userId", type, "tokenHash", "expiresAt", "usedAt", "createdAt") FROM stdin;
\.


--
-- Data for Name: Item; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."Item" (id, "tagId", name, "categoryId", floor, room, "ownerId", "purchaseCost", "currentValue", condition, brand, model, "serialNumber", "photoUrl", notes, status, "disposalReason", "disposedAt", "registeredAt", "lastAuditedAt", "parentItemId", "claimDueAt", "claimedAt", "holderId", "holderType", "lastVerifiedAt", "lastVerifiedById", pin, version, "voidReason", "voidedAt", "voidedById", "orgUnitId", "buildingId") FROM stdin;
50f19c36-bac3-4d67-8d5f-097e1810a7c2	CNCS-DEMO-0001	Dell Latitude Laptop	40e08c1d-adc0-45d1-bdb9-1e56cee4cc85	3	312	a541e5b4-96a5-4fd8-98d7-034d7749e5a0	45000.000000000000000000000000000000	\N	GOOD	Dell	Latitude 5420	\N	/photos/laptop.jpg	\N	ACTIVE	\N	\N	2026-09-22 05:07:33.012	2026-09-26 04:27:21.87	\N	\N	\N	a541e5b4-96a5-4fd8-98d7-034d7749e5a0	STAFF	\N	\N	\N	0	\N	\N	\N	1b04c39b-76d2-4d99-b627-8b872f6f7a93	0eb43922-2dcc-40a1-8604-f07488a54717
c084eea2-06c2-431c-a60c-bae35676142c	CNCS-6A28809C	Laptop	40e08c1d-adc0-45d1-bdb9-1e56cee4cc85	3rd	301	d4f7c39e-196c-4a65-b6e3-e77e0129450a	28000.000000000000000000000000000000	\N	GOOD	Lenovo	LA65FM1300	159368226684268866	https://res.cloudinary.com/r3rzw77s/image/upload/v1790234177/cncs-pms/items/pending-e2d13f5f-62fa-44fa-9b1a-0dcf7655a608.jpg	Lenovo laptop for Freshman	ACTIVE	\N	\N	2026-09-24 07:14:22.664	2026-09-25 18:15:27.418	\N	\N	\N	d4f7c39e-196c-4a65-b6e3-e77e0129450a	STAFF	\N	\N	\N	0	\N	\N	\N	162b5e2a-b6fb-4450-b3c5-300218f87531	4455056e-dbfa-4414-857e-39b8adb2236b
29f43025-5cb8-42e3-8fb5-3865a2ae85d8	CNCS-DEMO-0003	Microscope	2cb48022-c2ba-498c-95b7-fa7a6be6317f	2	204	901f48e1-9abb-43ac-8d09-00eda3a91fd6	120000.000000000000000000000000000000	\N	FAIR	Olympus	CX23	\N	/photos/microscope.jpg	\N	DISPOSED	It was broken during class beyond repair.	2026-10-08 04:01:33.335	2026-09-22 05:08:14.949	\N	\N	\N	\N	901f48e1-9abb-43ac-8d09-00eda3a91fd6	STAFF	\N	\N	\N	0	\N	\N	\N	1b04c39b-76d2-4d99-b627-8b872f6f7a93	9a3fbf04-cc13-41fb-afa7-1f45c6aeb1bf
11e96289-6a52-460e-b792-4bf63d00de14	CNCS-95AFE0BA	Desktop Computer	2cb48022-c2ba-498c-95b7-fa7a6be6317f	2nd	205	901f48e1-9abb-43ac-8d09-00eda3a91fd6	50000.000000000000000000000000000000	\N	GOOD	Dell	\N	DELL7090CS2026	\N	\N	DISPOSED	Obsolete hardware	2026-09-24 08:11:09.482	2026-09-24 07:57:40.698	\N	\N	\N	\N	901f48e1-9abb-43ac-8d09-00eda3a91fd6	STAFF	\N	\N	\N	0	\N	\N	\N	1b04c39b-76d2-4d99-b627-8b872f6f7a93	ac1bc00f-a127-436a-9cd1-18ea2b48a123
2807aa69-9e34-44ac-a103-9f2eabc68872	CNCS-4808FF0B	QA TEST Laptop 2026-09-25	40e08c1d-adc0-45d1-bdb9-1e56cee4cc85	2	QA-201	901f48e1-9abb-43ac-8d09-00eda3a91fd6	1234.560000000000000000000000000000	1000.000000000000000000000000000000	GOOD	QA Brand	\N	QA-20260925-001	\N	QA-only record. Edited to test persistence and history. No real asset.	DISPOSED	QA-only disposal test for the temporary asset created during verification.	2026-09-26 10:20:05.629	2026-09-25 11:18:53.744	2026-09-25 18:22:29.334	\N	\N	\N	901f48e1-9abb-43ac-8d09-00eda3a91fd6	STAFF	\N	\N	\N	0	\N	\N	\N	1b04c39b-76d2-4d99-b627-8b872f6f7a93	0cbef882-294b-4eec-9e4c-4ae397ac56b9
70cd37cc-2abe-4c83-a4ff-9b1d609b2910	CNCS-DEMO-0005	Physics Lab Equipment	2cb48022-c2ba-498c-95b7-fa7a6be6317f	1	101	30484dea-6436-43f6-9e89-11169dce5312	50000.000000000000000000000000000000	\N	GOOD	\N	\N	\N	/photos/physics.jpg	\N	ACTIVE	\N	\N	2026-10-13 16:22:40.397	\N	\N	\N	\N	a4a52092-f0a6-4f3a-8e2c-ba4186da782b	DEPARTMENT	\N	\N	\N	0	\N	\N	\N	a4a52092-f0a6-4f3a-8e2c-ba4186da782b	aac5ea31-0597-4f13-a1b7-64cd7b4377d8
46ebb65a-4a00-467b-b14c-c4d5306ac743	CNCS-0D544927	HP Laptop charger	40e08c1d-adc0-45d1-bdb9-1e56cee4cc85	4	412	a541e5b4-96a5-4fd8-98d7-034d7749e5a0	2000.000000000000000000000000000000	\N	FAIR	HP	HP847	5463491934949455494	https://res.cloudinary.com/r3rzw77s/image/upload/v1791374667/cncs-pms/items/pending-658f4da0-7dc0-4304-ac00-65cc1523c315.jpg	\N	ACTIVE	\N	\N	2026-10-07 12:06:46.121	2026-10-08 07:20:36.436	\N	\N	\N	a541e5b4-96a5-4fd8-98d7-034d7749e5a0	STAFF	\N	\N	\N	0	\N	\N	\N	1b04c39b-76d2-4d99-b627-8b872f6f7a93	ac1bc00f-a127-436a-9cd1-18ea2b48a123
aea934b7-c2cd-4895-9ff3-4b58ebc81306	CNCS-90F21604	Notebook Laptop	40e08c1d-adc0-45d1-bdb9-1e56cee4cc85	3	315	a541e5b4-96a5-4fd8-98d7-034d7749e5a0	50000.000000000000000000000000000000	50000.000000000000000000000000000000	NEW	HP	\N	12345678	\N	\N	ACTIVE	\N	\N	2026-10-08 04:24:05.812	2026-10-08 07:20:36.436	\N	\N	\N	a541e5b4-96a5-4fd8-98d7-034d7749e5a0	STAFF	\N	\N	\N	0	\N	\N	\N	1b04c39b-76d2-4d99-b627-8b872f6f7a93	ac1bc00f-a127-436a-9cd1-18ea2b48a123
2383cdcc-88e7-40cc-8664-84a79604ba57	CNCS-DEMO-0002	Office Desk	4fbc7aa4-4778-4363-adc8-d7ec8c1e4c3b	1	101	a541e5b4-96a5-4fd8-98d7-034d7749e5a0	8000.000000000000000000000000000000	\N	NEW	\N	\N	\N	/photos/desk.jpg	\N	ACTIVE	\N	\N	2026-09-22 05:08:14.263	\N	\N	\N	\N	a541e5b4-96a5-4fd8-98d7-034d7749e5a0	STAFF	\N	\N	\N	0	\N	\N	\N	1b04c39b-76d2-4d99-b627-8b872f6f7a93	0eb43922-2dcc-40a1-8604-f07488a54717
49c3aabb-c76f-4234-9b32-ccc73489a894	CNCS-81928FDE	Water bottle	acb72a72-3912-4e0b-9fc7-03fcef0494f2	2	215	d4f7c39e-196c-4a65-b6e3-e77e0129450a	650.000000000000000000000000000000	650.000000000000000000000000000000	NEW	Refill	8Am	12345	https://res.cloudinary.com/r3rzw77s/image/upload/v1790336445/cncs-pms/items/pending-bc3b810e-5205-4111-aca0-8ecb8473f690.jpg	These product was purchased by my own money so I will be requesting for refund from the department head.	ACTIVE	\N	\N	2026-09-25 11:41:44.206	2026-09-25 11:54:59.746	\N	\N	\N	d4f7c39e-196c-4a65-b6e3-e77e0129450a	STAFF	\N	\N	\N	0	\N	\N	\N	162b5e2a-b6fb-4450-b3c5-300218f87531	88db6cba-57be-4d53-8e01-40be54bab59c
49beb5cd-66ee-4c16-b659-1155c4e1aa50	CNCS-DEMO-0004	Dell 65W Charger	40e08c1d-adc0-45d1-bdb9-1e56cee4cc85	3	312	3c956caa-993b-4730-8f75-e855cb9f0ee9	1200.000000000000000000000000000000	\N	GOOD	Dell	LA65NM130	\N	/photos/charger.jpg	\N	ACTIVE	\N	\N	2026-09-22 05:08:15.545	2026-09-25 18:15:27.418	50f19c36-bac3-4d67-8d5f-097e1810a7c2	\N	\N	3c956caa-993b-4730-8f75-e855cb9f0ee9	STAFF	\N	\N	\N	0	\N	\N	\N	3b0a46f9-c013-4e67-ab9c-4498836a561d	0eb43922-2dcc-40a1-8604-f07488a54717
2c7706bb-d2d3-43e3-b879-a631f2c03238	CNCS-C3CBF509	Chair	4fbc7aa4-4778-4363-adc8-d7ec8c1e4c3b	1	105	d4f7c39e-196c-4a65-b6e3-e77e0129450a	919.890000000000000000000000000000	1044.840000000000000000000000000000	FAIR	Local	\N	N/A	https://res.cloudinary.com/r3rzw77s/image/upload/v1790361330/cncs-pms/items/pending-e0bc84cf-6a8c-4034-8eec-f43619f3010b.jpg	\N	ACTIVE	\N	\N	2026-09-25 18:35:45.377	\N	49c3aabb-c76f-4234-9b32-ccc73489a894	\N	\N	d4f7c39e-196c-4a65-b6e3-e77e0129450a	STAFF	\N	\N	\N	0	\N	\N	\N	162b5e2a-b6fb-4450-b3c5-300218f87531	e64984fa-54e5-42d2-a6d5-4e72fca0b210
\.


--
-- Data for Name: ItemEditLog; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."ItemEditLog" (id, "itemId", "editedById", "fieldChanged", "oldValue", "newValue", "editedAt") FROM stdin;
e3c776d8-de10-4e2b-85de-c5ba79b101f1	2383cdcc-88e7-40cc-8664-84a79604ba57	901f48e1-9abb-43ac-8d09-00eda3a91fd6	photoUrl	/photos/desk.jpg	https://res.cloudinary.com/r3rzw77s/image/upload/v1790056282/cncs-pms/items/CNCS-DEMO-0002.jpg	2026-09-22 05:51:22.613
879ee4a4-f272-4d2d-b2d9-24f39a3cece6	c084eea2-06c2-431c-a60c-bae35676142c	30484dea-6436-43f6-9e89-11169dce5312	photoUrl	https://res.cloudinary.com/r3rzw77s/image/upload/v1790234043/cncs-pms/items/pending-210ad0a9-78e3-40fc-9498-845908bd43d5.jpg	https://res.cloudinary.com/r3rzw77s/image/upload/v1790234177/cncs-pms/items/pending-e2d13f5f-62fa-44fa-9b1a-0dcf7655a608.jpg	2026-09-24 07:16:22.63
9fd323b6-524d-4a33-901b-a39409b0ec12	c084eea2-06c2-431c-a60c-bae35676142c	f086ebee-dfc5-48b2-a181-56fac9845b37	building	Freshmen BLDG	CNCS BLG	2026-09-24 07:19:46.999
a0523aa3-ead1-4543-90f4-7a709b0e2d9f	c084eea2-06c2-431c-a60c-bae35676142c	f086ebee-dfc5-48b2-a181-56fac9845b37	floor	2nd	3rd	2026-09-24 07:19:46.999
26de9fb9-3396-4550-848f-accd9f032442	c084eea2-06c2-431c-a60c-bae35676142c	f086ebee-dfc5-48b2-a181-56fac9845b37	room	213	301	2026-09-24 07:19:46.999
26137449-718e-4102-9790-2c8d66af4748	c084eea2-06c2-431c-a60c-bae35676142c	30484dea-6436-43f6-9e89-11169dce5312	brand	HP	Lenovo	2026-09-24 07:43:26.269
28107318-d2bb-4c31-a962-22e5f00d512e	c084eea2-06c2-431c-a60c-bae35676142c	30484dea-6436-43f6-9e89-11169dce5312	notes	HP laptop for Freshman	Lenovo laptop for Freshman	2026-09-24 07:43:26.269
ee96d765-af86-4bb1-9dd5-7b33496c4623	11e96289-6a52-460e-b792-4bf63d00de14	30484dea-6436-43f6-9e89-11169dce5312	ownerId	Demo Staff (901f48e1-9abb-43ac-8d09-00eda3a91fd6)	System Admin (30484dea-6436-43f6-9e89-11169dce5312)	2026-09-24 08:01:02.434
5dbde236-bdb6-44c1-8644-21f34c709172	11e96289-6a52-460e-b792-4bf63d00de14	30484dea-6436-43f6-9e89-11169dce5312	model	OptiPlex	\N	2026-09-24 08:01:02.434
81a04a4e-f07b-4a0b-8641-4c25a8e7c8eb	11e96289-6a52-460e-b792-4bf63d00de14	30484dea-6436-43f6-9e89-11169dce5312	status	ACTIVE	DISPOSED	2026-09-24 08:11:09.482
f1c5dbb3-ae4f-417d-b357-167056c8f941	11e96289-6a52-460e-b792-4bf63d00de14	30484dea-6436-43f6-9e89-11169dce5312	disposalReason	\N	Obsolete hardware	2026-09-24 08:11:09.482
52e89db8-8ddf-4d88-bc5c-30f2687fe8be	11e96289-6a52-460e-b792-4bf63d00de14	30484dea-6436-43f6-9e89-11169dce5312	disposedAt	\N	2026-09-24T08:11:09.482Z	2026-09-24 08:11:09.482
74ca74ac-0816-4e1f-841a-8a071b7ba518	2807aa69-9e34-44ac-a103-9f2eabc68872	901f48e1-9abb-43ac-8d09-00eda3a91fd6	room	QA-101	QA-102	2026-09-25 11:19:19.756
2c345a9b-910c-4409-94d7-766be658190b	2807aa69-9e34-44ac-a103-9f2eabc68872	901f48e1-9abb-43ac-8d09-00eda3a91fd6	notes	QA-only record created for authorized workflow testing. No real asset.	QA-only record. Edited to test persistence and history. No real asset.	2026-09-25 11:19:19.756
86c2fb8f-55a1-4657-93d4-ed4f189fd92b	2383cdcc-88e7-40cc-8664-84a79604ba57	30484dea-6436-43f6-9e89-11169dce5312	parentItemId	\N	CNCS-81928FDE (49c3aabb-c76f-4234-9b32-ccc73489a894)	2026-09-25 11:53:53.368
2a39f9e5-aa3b-4d74-9985-071b821a1f63	2383cdcc-88e7-40cc-8664-84a79604ba57	30484dea-6436-43f6-9e89-11169dce5312	parentItemId	CNCS-81928FDE (49c3aabb-c76f-4234-9b32-ccc73489a894)	\N	2026-09-25 11:54:12.411
57d60927-8b57-4a96-aa06-ac01c3e73c4e	49c3aabb-c76f-4234-9b32-ccc73489a894	30484dea-6436-43f6-9e89-11169dce5312	department	Computer Science	Physics	2026-09-25 11:57:03.408
20dcbf99-04fc-4ae3-aab6-91041a175d48	2807aa69-9e34-44ac-a103-9f2eabc68872	30484dea-6436-43f6-9e89-11169dce5312	floor	1	2	2026-09-25 18:19:36.259
31ae254f-a9ad-469e-a776-07ca547f78e6	2807aa69-9e34-44ac-a103-9f2eabc68872	30484dea-6436-43f6-9e89-11169dce5312	room	QA-102	QA-201	2026-09-25 18:19:36.259
335f970d-c62b-4328-bfca-de5723377a4b	2c7706bb-d2d3-43e3-b879-a631f2c03238	30484dea-6436-43f6-9e89-11169dce5312	categoryId	Electronics (40e08c1d-adc0-45d1-bdb9-1e56cee4cc85)	Furniture (4fbc7aa4-4778-4363-adc8-d7ec8c1e4c3b)	2026-09-25 18:39:20.018
3952e3ad-6502-43f4-b581-4be1846904d8	2c7706bb-d2d3-43e3-b879-a631f2c03238	9db8adfc-fa2d-4362-85e0-ac98f772752c	currentValue	1044.83	1044.84	2026-09-25 19:06:44.614
4b378c2e-2d81-4b75-9e18-bf088792b6cb	2807aa69-9e34-44ac-a103-9f2eabc68872	30484dea-6436-43f6-9e89-11169dce5312	status	ACTIVE	DISPOSED	2026-09-26 10:20:05.629
faa6e7f0-d017-4765-bf1c-cca38c0c8c7c	2807aa69-9e34-44ac-a103-9f2eabc68872	30484dea-6436-43f6-9e89-11169dce5312	disposalReason	\N	QA-only disposal test for the temporary asset created during verification.	2026-09-26 10:20:05.629
72131852-aff7-456f-9574-b5647f90c9de	2807aa69-9e34-44ac-a103-9f2eabc68872	30484dea-6436-43f6-9e89-11169dce5312	disposedAt	\N	2026-09-26T10:20:05.629Z	2026-09-26 10:20:05.629
4679955f-13b3-4ecd-99c1-f721778e5ff7	2c7706bb-d2d3-43e3-b879-a631f2c03238	4e819244-1e21-4f6f-bd3a-29b7c75501b1	room	104	105	2026-10-08 03:52:29.041
e7cde134-4872-4f67-9223-e91ba4614344	29f43025-5cb8-42e3-8fb5-3865a2ae85d8	4e819244-1e21-4f6f-bd3a-29b7c75501b1	status	ACTIVE	DISPOSED	2026-10-08 04:01:33.335
f6db2d69-bbea-410b-8cd7-61d14dd20b59	29f43025-5cb8-42e3-8fb5-3865a2ae85d8	4e819244-1e21-4f6f-bd3a-29b7c75501b1	disposalReason	\N	It was broken during class beyond repair.	2026-10-08 04:01:33.335
251dad2b-31a7-40a4-b4ea-0cccd69e909e	29f43025-5cb8-42e3-8fb5-3865a2ae85d8	4e819244-1e21-4f6f-bd3a-29b7c75501b1	disposedAt	\N	2026-10-08T04:01:33.335Z	2026-10-08 04:01:33.335
e306d7f2-43db-455a-b2e1-c463da3fb277	2c7706bb-d2d3-43e3-b879-a631f2c03238	8af62f1e-7583-4a64-8910-0f9569d509ac	parentItemId	\N	CNCS-81928FDE (49c3aabb-c76f-4234-9b32-ccc73489a894)	2026-10-08 06:29:55.551
e6005e10-1ccf-4d53-948b-04beaa0697fd	50f19c36-bac3-4d67-8d5f-097e1810a7c2	30484dea-6436-43f6-9e89-11169dce5312	building	CNCS Building	New Building	2026-10-08 07:06:32.874
690ef6eb-19b8-4c13-bea2-abe8f12f46d9	50f19c36-bac3-4d67-8d5f-097e1810a7c2	30484dea-6436-43f6-9e89-11169dce5312	floor	3	4	2026-10-08 07:06:32.874
9a565d20-7ba6-45c2-9e64-f928172b9caf	50f19c36-bac3-4d67-8d5f-097e1810a7c2	30484dea-6436-43f6-9e89-11169dce5312	room	312	415	2026-10-08 07:06:32.874
f73a6e89-61d1-40db-a2f8-0213a39e6e50	49beb5cd-66ee-4c16-b659-1155c4e1aa50	30484dea-6436-43f6-9e89-11169dce5312	building	CNCS Building	New Building	2026-10-08 07:06:32.874
02b6f2ba-6693-44c4-9f32-aae6953f44e9	49beb5cd-66ee-4c16-b659-1155c4e1aa50	30484dea-6436-43f6-9e89-11169dce5312	floor	3	4	2026-10-08 07:06:32.874
ead64a6c-659a-4804-a7a9-2f67e152835c	49beb5cd-66ee-4c16-b659-1155c4e1aa50	30484dea-6436-43f6-9e89-11169dce5312	room	312	415	2026-10-08 07:06:32.874
\.


--
-- Data for Name: Notification; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."Notification" (id, "userId", message, "relatedRequestId", "isRead", "createdAt") FROM stdin;
434df7e7-3838-4e07-8af9-95fe8c58a73b	901f48e1-9abb-43ac-8d09-00eda3a91fd6	[REQUEST_APPROVED] Your TRANSFER request for item CNCS-4808FF0B (QA TEST Laptop 2026-09-25) was approved by System Admin.	8e5956f3-4b30-4e7f-bba8-423174f47585	t	2026-09-25 18:19:36.259
19bf02a3-dd42-48c0-b37c-f75969f421b5	901f48e1-9abb-43ac-8d09-00eda3a91fd6	[REQUEST_APPROVED] Your DISPOSAL request for item CNCS-4808FF0B (QA TEST Laptop 2026-09-25) was approved by System Admin.	92cd0369-67f9-4ee0-82eb-2292b6a22a33	t	2026-09-26 10:20:05.629
a8a30035-e194-4c0c-b58c-de95c601cb63	873541c8-127b-4994-9df7-ba5fe3263f4f	[REQUEST_SUBMITTED] CS Staff 1 requested a TRANSFER for item CNCS-90F21604 (Notebook Laptop) and it needs your review.	76d94510-b50d-4ed4-92f3-3983b1423de3	f	2026-10-15 12:13:20.39
dee111c1-7830-455a-90fe-d431dd18e24b	901f48e1-9abb-43ac-8d09-00eda3a91fd6	[REQUEST_REJECTED] Your TRANSFER request for item CNCS-DEMO-0001 (Dell Latitude Laptop) was rejected by Lalu Geleta Gudisa. Reason: I haven't been notified of any move by anyone from the department	seed-req-0001	t	2026-10-08 03:54:39.946
c0dafd4e-b218-4117-9f2f-31594cebb0c1	ff4e1bc9-a69a-4646-b6c6-82d306a84513	[REQUEST_APPROVED] Your TRANSFER request for item CNCS-DEMO-0001 (Dell Latitude Laptop) was approved by System Admin.	d135e42b-a45d-46e1-939b-f9b57b8f19cc	f	2026-10-08 07:06:32.874
6b8bd2b8-facd-415c-a323-d0525f114b0e	2b87e04f-a6fc-471a-8798-0e3d62b2df49	[REQUEST_SUBMITTED] CS Staff 1 requested a TRANSFER for item CNCS-90F21604 (Notebook Laptop) and it needs your review.	76d94510-b50d-4ed4-92f3-3983b1423de3	f	2026-10-15 12:13:20.39
768d028b-be2d-4fd0-8d7f-354e924ed046	29577602-37c8-498f-ad29-939e88f94522	[REQUEST_SUBMITTED] CS Staff 1 requested a TRANSFER for item CNCS-90F21604 (Notebook Laptop) and it needs your review.	76d94510-b50d-4ed4-92f3-3983b1423de3	f	2026-10-15 12:13:20.39
41379a7a-24db-4d13-86ec-c8d9bccaf509	32739dce-f9e3-459e-bd4a-866e2b23db82	[REQUEST_SUBMITTED] CS Staff 1 requested a TRANSFER for item CNCS-90F21604 (Notebook Laptop) and it needs your review.	76d94510-b50d-4ed4-92f3-3983b1423de3	f	2026-10-15 12:13:20.39
66e8b0d5-7b9f-4439-bc7e-56c271fe5f64	0bba45be-d6ea-473e-b91e-fa15098dd9b7	[REQUEST_SUBMITTED] CS Staff 1 requested a TRANSFER for item CNCS-90F21604 (Notebook Laptop) and it needs your review.	76d94510-b50d-4ed4-92f3-3983b1423de3	t	2026-10-15 12:13:20.39
\.


--
-- Data for Name: OrgUnit; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."OrgUnit" (id, name, code, type, "isActive", "acceptsSelfReg", "createdAt", "parentId", "headId") FROM stdin;
b540bba5-9922-4bf0-95bf-ea0f74e02875	CNCS	CNCS	COLLEGE	t	f	2026-10-13 15:06:49.587	\N	\N
a4a52092-f0a6-4f3a-8e2c-ba4186da782b	Physics	PHYS	DEPARTMENT	t	t	2026-10-13 15:06:49.587	b540bba5-9922-4bf0-95bf-ea0f74e02875	\N
1b04c39b-76d2-4d99-b627-8b872f6f7a93	Computer Science	CS	DEPARTMENT	t	t	2026-10-13 15:06:49.587	b540bba5-9922-4bf0-95bf-ea0f74e02875	2b87e04f-a6fc-471a-8798-0e3d62b2df49
162b5e2a-b6fb-4450-b3c5-300218f87531	Biology	BIO	DEPARTMENT	t	t	2026-10-13 15:06:49.587	b540bba5-9922-4bf0-95bf-ea0f74e02875	29577602-37c8-498f-ad29-939e88f94522
3b0a46f9-c013-4e67-ab9c-4498836a561d	Chemistry	CHEM	DEPARTMENT	t	t	2026-10-13 15:06:49.587	b540bba5-9922-4bf0-95bf-ea0f74e02875	32739dce-f9e3-459e-bd4a-866e2b23db82
\.


--
-- Data for Name: Request; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."Request" (id, type, status, "itemId", "requestedById", "reviewedById", reason, "rejectionReason", "newLocationBuilding", "newLocationFloor", "newLocationRoom", "newOwnerId", "createdAt", "decidedAt", "fromHolderId", "fromHolderType", "toHolderId", "toHolderType", "loanDueDate", "loanReturnedAt", "loanReturnedById", "stage1ApprovedAt", "stage1ApprovedById", "stage2ApprovedAt", "stage2ApprovedById", "invalidatedAt", "invalidatedReason", "withdrawnAt", "withdrawnById") FROM stdin;
fd8c7cc6-2f0b-4241-a9bc-bba360e32dee	TRANSFER	APPROVED	c084eea2-06c2-431c-a60c-bae35676142c	30484dea-6436-43f6-9e89-11169dce5312	f086ebee-dfc5-48b2-a181-56fac9845b37	needed there	\N	CNCS BLG	3rd	301	\N	2026-09-24 07:17:23.369	2026-09-24 07:19:46.999	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N
e8689494-ec51-46b1-a6a3-3abe23fda62e	DISPOSAL	APPROVED	11e96289-6a52-460e-b792-4bf63d00de14	901f48e1-9abb-43ac-8d09-00eda3a91fd6	30484dea-6436-43f6-9e89-11169dce5312	Obsolete hardware	\N	\N	\N	\N	\N	2026-09-24 08:10:22.832	2026-09-24 08:11:09.482	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N
8e5956f3-4b30-4e7f-bba8-423174f47585	TRANSFER	APPROVED	2807aa69-9e34-44ac-a103-9f2eabc68872	901f48e1-9abb-43ac-8d09-00eda3a91fd6	30484dea-6436-43f6-9e89-11169dce5312	QA-only transfer to verify staff submission and admin approval.	\N	QA Test Building	2	QA-201	\N	2026-09-25 11:20:01.538	2026-09-25 18:19:36.259	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N
92cd0369-67f9-4ee0-82eb-2292b6a22a33	DISPOSAL	APPROVED	2807aa69-9e34-44ac-a103-9f2eabc68872	901f48e1-9abb-43ac-8d09-00eda3a91fd6	30484dea-6436-43f6-9e89-11169dce5312	QA-only disposal test for the temporary asset created during verification.	\N	\N	\N	\N	\N	2026-09-25 18:23:56.702	2026-09-26 10:20:05.629	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N
aa30bad8-3c08-4027-8a6e-2e76d3b6fbe3	TRANSFER	APPROVED	2c7706bb-d2d3-43e3-b879-a631f2c03238	30484dea-6436-43f6-9e89-11169dce5312	4e819244-1e21-4f6f-bd3a-29b7c75501b1	Dorm 105 needs a table.	\N	402	1	105	\N	2026-09-25 18:37:32.66	2026-10-08 03:52:29.041	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N
088d6fce-a4ec-4f5e-9f93-b0be99a8bfc7	TRANSFER	PENDING	49c3aabb-c76f-4234-9b32-ccc73489a894	30484dea-6436-43f6-9e89-11169dce5312	\N	Student has been assigned a new permanent dorm.	\N	306	2	202	\N	2026-10-08 03:57:15.83	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N
957c87dd-6a73-402f-97eb-eaad992acc90	TRANSFER	PENDING	2383cdcc-88e7-40cc-8664-84a79604ba57	30484dea-6436-43f6-9e89-11169dce5312	\N	The owner has been assigned a new office room.	\N	New building	3	315	\N	2026-10-08 03:59:36.614	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N
8a4114e4-3bf6-47bb-a505-aa17fe26caa7	DISPOSAL	APPROVED	29f43025-5cb8-42e3-8fb5-3865a2ae85d8	30484dea-6436-43f6-9e89-11169dce5312	4e819244-1e21-4f6f-bd3a-29b7c75501b1	It was broken during class beyond repair.	\N	\N	\N	\N	\N	2026-10-08 03:58:17.13	2026-10-08 04:01:33.335	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N
d135e42b-a45d-46e1-939b-f9b57b8f19cc	TRANSFER	APPROVED	50f19c36-bac3-4d67-8d5f-097e1810a7c2	ff4e1bc9-a69a-4646-b6c6-82d306a84513	30484dea-6436-43f6-9e89-11169dce5312	The user has changed his location	\N	New Building	4	415	\N	2026-10-08 07:04:21.477	2026-10-08 07:06:32.874	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N
seed-req-0001	TRANSFER	PENDING	50f19c36-bac3-4d67-8d5f-097e1810a7c2	901f48e1-9abb-43ac-8d09-00eda3a91fd6	\N	Laptop is moving with its user to the ground-floor office.	\N	CNCS Building	1	101	\N	2026-09-22 05:08:16.626	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N
76d94510-b50d-4ed4-92f3-3983b1423de3	TRANSFER	PENDING	aea934b7-c2cd-4895-9ff3-4b58ebc81306	a541e5b4-96a5-4fd8-98d7-034d7749e5a0	\N	Test transfer	\N	\N	\N	Test Room	\N	2026-10-15 12:13:20.39	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N
e00e16fe-9de4-4683-b62a-64d51fa16775	TRANSFER	PENDING	50f19c36-bac3-4d67-8d5f-097e1810a7c2	a541e5b4-96a5-4fd8-98d7-034d7749e5a0	\N	Pending transfer request	\N	\N	2	205	\N	2026-10-17 10:57:31.272	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N
734cc300-cf74-40f3-91e4-62306b32a3e6	TRANSFER	PENDING_STAGE1	50f19c36-bac3-4d67-8d5f-097e1810a7c2	a541e5b4-96a5-4fd8-98d7-034d7749e5a0	a541e5b4-96a5-4fd8-98d7-034d7749e5a0	Stage 1 approved transfer	\N	\N	2	206	\N	2026-10-17 10:57:32.064	\N	\N	\N	\N	\N	\N	\N	\N	2026-10-17 10:57:32.064	a541e5b4-96a5-4fd8-98d7-034d7749e5a0	\N	\N	\N	\N	\N	\N
b164cf26-53ae-423f-bef6-ba6e9c7c19ee	TRANSFER	PENDING_STAGE2	50f19c36-bac3-4d67-8d5f-097e1810a7c2	a541e5b4-96a5-4fd8-98d7-034d7749e5a0	a541e5b4-96a5-4fd8-98d7-034d7749e5a0	Stage 2 approved transfer	\N	\N	2	207	\N	2026-10-17 10:57:32.666	\N	\N	\N	\N	\N	\N	\N	\N	2026-10-17 10:57:32.666	a541e5b4-96a5-4fd8-98d7-034d7749e5a0	2026-10-17 10:57:32.666	a541e5b4-96a5-4fd8-98d7-034d7749e5a0	\N	\N	\N	\N
1b7faa31-b230-4b6a-8199-f1bc3f9e6028	TRANSFER	APPROVED	50f19c36-bac3-4d67-8d5f-097e1810a7c2	a541e5b4-96a5-4fd8-98d7-034d7749e5a0	a541e5b4-96a5-4fd8-98d7-034d7749e5a0	Approved transfer	\N	\N	2	208	\N	2026-10-17 10:57:33.15	\N	\N	\N	\N	\N	\N	\N	\N	2026-10-17 10:57:33.15	a541e5b4-96a5-4fd8-98d7-034d7749e5a0	2026-10-17 10:57:33.15	a541e5b4-96a5-4fd8-98d7-034d7749e5a0	\N	\N	\N	\N
da48e850-31d4-490a-b7d9-5860d17f76ce	TRANSFER	REJECTED	50f19c36-bac3-4d67-8d5f-097e1810a7c2	a541e5b4-96a5-4fd8-98d7-034d7749e5a0	a541e5b4-96a5-4fd8-98d7-034d7749e5a0	Rejected transfer request	Item is needed in current location	\N	2	209	\N	2026-10-17 10:57:33.634	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N
b92713af-c9e1-4cca-af5f-a75336fc4177	TRANSFER	WAITLISTED	50f19c36-bac3-4d67-8d5f-097e1810a7c2	a541e5b4-96a5-4fd8-98d7-034d7749e5a0	\N	Waitlisted transfer	\N	\N	2	210	\N	2026-10-17 10:57:34.071	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N
fc67aaa9-a372-4e9b-af26-d68a535145df	TRANSFER	WITHDRAWN	50f19c36-bac3-4d67-8d5f-097e1810a7c2	a541e5b4-96a5-4fd8-98d7-034d7749e5a0	\N	Withdrawn by requester	\N	\N	2	211	\N	2026-10-17 10:57:34.499	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-10-17 10:57:34.499	a541e5b4-96a5-4fd8-98d7-034d7749e5a0
c3492029-1361-4dcd-a261-4d2bbc44fc80	TRANSFER	INVALIDATED	50f19c36-bac3-4d67-8d5f-097e1810a7c2	a541e5b4-96a5-4fd8-98d7-034d7749e5a0	\N	Invalidated due to item status change	\N	\N	2	212	\N	2026-10-17 10:57:34.874	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	2026-10-17 10:57:34.874	Item status changed before decision	\N	\N
87edc3bf-eaad-46e4-9e4c-7a2d2ed4c0bc	LOAN	RETURN_PENDING_CONFIRMATION	50f19c36-bac3-4d67-8d5f-097e1810a7c2	a541e5b4-96a5-4fd8-98d7-034d7749e5a0	\N	Loan return pending confirmation	\N	\N	\N	\N	\N	2026-10-17 10:57:35.287	\N	\N	\N	\N	\N	\N	2026-10-17 10:57:35.287	\N	\N	\N	\N	\N	\N	\N	\N	\N
\.


--
-- Data for Name: User; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."User" (id, "fullName", email, "passwordHash", role, "createdAt", "tokenVersion", "mustChangePassword", "accountStatus", "reviewedById", "reviewedAt", "reviewNote", "orgUnitId", "staffId", "escalatedAt", "escalatedById") FROM stdin;
f086ebee-dfc5-48b2-a181-56fac9845b37	Hayredin Mohammed	hayredin.950@gmail.com	$argon2id$v=19$m=65536,p=4,t=3$KLZFBPe4xz6LMhTSF4jLJg$e/M+0Y3n7lzgPhDx/VgFVpo6pmPjLp2dD9znHzeN4Hc	SYSTEM_ADMIN	2026-09-23 16:16:08.035	2	f	ACTIVE	\N	\N	\N	\N	\N	\N	\N
4e819244-1e21-4f6f-bd3a-29b7c75501b1	Lalu Geleta Gudisa	lalu@admin.com	$argon2id$v=19$m=65536,p=4,t=3$sGXM0F2hK0heaufSMpn1sg$Jf2L4ymLC1zwDhFjTnpHV2TMM45ps8Lul+TQFm+An5I	SYSTEM_ADMIN	2026-09-25 12:01:58.868	0	f	ACTIVE	\N	\N	\N	\N	\N	\N	\N
9db8adfc-fa2d-4362-85e0-ac98f772752c	Naomi	naomik@admin.com	$argon2id$v=19$m=65536,p=4,t=3$QyRla/OiWqQO+Xuf6erNfA$7ELC51EBSRxNmAeyj3KSRGEwcPUBNxRKjABR8w/vB0Q	STAFF	2026-09-25 18:30:25.776	0	f	ACTIVE	\N	\N	\N	\N	\N	\N	\N
8af62f1e-7583-4a64-8910-0f9569d509ac	Abebe Chala	abebe@gmail.com	$argon2id$v=19$m=65536,p=4,t=3$Cua3vLt+frUq469z4TLFaQ$T8kiZudTKpeOFsCSKe0bHKMSK0Vsi+/g5CrPwyBBaZ8	STAFF	2026-10-08 06:24:38.309	1	f	ACTIVE	\N	\N	\N	\N	\N	\N	\N
ff4e1bc9-a69a-4646-b6c6-82d306a84513	Abera Belay	abera@gmail.com	$argon2id$v=19$m=65536,p=4,t=3$v1eFnSDzeQEdXU3/mWzP9g$Pn8ou0YjoX+g2SNNmJEOCtCGGeLAcnYh6k8Vy2boafQ	STAFF	2026-10-08 06:57:42.348	1	f	ACTIVE	\N	\N	\N	\N	\N	\N	\N
873541c8-127b-4994-9df7-ba5fe3263f4f	Department Head Test	dept.head@cncs.aau.edu.et	$argon2id$v=19$m=65536,p=4,t=3$XXLtMjGvr5dovPKOshN/bA$xf9UV4fqiOsAisYTkhGkvnO+xt8cEhsAjLJaMdpJwX4	DEPARTMENT_HEAD	2026-10-13 10:32:52.622	0	f	ACTIVE	\N	\N	\N	\N	\N	\N	\N
30484dea-6436-43f6-9e89-11169dce5312	System Admin	admin@cncs.aau.edu.et	$argon2id$v=19$m=65536,p=4,t=3$ol31f7TbziEzYP0vJ9j7KQ$Qv4X+ic3nEdCH0BweHkoa7FkNQ1a0UIiasw/EXHOix0	SYSTEM_ADMIN	2026-09-22 05:07:30.04	0	f	ACTIVE	\N	\N	\N	\N	\N	\N	\N
2b87e04f-a6fc-471a-8798-0e3d62b2df49	CS Department Head	head.cs@cncs.aau.edu.et	$argon2id$v=19$m=65536,p=4,t=3$MGAxdpredqJlM//8P5z8QA$zsWSPXaRgtwxmX7nUmdZYvqs4v2iOG46N5R3uNMSwqM	DEPARTMENT_HEAD	2026-10-13 15:08:00.321	0	f	ACTIVE	\N	\N	\N	1b04c39b-76d2-4d99-b627-8b872f6f7a93	HEAD-CS-001	\N	\N
29577602-37c8-498f-ad29-939e88f94522	Biology Department Head	head.bio@cncs.aau.edu.et	$argon2id$v=19$m=65536,p=4,t=3$I4ogQMgcNlDM7ykW6tMeOg$HwpEM9SKo8ksKospRyIjxyu/PB1vs2di/dA2ppNG6lE	DEPARTMENT_HEAD	2026-10-13 15:08:00.588	0	f	ACTIVE	\N	\N	\N	162b5e2a-b6fb-4450-b3c5-300218f87531	HEAD-BIO-001	\N	\N
32739dce-f9e3-459e-bd4a-866e2b23db82	Chemistry Department Head	head.chem@cncs.aau.edu.et	$argon2id$v=19$m=65536,p=4,t=3$Vc9q4v8HihCs5URMLrP5Ww$ajRap3Nb8jG39U62JUw0ZicPTFVBrqCKSekCE2ts/aE	DEPARTMENT_HEAD	2026-10-13 15:08:00.853	0	f	ACTIVE	\N	\N	\N	3b0a46f9-c013-4e67-ab9c-4498836a561d	HEAD-CHEM-001	\N	\N
a541e5b4-96a5-4fd8-98d7-034d7749e5a0	CS Staff 1	staff.cs1@cncs.aau.edu.et	$argon2id$v=19$m=65536,p=4,t=3$8/QneGn5/n/FhRet+0TsnA$ty4ER4ea7y/OhEmvO/x0e89fpuHKJWaAJhILqGJu9U0	STAFF	2026-10-13 15:08:01.368	0	f	ACTIVE	\N	\N	\N	1b04c39b-76d2-4d99-b627-8b872f6f7a93	STAFF-CS-001	\N	\N
1f1331cc-f9c4-45ec-bab4-40922fe659f8	CS Staff 2	staff.cs2@cncs.aau.edu.et	$argon2id$v=19$m=65536,p=4,t=3$LLI37h6QJF2QieoSe/U7kg$bbwXmhHwK5l7vvgjMVwcXEgWrb/3z9nr3Y3w3qZDPAY	STAFF	2026-10-13 15:08:01.645	0	f	ACTIVE	\N	\N	\N	1b04c39b-76d2-4d99-b627-8b872f6f7a93	STAFF-CS-002	\N	\N
d4f7c39e-196c-4a65-b6e3-e77e0129450a	Biology Staff 1	staff.bio1@cncs.aau.edu.et	$argon2id$v=19$m=65536,p=4,t=3$11jsNIIyPk2+u6L9ola7yA$VxQlYWTJe6BpUA6flzjjFWsG3GFbPV8VnpHM2msRMc0	STAFF	2026-10-13 15:08:01.98	0	f	ACTIVE	\N	\N	\N	162b5e2a-b6fb-4450-b3c5-300218f87531	STAFF-BIO-001	\N	\N
01d26c24-1ad1-493f-8d76-ce92ed465f7a	Biology Staff 2	staff.bio2@cncs.aau.edu.et	$argon2id$v=19$m=65536,p=4,t=3$V8rEH5XhCzmp2huaVNNdlQ$kDp2wLbr/3OQ8OyXpYEhJmQzWDLYvX3Q+evGUfl9GiY	STAFF	2026-10-13 15:08:02.249	0	f	ACTIVE	\N	\N	\N	162b5e2a-b6fb-4450-b3c5-300218f87531	STAFF-BIO-002	\N	\N
3c956caa-993b-4730-8f75-e855cb9f0ee9	Chemistry Staff 1	staff.chem1@cncs.aau.edu.et	$argon2id$v=19$m=65536,p=4,t=3$xSvVr4kGx4yuK70tnv16Og$6Hq5gw35rCiFwPBgMI31N9rEMkl/hpBvAPM7yMYNGOw	STAFF	2026-10-13 15:08:02.591	0	f	ACTIVE	\N	\N	\N	3b0a46f9-c013-4e67-ab9c-4498836a561d	STAFF-CHEM-001	\N	\N
901f48e1-9abb-43ac-8d09-00eda3a91fd6	Demo Staff	staff@cncs.aau.edu.et	$argon2id$v=19$m=65536,p=4,t=3$AtHh5+ZWiQ0reS79nInhfQ$nLYKNA9Ye/X+eUkzws3c7IdntNOaiHq70lCRmIvyy8Q	STAFF	2026-09-22 05:07:32.283	0	f	ACTIVE	\N	\N	\N	\N	\N	\N	\N
0bba45be-d6ea-473e-b91e-fa15098dd9b7	Property Officer	officer@cncs.aau.edu.et	$argon2id$v=19$m=65536,p=4,t=3$507Pf2oiHt695YbB5o4dOw$1q3UZbpkGp8INPE8Z/tUBCmiOieptQsMWt+UMw4cEg0	PROPERTY_OFFICER	2026-10-13 10:32:48.298	0	f	ACTIVE	\N	\N	\N	\N	\N	\N	\N
4ee48cf7-3323-4da9-9965-aba8d65cfc94	Auditor Test	auditor@cncs.aau.edu.et	$argon2id$v=19$m=65536,p=4,t=3$M7xyaUXnqmkrhzKm52R5Ug$cYOu+SCpDr3CLf7bY0tZmxp0vRLkr4BS87yP8u+tibM	AUDITOR	2026-10-13 10:32:54.499	0	f	ACTIVE	\N	\N	\N	\N	\N	\N	\N
a318ac76-43a8-412b-a498-e7b80dffae51	Pending CS Staff	pending.cs@cncs.aau.edu.et	$argon2id$v=19$m=65536,p=4,t=3$HF9YxgAFSw2xDWZdAwe5HA$KHxefANnvS84a+OA8/2d4nCew+73rhu3MYE8Wq4UNgQ	STAFF	2026-10-13 15:08:02.911	0	f	PENDING_APPROVAL	\N	\N	\N	1b04c39b-76d2-4d99-b627-8b872f6f7a93	PENDING-CS-001	\N	\N
99f35b1c-eba5-418e-8bf9-0be61b579b09	Pending Bio Staff	pending.bio@cncs.aau.edu.et	$argon2id$v=19$m=65536,p=4,t=3$HhsA+UujlVqlywHSQdYoZA$hb4MjyF5ebEsXxJHRYSPAf/ebTXgAPWsAyitkyXes7I	STAFF	2026-10-13 15:08:03.238	0	f	PENDING_APPROVAL	\N	\N	\N	162b5e2a-b6fb-4450-b3c5-300218f87531	PENDING-BIO-001	\N	\N
981ade80-50b4-4cf9-a7c3-d9a1b15ff92d	Pending Phys Staff	pending.phys@cncs.aau.edu.et	$argon2id$v=19$m=65536,p=4,t=3$DHcgVtibV8ciHqZzROsWwA$pCOMn1akABplJbAXR6HAE3LvjAOFO55oh8ZOQpOBmc8	STAFF	2026-10-13 15:08:03.609	0	f	PENDING_APPROVAL	\N	\N	\N	a4a52092-f0a6-4f3a-8e2c-ba4186da782b	PENDING-PHYS-001	\N	\N
\.


--
-- Data for Name: _prisma_migrations; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public._prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count) FROM stdin;
df842351-15e1-44dc-b022-4b776906004a	075cc9cd849d7b2d2f9381ccf1da89c45450b7991165bf801489b196cbaa192f	2026-10-17 10:28:23.04789+00	20261017102500_delete_system_admin_item_notifications		\N	2026-10-17 10:28:23.04789+00	0
9360341c-3809-4102-8730-2a7fc9a22081	f7dadd62b1203352235f5eedde645fc0c78bb0efa0b2ba78339e76967950e4eb	2026-09-22 05:05:42.600412+00	20260901115514_init	\N	\N	2026-09-22 05:05:33.94192+00	1
dfadcdc6-4f29-4bbf-85d1-58dfd13d731a	0352448386864b8a05c7c3ca765ff4710ba6a96a3d22179ba49435a168cc40c1	2026-09-24 06:23:30.042822+00	20260924000000_add_token_version_and_password_reset	\N	\N	2026-09-24 06:23:27.790564+00	1
88d25847-125c-48de-91b0-a5de9177fd65	5f696d121da96b7100b287212dbd70d42ab6d52604d8b50f7805402101bb78fe	\N	20261012000000_phase_a_expand	A migration failed to apply. New migrations cannot be applied before the error is recovered from. Read more about how to resolve migration issues in a production database: https://pris.ly/d/migrate-resolve\n\nMigration name: 20261012000000_phase_a_expand\n\nDatabase error code: 23505\n\nDatabase error:\nERROR: could not create unique index "AuditItemResultRow_auditSessionId_itemId_key"\nDETAIL: Key ("auditSessionId", "itemId")=(855e0071-c4a0-48f3-9e7e-28b0f91bdf20, 49c3aabb-c76f-4234-9b32-ccc73489a894) is duplicated.\n\nDbError { severity: "ERROR", parsed_severity: Some(Error), code: SqlState(E23505), message: "could not create unique index \\"AuditItemResultRow_auditSessionId_itemId_key\\"", detail: Some("Key (\\"auditSessionId\\", \\"itemId\\")=(855e0071-c4a0-48f3-9e7e-28b0f91bdf20, 49c3aabb-c76f-4234-9b32-ccc73489a894) is duplicated."), hint: None, position: None, where_: None, schema: Some("public"), table: Some("AuditItemResultRow"), column: None, datatype: None, constraint: Some("AuditItemResultRow_auditSessionId_itemId_key"), file: Some("tuplesortvariants.c"), line: Some(1686), routine: Some("comparetup_index_btree_tiebreak") }\n\n   0: sql_schema_connector::apply_migration::apply_script\n           with migration_name="20261012000000_phase_a_expand"\n             at schema-engine/connectors/sql-schema-connector/src/apply_migration.rs:113\n   1: schema_commands::commands::apply_migrations::Applying migration\n           with migration_name="20261012000000_phase_a_expand"\n             at schema-engine/commands/src/commands/apply_migrations.rs:95\n   2: schema_core::state::ApplyMigrations\n             at schema-engine/core/src/state.rs:255	2026-10-12 04:43:35.838042+00	2026-10-12 04:42:53.039539+00	0
438420cd-5342-4462-9bfe-ca689ad7fdd0	12c4e689c431ef209c0d90421b003dab7a63a7c889eadd15b067fecad3c48419	2026-10-12 04:47:36.141139+00	20261012000000_phase_a_expand		\N	2026-10-12 04:47:36.141139+00	0
cca74b23-62df-4513-acd0-6b09eae77918	e0b53da99f3392a903cca545f9de4e1b14dffd0c049cfbe827318bfd2404bf50	2026-10-12 06:37:54.452177+00	20261012010000_role_five_role_enum	\N	\N	2026-10-12 06:37:49.742835+00	1
45806fbb-7f21-4078-bc86-f7ba6bf41500	9d4746b8b1cd0d9f228e39b49da8749f9f15d00bbca5482b1a6010770e56ac0f	2026-10-12 12:09:59.550581+00	20261012020000_backfill_holder_fields	\N	\N	2026-10-12 12:09:57.855246+00	1
fb631228-8150-4c89-8382-91b44071a667	06ec54c36ef4f55c3f6914c496d0c52316111ff5898931efee535a6c10805f41	2026-10-12 12:19:05.779675+00	20261012030000_account_approval_queue	\N	\N	2026-10-12 12:19:03.107222+00	1
21c64749-c6ca-4b38-8089-1c2aa639153e	1607cfab040b5377950416a84b61b733fb473a5cd342bbd5ba83036ebfa1951b	2026-10-15 09:17:14.627741+00	20261014000000_account_invite_fields	\N	\N	2026-10-15 09:17:10.737812+00	1
\.


--
-- Name: AccountRequest AccountRequest_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AccountRequest"
    ADD CONSTRAINT "AccountRequest_pkey" PRIMARY KEY (id);


--
-- Name: AdminActionLog AdminActionLog_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AdminActionLog"
    ADD CONSTRAINT "AdminActionLog_pkey" PRIMARY KEY (id);


--
-- Name: AuditItemResultRow AuditItemResultRow_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AuditItemResultRow"
    ADD CONSTRAINT "AuditItemResultRow_pkey" PRIMARY KEY (id);


--
-- Name: AuditSession AuditSession_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AuditSession"
    ADD CONSTRAINT "AuditSession_pkey" PRIMARY KEY (id);


--
-- Name: Building Building_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Building"
    ADD CONSTRAINT "Building_code_key" UNIQUE (code);


--
-- Name: Building Building_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Building"
    ADD CONSTRAINT "Building_name_key" UNIQUE (name);


--
-- Name: Building Building_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Building"
    ADD CONSTRAINT "Building_pkey" PRIMARY KEY (id);


--
-- Name: Category Category_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Category"
    ADD CONSTRAINT "Category_pkey" PRIMARY KEY (id);


--
-- Name: CustodyEvent CustodyEvent_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CustodyEvent"
    ADD CONSTRAINT "CustodyEvent_pkey" PRIMARY KEY (id);


--
-- Name: EmailToken EmailToken_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EmailToken"
    ADD CONSTRAINT "EmailToken_pkey" PRIMARY KEY (id);


--
-- Name: ItemEditLog ItemEditLog_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ItemEditLog"
    ADD CONSTRAINT "ItemEditLog_pkey" PRIMARY KEY (id);


--
-- Name: Item Item_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Item"
    ADD CONSTRAINT "Item_pkey" PRIMARY KEY (id);


--
-- Name: Notification Notification_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Notification"
    ADD CONSTRAINT "Notification_pkey" PRIMARY KEY (id);


--
-- Name: OrgUnit OrgUnit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."OrgUnit"
    ADD CONSTRAINT "OrgUnit_pkey" PRIMARY KEY (id);


--
-- Name: Request Request_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Request"
    ADD CONSTRAINT "Request_pkey" PRIMARY KEY (id);


--
-- Name: User User_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."User"
    ADD CONSTRAINT "User_pkey" PRIMARY KEY (id);


--
-- Name: _prisma_migrations _prisma_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public._prisma_migrations
    ADD CONSTRAINT _prisma_migrations_pkey PRIMARY KEY (id);


--
-- Name: AccountRequest_escalatedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AccountRequest_escalatedAt_idx" ON public."AccountRequest" USING btree ("escalatedAt");


--
-- Name: AccountRequest_requestedUnitId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AccountRequest_requestedUnitId_status_idx" ON public."AccountRequest" USING btree ("requestedUnitId", status);


--
-- Name: AccountRequest_userId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "AccountRequest_userId_key" ON public."AccountRequest" USING btree ("userId");


--
-- Name: AdminActionLog_actorId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AdminActionLog_actorId_createdAt_idx" ON public."AdminActionLog" USING btree ("actorId", "createdAt");


--
-- Name: AdminActionLog_targetUserId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AdminActionLog_targetUserId_idx" ON public."AdminActionLog" USING btree ("targetUserId");


--
-- Name: AuditItemResultRow_auditSessionId_itemId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "AuditItemResultRow_auditSessionId_itemId_key" ON public."AuditItemResultRow" USING btree ("auditSessionId", "itemId");


--
-- Name: AuditSession_reportNumber_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "AuditSession_reportNumber_key" ON public."AuditSession" USING btree ("reportNumber");


--
-- Name: Building_code_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Building_code_idx" ON public."Building" USING btree (code);


--
-- Name: Category_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Category_name_key" ON public."Category" USING btree (name);


--
-- Name: CustodyEvent_itemId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "CustodyEvent_itemId_createdAt_idx" ON public."CustodyEvent" USING btree ("itemId", "createdAt");


--
-- Name: EmailToken_expiresAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EmailToken_expiresAt_idx" ON public."EmailToken" USING btree ("expiresAt");


--
-- Name: EmailToken_userId_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EmailToken_userId_type_idx" ON public."EmailToken" USING btree ("userId", type);


--
-- Name: Item_holderType_holderId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Item_holderType_holderId_idx" ON public."Item" USING btree ("holderType", "holderId");


--
-- Name: Item_orgUnitId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Item_orgUnitId_idx" ON public."Item" USING btree ("orgUnitId");


--
-- Name: Item_pin_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Item_pin_key" ON public."Item" USING btree (pin);


--
-- Name: Item_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Item_status_idx" ON public."Item" USING btree (status);


--
-- Name: Item_tagId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Item_tagId_key" ON public."Item" USING btree ("tagId");


--
-- Name: OrgUnit_code_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "OrgUnit_code_key" ON public."OrgUnit" USING btree (code);


--
-- Name: OrgUnit_headId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "OrgUnit_headId_key" ON public."OrgUnit" USING btree ("headId");


--
-- Name: OrgUnit_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "OrgUnit_name_key" ON public."OrgUnit" USING btree (name);


--
-- Name: OrgUnit_parentId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "OrgUnit_parentId_idx" ON public."OrgUnit" USING btree ("parentId");


--
-- Name: OrgUnit_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "OrgUnit_type_idx" ON public."OrgUnit" USING btree (type);


--
-- Name: User_accountStatus_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "User_accountStatus_idx" ON public."User" USING btree ("accountStatus");


--
-- Name: User_email_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "User_email_key" ON public."User" USING btree (email);


--
-- Name: User_staffId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "User_staffId_key" ON public."User" USING btree ("staffId");


--
-- Name: AccountRequest AccountRequest_confirmedUnitId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AccountRequest"
    ADD CONSTRAINT "AccountRequest_confirmedUnitId_fkey" FOREIGN KEY ("confirmedUnitId") REFERENCES public."OrgUnit"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: AccountRequest AccountRequest_decidedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AccountRequest"
    ADD CONSTRAINT "AccountRequest_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: AccountRequest AccountRequest_escalatedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AccountRequest"
    ADD CONSTRAINT "AccountRequest_escalatedById_fkey" FOREIGN KEY ("escalatedById") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: AccountRequest AccountRequest_invitedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AccountRequest"
    ADD CONSTRAINT "AccountRequest_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: AccountRequest AccountRequest_requestedUnitId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AccountRequest"
    ADD CONSTRAINT "AccountRequest_requestedUnitId_fkey" FOREIGN KEY ("requestedUnitId") REFERENCES public."OrgUnit"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: AccountRequest AccountRequest_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AccountRequest"
    ADD CONSTRAINT "AccountRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: AdminActionLog AdminActionLog_actorId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AdminActionLog"
    ADD CONSTRAINT "AdminActionLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: AdminActionLog AdminActionLog_targetUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AdminActionLog"
    ADD CONSTRAINT "AdminActionLog_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: AdminActionLog AdminActionLog_unitId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AdminActionLog"
    ADD CONSTRAINT "AdminActionLog_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES public."OrgUnit"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: AuditItemResultRow AuditItemResultRow_auditSessionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AuditItemResultRow"
    ADD CONSTRAINT "AuditItemResultRow_auditSessionId_fkey" FOREIGN KEY ("auditSessionId") REFERENCES public."AuditSession"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: AuditItemResultRow AuditItemResultRow_itemId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AuditItemResultRow"
    ADD CONSTRAINT "AuditItemResultRow_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES public."Item"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: AuditSession AuditSession_runById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AuditSession"
    ADD CONSTRAINT "AuditSession_runById_fkey" FOREIGN KEY ("runById") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: CustodyEvent CustodyEvent_actingUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CustodyEvent"
    ADD CONSTRAINT "CustodyEvent_actingUserId_fkey" FOREIGN KEY ("actingUserId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: CustodyEvent CustodyEvent_itemId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CustodyEvent"
    ADD CONSTRAINT "CustodyEvent_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES public."Item"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: EmailToken EmailToken_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EmailToken"
    ADD CONSTRAINT "EmailToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: ItemEditLog ItemEditLog_editedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ItemEditLog"
    ADD CONSTRAINT "ItemEditLog_editedById_fkey" FOREIGN KEY ("editedById") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: ItemEditLog ItemEditLog_itemId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ItemEditLog"
    ADD CONSTRAINT "ItemEditLog_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES public."Item"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Item Item_buildingId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Item"
    ADD CONSTRAINT "Item_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES public."Building"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Item Item_categoryId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Item"
    ADD CONSTRAINT "Item_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES public."Category"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Item Item_lastVerifiedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Item"
    ADD CONSTRAINT "Item_lastVerifiedById_fkey" FOREIGN KEY ("lastVerifiedById") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Item Item_orgUnitId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Item"
    ADD CONSTRAINT "Item_orgUnitId_fkey" FOREIGN KEY ("orgUnitId") REFERENCES public."OrgUnit"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Item Item_ownerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Item"
    ADD CONSTRAINT "Item_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Item Item_parentItemId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Item"
    ADD CONSTRAINT "Item_parentItemId_fkey" FOREIGN KEY ("parentItemId") REFERENCES public."Item"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Item Item_voidedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Item"
    ADD CONSTRAINT "Item_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Notification Notification_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Notification"
    ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: OrgUnit OrgUnit_headId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."OrgUnit"
    ADD CONSTRAINT "OrgUnit_headId_fkey" FOREIGN KEY ("headId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: OrgUnit OrgUnit_parentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."OrgUnit"
    ADD CONSTRAINT "OrgUnit_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES public."OrgUnit"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Request Request_itemId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Request"
    ADD CONSTRAINT "Request_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES public."Item"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Request Request_loanReturnedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Request"
    ADD CONSTRAINT "Request_loanReturnedById_fkey" FOREIGN KEY ("loanReturnedById") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Request Request_requestedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Request"
    ADD CONSTRAINT "Request_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Request Request_reviewedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Request"
    ADD CONSTRAINT "Request_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Request Request_stage1ApprovedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Request"
    ADD CONSTRAINT "Request_stage1ApprovedById_fkey" FOREIGN KEY ("stage1ApprovedById") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Request Request_stage2ApprovedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Request"
    ADD CONSTRAINT "Request_stage2ApprovedById_fkey" FOREIGN KEY ("stage2ApprovedById") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Request Request_withdrawnById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Request"
    ADD CONSTRAINT "Request_withdrawnById_fkey" FOREIGN KEY ("withdrawnById") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: User User_escalatedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."User"
    ADD CONSTRAINT "User_escalatedById_fkey" FOREIGN KEY ("escalatedById") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: User User_orgUnitId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."User"
    ADD CONSTRAINT "User_orgUnitId_fkey" FOREIGN KEY ("orgUnitId") REFERENCES public."OrgUnit"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: User User_reviewedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."User"
    ADD CONSTRAINT "User_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- PostgreSQL database dump complete
--

\unrestrict PnM2K2ctyJg6vb0PKdSyIAtLBXbvKpV5a0HExtq0B5teZAHgtFrjumf4nmxTNaa


import { PrismaClient, type ModuleName, type UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// NOTE ON LEGAL ACCURACY: the Reg 17 sub-paragraph text below is
// representative of the Health and Social Care Act 2008 (Regulated
// Activities) Regulations 2014, Regulation 17 ("Good governance"), for
// seed/demo purposes. Verify wording against current CQC guidance before
// relying on it in a production compliance context.
const REG_17_SUB_CLAUSES = [
  { subParagraph: "17(1)", description: "Systems or processes must be established and operated effectively to ensure compliance with the requirements of this Part." },
  { subParagraph: "17(2)(a)", description: "Assess, monitor and improve the quality and safety of the services provided." },
  { subParagraph: "17(2)(b)", description: "Assess, monitor and mitigate the risks relating to the health, safety and welfare of service users." },
  { subParagraph: "17(2)(c)", description: "Maintain securely an accurate, complete and contemporaneous record in respect of each service user." },
  { subParagraph: "17(2)(d)", description: "Maintain securely such other records as are necessary to be kept in relation to persons employed and the management of the regulated activity." },
  { subParagraph: "17(2)(e)", description: "Seek and act on feedback from relevant persons and staff on the services provided." },
  { subParagraph: "17(2)(f)", description: "Evaluate and improve practice, including through the training and support of staff." },
  { subParagraph: "17(3)", description: "Records referred to in this regulation must be kept securely for an appropriate period and be kept in accordance with the Data Protection Act 2018." },
];

const CQC_KEY_QUESTIONS: { name: "SAFE" | "EFFECTIVE" | "CARING" | "RESPONSIVE" | "WELL_LED"; description: string }[] = [
  { name: "SAFE", description: "Are people protected from abuse and avoidable harm?" },
  { name: "EFFECTIVE", description: "Does care, treatment and support achieve good outcomes, promote a good quality of life and is it evidence-based?" },
  { name: "CARING", description: "Do staff involve and treat people with compassion, kindness, dignity and respect?" },
  { name: "RESPONSIVE", description: "Are services organised so that they meet people's needs?" },
  { name: "WELL_LED", description: "Does the leadership, management and governance assure the delivery of high-quality, person-centred care?" },
];

const SIX_PILLARS: { name: "QUALITY_SAFETY_OVERSIGHT" | "RISK_MANAGEMENT" | "INCIDENT_SAFETY_EVENT_MANAGEMENT" | "RECORDS_INFO_GOVERNANCE" | "WORKFORCE_GOVERNANCE" | "FEEDBACK_COMPLAINTS_LEARNING"; description: string }[] = [
  { name: "QUALITY_SAFETY_OVERSIGHT", description: "Quality & Safety Oversight" },
  { name: "RISK_MANAGEMENT", description: "Risk Management" },
  { name: "INCIDENT_SAFETY_EVENT_MANAGEMENT", description: "Incident & Safety Event Management" },
  { name: "RECORDS_INFO_GOVERNANCE", description: "Records & Info Governance" },
  { name: "WORKFORCE_GOVERNANCE", description: "Workforce Governance" },
  { name: "FEEDBACK_COMPLAINTS_LEARNING", description: "Feedback, Complaints & Learning" },
];

const ALL_MODULES: ModuleName[] = [
  "DASHBOARD", "AUDITS", "INCIDENTS", "EVENTS", "RISK_REGISTER", "POLICIES",
  "FEEDBACK_COMPLAINTS", "NOTICES", "TRAINING", "CALENDAR", "EVIDENCE_PACKS",
  "QG_HUB", "READINESS_SCORER", "ADMIN_USERS", "ADMIN_SITES", "ADMIN_BILLING",
  "ADMIN_DATA_PROTECTION", "BNCL_SUPER_ADMIN",
];

// Modules a Staff (frontline) user may create/edit records in directly.
const STAFF_EDIT_MODULES: ModuleName[] = ["INCIDENTS", "EVENTS", "FEEDBACK_COMPLAINTS", "TRAINING"];
// Modules requiring sign-off, gated behind "approve" for managers/owners.
const APPROVABLE_MODULES: ModuleName[] = ["AUDITS", "INCIDENTS", "RISK_REGISTER", "POLICIES"];

function permissionsFor(role: UserRole, module: ModuleName) {
  if (role === "BNCL_ADMIN") {
    // BNCL Admin operates through the separate, unscoped super-admin
    // module (src/server/bncl-admin) — it does not need RBAC'd access to
    // any client org's governance modules.
    const isBnclModule = module === "BNCL_SUPER_ADMIN" || module === "QG_HUB";
    return { canView: isBnclModule, canEdit: isBnclModule, canApprove: isBnclModule };
  }

  if (module === "BNCL_SUPER_ADMIN") {
    return { canView: false, canEdit: false, canApprove: false };
  }

  if (role === "OWNER") {
    return { canView: true, canEdit: true, canApprove: true };
  }

  if (role === "REGISTERED_MANAGER") {
    return {
      canView: true,
      canEdit: true,
      canApprove: APPROVABLE_MODULES.includes(module),
    };
  }

  // STAFF
  const canEdit = STAFF_EDIT_MODULES.includes(module);
  const isAdminModule = module.startsWith("ADMIN_");
  return {
    canView: !isAdminModule,
    canEdit,
    canApprove: false,
  };
}

async function seedTaxonomy() {
  for (const clause of REG_17_SUB_CLAUSES) {
    await prisma.regulatorySubClause.upsert({
      where: { regulation_subParagraph: { regulation: "Reg 17", subParagraph: clause.subParagraph } },
      update: { description: clause.description },
      create: { regulation: "Reg 17", subParagraph: clause.subParagraph, description: clause.description },
    });
  }

  for (const q of CQC_KEY_QUESTIONS) {
    await prisma.cQCKeyQuestion.upsert({
      where: { name: q.name },
      update: { description: q.description },
      create: q,
    });
  }

  for (const p of SIX_PILLARS) {
    await prisma.sixPillar.upsert({
      where: { name: p.name },
      update: { description: p.description },
      create: p,
    });
  }
}

async function seedRolePermissions() {
  const roles: UserRole[] = ["OWNER", "REGISTERED_MANAGER", "STAFF", "BNCL_ADMIN"];
  for (const role of roles) {
    for (const module of ALL_MODULES) {
      const perm = permissionsFor(role, module);
      await prisma.rolePermission.upsert({
        where: { role_module: { role, module } },
        update: perm,
        create: { role, module, ...perm },
      });
    }
  }
}

async function hash(password: string) {
  return bcrypt.hash(password, 10);
}

async function seedInternalOrg() {
  const internalOrg = await prisma.organisation.upsert({
    where: { id: "bncl-internal-org" },
    update: {},
    create: {
      id: "bncl-internal-org",
      name: "BNCL Solutions (Internal)",
      subscriptionTier: "PAID",
      billingStatus: "ACTIVE",
      isInternal: true,
    },
  });

  await prisma.user.upsert({
    where: { email: "admin@bncl-solutions.example" },
    update: {},
    create: {
      orgId: internalOrg.id,
      name: "BNCL Platform Admin",
      email: "admin@bncl-solutions.example",
      passwordHash: await hash("BnclAdmin1234!"),
      role: "BNCL_ADMIN",
      status: "ACTIVE",
    },
  });

  return internalOrg;
}

async function seedDemoOrg(opts: {
  id: string;
  name: string;
  siteName: string;
  emailDomain: string;
}) {
  const org = await prisma.organisation.upsert({
    where: { id: opts.id },
    update: {},
    create: {
      id: opts.id,
      name: opts.name,
      subscriptionTier: "PAID",
      billingStatus: "ACTIVE",
    },
  });

  const site = await prisma.site.upsert({
    where: { id: `${opts.id}-site-1` },
    update: {},
    create: {
      id: `${opts.id}-site-1`,
      orgId: org.id,
      name: opts.siteName,
      address: "1 Example Street, London",
      registeredActivities: ["Treatment of disease, disorder or injury"],
    },
  });

  const owner = await prisma.user.upsert({
    where: { email: `owner@${opts.emailDomain}` },
    update: {},
    create: {
      orgId: org.id,
      name: `${opts.name} Owner`,
      email: `owner@${opts.emailDomain}`,
      passwordHash: await hash("DemoOwner1234!"),
      role: "OWNER",
      status: "ACTIVE",
    },
  });

  const manager = await prisma.user.upsert({
    where: { email: `manager@${opts.emailDomain}` },
    update: {},
    create: {
      orgId: org.id,
      name: `${opts.name} Registered Manager`,
      email: `manager@${opts.emailDomain}`,
      passwordHash: await hash("DemoManager1234!"),
      role: "REGISTERED_MANAGER",
      status: "ACTIVE",
    },
  });

  const staff = await prisma.user.upsert({
    where: { email: `staff@${opts.emailDomain}` },
    update: {},
    create: {
      orgId: org.id,
      name: `${opts.name} Staff Member`,
      email: `staff@${opts.emailDomain}`,
      passwordHash: await hash("DemoStaff1234!"),
      role: "STAFF",
      status: "ACTIVE",
    },
  });

  for (const user of [owner, manager, staff]) {
    await prisma.userSite.upsert({
      where: { userId_siteId: { userId: user.id, siteId: site.id } },
      update: {},
      create: { userId: user.id, siteId: site.id },
    });
  }

  const audit = await prisma.audit.upsert({
    where: { id: `${opts.id}-audit-1` },
    update: {},
    create: {
      id: `${opts.id}-audit-1`,
      orgId: org.id,
      siteId: site.id,
      type: "Infection Control Audit",
      scheduledDate: new Date(),
      status: "SCHEDULED",
    },
  });

  const incident = await prisma.incident.upsert({
    where: { id: `${opts.id}-incident-1` },
    update: {},
    create: {
      id: `${opts.id}-incident-1`,
      orgId: org.id,
      siteId: site.id,
      reportedById: staff.id,
      dateTime: new Date(),
      description: "Sample incident record for seed/demo purposes.",
      anonymisationAcknowledged: true,
      severityGrading: "LOW",
      psirfClassification: "Learning response",
      notifiableToCQC: false,
      status: "OPEN",
    },
  });

  // Realistic RiskEntry/Policy fixtures per demo org — required by
  // BUILD_CHECKLIST.md Phase 4's gate ("seed data now includes realistic
  // ... RiskEntries/Policies for both demo orgs") and is what gives the
  // cross-tenant isolation suite real per-org data to fail against for
  // these two models specifically.
  const riskEntry = await prisma.riskEntry.upsert({
    where: { id: `${opts.id}-risk-1` },
    update: {},
    create: {
      id: `${opts.id}-risk-1`,
      orgId: org.id,
      siteId: site.id,
      title: "Unlabelled sharps bin nearing capacity",
      description:
        "Sharps bin in Treatment Room 2 observed at ~80% fill without a replacement on order.",
      likelihood: 3,
      impact: 4,
      riskRating: 3 * 4,
      ownerId: manager.id,
      mitigationActions: [
        {
          description: "Order replacement sharps bin and schedule swap.",
          ownerId: staff.id,
          dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          status: "OPEN",
          completedDate: null,
        },
      ],
      reviewDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      status: "OPEN",
      versionNumber: 1,
      isCurrentVersion: true,
    },
  });

  const policy = await prisma.policy.upsert({
    where: { id: `${opts.id}-policy-1` },
    update: {},
    create: {
      id: `${opts.id}-policy-1`,
      orgId: org.id,
      siteId: site.id,
      title: "Infection Prevention & Control Policy",
      reviewDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
      status: "ACTIVE",
      versionNumber: 1,
      isCurrentVersion: true,
    },
  });

  return { org, site, owner, manager, staff, audit, incident, riskEntry, policy };
}

async function main() {
  await seedTaxonomy();
  await seedRolePermissions();
  await seedInternalOrg();

  // Two demo orgs are required (not optional) — they are the fixture the
  // cross-tenant isolation test suite runs against. See
  // tests/tenant-isolation.test.ts and BUILD_CHECKLIST.md Phase 1.
  const orgA = await seedDemoOrg({
    id: "demo-org-a",
    name: "Greenfield Aesthetic Clinic",
    siteName: "Greenfield Clinic — Main Site",
    emailDomain: "greenfield-demo.example",
  });

  const orgB = await seedDemoOrg({
    id: "demo-org-b",
    name: "Riverside Dental Practice",
    siteName: "Riverside Dental — Main Site",
    emailDomain: "riverside-demo.example",
  });

  console.log("Seed complete:");
  console.log(`  Org A: ${orgA.org.name} (${orgA.org.id})`);
  console.log(`  Org B: ${orgB.org.name} (${orgB.org.id})`);
  console.log("  BNCL internal admin: admin@bncl-solutions.example / BnclAdmin1234!");
  console.log(`  Org A owner: owner@greenfield-demo.example / DemoOwner1234!`);
  console.log(`  Org B owner: owner@riverside-demo.example / DemoOwner1234!`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { rawPrisma } from "@/server/db/prisma";
import { scopedDb } from "@/server/db/scoped-client";
import type { SessionUser } from "@/server/auth/session";

import { createFeedback } from "@/server/modules/feedback";
import { createEvent } from "@/server/modules/events";
import {
  createTrainingRecord,
  deriveTrainingStatus,
  EXPIRING_SOON_WINDOW_DAYS,
} from "@/server/modules/training";
import {
  acknowledgeNotice,
  createNotice,
  getVisibleNotice,
  listVisibleNotices,
} from "@/server/modules/notices";
import { createManualCalendarTask } from "@/server/modules/calendar";

// This suite runs against a real, migrated, seeded Postgres database
// (bncl_test_phase5 — see BUILD_CHECKLIST.md Phase 5). It extends the
// Phase 1 cross-tenant isolation suite (tests/tenant-isolation.test.ts,
// left untouched) to cover the six Phase 5 models: FeedbackComplaint,
// Event, TrainingRecord, Notice, CalendarTask, Notification. It also
// proves three Phase 5-specific behavioural requirements from
// BUILD_CHECKLIST.md: (b) SPECIFIC_SITE notice site-level visibility
// within the SAME org, (c) TrainingRecord status derivation + idempotent
// CalendarTask creation, (d) acknowledgementRequired notices producing
// distinct Notification rows.

const ORG_A = "demo-org-a";
const ORG_B = "demo-org-b";

let orgASite1Id: string;
let orgASite2Id: string;
let orgAOwner: SessionUser;
let orgAStaffSite1: SessionUser;
let orgAStaffSite2: SessionUser;

let orgBSite1Id: string;
let orgBOwner: SessionUser;

beforeAll(async () => {
  const orgASite1 = await rawPrisma.site.findFirstOrThrow({ where: { orgId: ORG_A } });
  orgASite1Id = orgASite1.id;

  const ownerARow = await rawPrisma.user.findFirstOrThrow({ where: { orgId: ORG_A, role: "OWNER" } });
  orgAOwner = { id: ownerARow.id, orgId: ORG_A, role: "OWNER", email: ownerARow.email };

  const staffARow = await rawPrisma.user.findFirstOrThrow({ where: { orgId: ORG_A, role: "STAFF" } });
  orgAStaffSite1 = { id: staffARow.id, orgId: ORG_A, role: "STAFF", email: staffARow.email };

  // Fixture for test (b): a SECOND site within Org A (the same org as
  // orgASite1), plus a staff user assigned ONLY to that second site. This
  // is the exact scenario BUILD_CHECKLIST.md calls out as the real risk:
  // same-org, different-site visibility, not just cross-org.
  const site2 = await rawPrisma.site.upsert({
    where: { id: "demo-org-a-site-2-phase5-fixture" },
    update: {},
    create: {
      id: "demo-org-a-site-2-phase5-fixture",
      orgId: ORG_A,
      name: "Greenfield Clinic — Satellite Site (test fixture)",
      address: "2 Example Street, London",
      registeredActivities: [],
    },
  });
  orgASite2Id = site2.id;

  const staffSite2Row = await rawPrisma.user.upsert({
    where: { email: "staff-site2-phase5-fixture@greenfield-demo.example" },
    update: {},
    create: {
      orgId: ORG_A,
      name: "Greenfield Satellite Staff (test fixture)",
      email: "staff-site2-phase5-fixture@greenfield-demo.example",
      passwordHash: "not-used-in-tests",
      role: "STAFF",
      status: "ACTIVE",
    },
  });
  await rawPrisma.userSite.upsert({
    where: { userId_siteId: { userId: staffSite2Row.id, siteId: site2.id } },
    update: {},
    create: { userId: staffSite2Row.id, siteId: site2.id },
  });
  orgAStaffSite2 = { id: staffSite2Row.id, orgId: ORG_A, role: "STAFF", email: staffSite2Row.email };

  const orgBSite1 = await rawPrisma.site.findFirstOrThrow({ where: { orgId: ORG_B } });
  orgBSite1Id = orgBSite1.id;
  const ownerBRow = await rawPrisma.user.findFirstOrThrow({ where: { orgId: ORG_B, role: "OWNER" } });
  orgBOwner = { id: ownerBRow.id, orgId: ORG_B, role: "OWNER", email: ownerBRow.email };
});

afterAll(async () => {
  await rawPrisma.$disconnect();
});

describe("(a) Phase 5 cross-tenant isolation: Org A cannot read/edit/delete Org B's data", () => {
  it("FeedbackComplaint", async () => {
    const orgBRow = await createFeedback(orgBOwner, {
      siteId: orgBSite1Id,
      source: "PATIENT",
      category: "Cleanliness",
      description: "Org B's private complaint",
    });

    expect(await scopedDb(ORG_A).feedbackComplaint.findUnique({ where: { id: orgBRow.id } })).toBeNull();
    await expect(
      scopedDb(ORG_A).feedbackComplaint.update({ where: { id: orgBRow.id }, data: { category: "HACKED" } })
    ).rejects.toThrow();
    await expect(
      scopedDb(ORG_A).feedbackComplaint.delete({ where: { id: orgBRow.id } })
    ).rejects.toThrow();
    const stillIntact = await rawPrisma.feedbackComplaint.findUniqueOrThrow({ where: { id: orgBRow.id } });
    expect(stillIntact.category).toBe("Cleanliness");
  });

  it("Event", async () => {
    const orgBRow = await createEvent(orgBOwner, {
      siteId: orgBSite1Id,
      eventType: "Inspection visit",
      title: "Org B's private event",
      description: "Should never be visible to Org A",
      dateTime: new Date(),
    });

    expect(await scopedDb(ORG_A).event.findUnique({ where: { id: orgBRow.id } })).toBeNull();
    await expect(
      scopedDb(ORG_A).event.update({ where: { id: orgBRow.id }, data: { title: "HACKED" } })
    ).rejects.toThrow();
    await expect(scopedDb(ORG_A).event.delete({ where: { id: orgBRow.id } })).rejects.toThrow();
    const stillIntact = await rawPrisma.event.findUniqueOrThrow({ where: { id: orgBRow.id } });
    expect(stillIntact.title).toBe("Org B's private event");
  });

  it("TrainingRecord", async () => {
    const orgBRow = await createTrainingRecord(orgBOwner, {
      siteId: orgBSite1Id,
      userId: orgBOwner.id,
      courseName: "Org B's private training record",
      completionDate: new Date(),
    });

    expect(await scopedDb(ORG_A).trainingRecord.findUnique({ where: { id: orgBRow.id } })).toBeNull();
    await expect(
      scopedDb(ORG_A).trainingRecord.update({ where: { id: orgBRow.id }, data: { courseName: "HACKED" } })
    ).rejects.toThrow();
    await expect(
      scopedDb(ORG_A).trainingRecord.delete({ where: { id: orgBRow.id } })
    ).rejects.toThrow();
    const stillIntact = await rawPrisma.trainingRecord.findUniqueOrThrow({ where: { id: orgBRow.id } });
    expect(stillIntact.courseName).toBe("Org B's private training record");
  });

  it("Notice", async () => {
    const orgBRow = await createNotice(orgBOwner, {
      title: "Org B's private notice",
      body: "Should never be visible to Org A",
      noticeType: "INTERNAL_ANNOUNCEMENT",
      audience: "ALL_STAFF",
    });

    expect(await scopedDb(ORG_A).notice.findUnique({ where: { id: orgBRow.id } })).toBeNull();
    // getVisibleNotice additionally enforces the audience/site visibility
    // rule on top of the org scope — an Org A session must get null too.
    expect(await getVisibleNotice(orgAOwner, orgBRow.id)).toBeNull();
    await expect(
      scopedDb(ORG_A).notice.update({ where: { id: orgBRow.id }, data: { title: "HACKED" } })
    ).rejects.toThrow();
    await expect(scopedDb(ORG_A).notice.delete({ where: { id: orgBRow.id } })).rejects.toThrow();
    const stillIntact = await rawPrisma.notice.findUniqueOrThrow({ where: { id: orgBRow.id } });
    expect(stillIntact.title).toBe("Org B's private notice");
  });

  it("CalendarTask", async () => {
    const orgBRow = await createManualCalendarTask(orgBOwner, {
      siteId: orgBSite1Id,
      title: "Org B's private calendar task",
      dueDate: new Date(),
    });

    expect(await scopedDb(ORG_A).calendarTask.findUnique({ where: { id: orgBRow.id } })).toBeNull();
    await expect(
      scopedDb(ORG_A).calendarTask.update({ where: { id: orgBRow.id }, data: { title: "HACKED" } })
    ).rejects.toThrow();
    await expect(
      scopedDb(ORG_A).calendarTask.delete({ where: { id: orgBRow.id } })
    ).rejects.toThrow();
    const stillIntact = await rawPrisma.calendarTask.findUniqueOrThrow({ where: { id: orgBRow.id } });
    expect(stillIntact.title).toBe("Org B's private calendar task");
  });

  it("Notification", async () => {
    const orgBRow = await rawPrisma.notification.create({
      data: { orgId: ORG_B, userId: orgBOwner.id, type: "TRAINING_EXPIRING_SOON" },
    });

    expect(await scopedDb(ORG_A).notification.findUnique({ where: { id: orgBRow.id } })).toBeNull();
    await expect(
      scopedDb(ORG_A).notification.update({ where: { id: orgBRow.id }, data: { readStatus: true } })
    ).rejects.toThrow();
    await expect(
      scopedDb(ORG_A).notification.delete({ where: { id: orgBRow.id } })
    ).rejects.toThrow();
    const stillIntact = await rawPrisma.notification.findUniqueOrThrow({ where: { id: orgBRow.id } });
    expect(stillIntact.readStatus).toBe(false);
  });
});

describe("(b) SPECIFIC_SITE notice is invisible to a user at a different site of the SAME org", () => {
  it("a Site-1-targeted notice is visible to a Site-1 user but not to a Site-2 user, both in Org A", async () => {
    const notice = await createNotice(orgAOwner, {
      title: "Site 1 only: fire safety walk-round",
      body: "Site-1-specific notice — must not leak to Site 2.",
      noticeType: "INTERNAL_ANNOUNCEMENT",
      audience: "SPECIFIC_SITE",
      siteId: orgASite1Id,
    });

    // Positive control: the Site-1 staff member (same org, correct site) DOES see it.
    const visibleToSite1 = await listVisibleNotices(orgAStaffSite1);
    expect(visibleToSite1.some((n) => n.id === notice.id)).toBe(true);
    expect(await getVisibleNotice(orgAStaffSite1, notice.id)).not.toBeNull();

    // The actual assertion: the Site-2 staff member, same org, must NOT see it —
    // neither in the list (query-level filter) nor via direct id lookup.
    const visibleToSite2 = await listVisibleNotices(orgAStaffSite2);
    expect(visibleToSite2.some((n) => n.id === notice.id)).toBe(false);
    expect(await getVisibleNotice(orgAStaffSite2, notice.id)).toBeNull();

    // And they can't route around the visibility check by acknowledging directly.
    await expect(acknowledgeNotice(orgAStaffSite2, notice.id)).rejects.toThrow();
  });
});

describe("(c) TrainingRecord status derivation and idempotent CalendarTask creation", () => {
  it("deriveTrainingStatus: VALID / EXPIRING_SOON / EXPIRED boundaries", () => {
    const now = new Date("2026-07-14T12:00:00Z");
    expect(deriveTrainingStatus(null, now)).toBe("VALID");
    expect(deriveTrainingStatus(new Date("2027-07-14T12:00:00Z"), now)).toBe("VALID"); // far future
    expect(
      deriveTrainingStatus(
        new Date(now.getTime() + (EXPIRING_SOON_WINDOW_DAYS - 1) * 24 * 60 * 60 * 1000),
        now
      )
    ).toBe("EXPIRING_SOON");
    expect(deriveTrainingStatus(new Date(now.getTime() - 24 * 60 * 60 * 1000), now)).toBe("EXPIRED");
  });

  it("a record within the expiring-soon window produces exactly one CalendarTask, and re-deriving status doesn't duplicate it", async () => {
    const expiringSoonDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000); // 5 days out
    const record = await createTrainingRecord(orgAOwner, {
      siteId: orgASite1Id,
      userId: orgAStaffSite1.id,
      courseName: "Manual handling refresher (phase5 test)",
      completionDate: new Date(Date.now() - 340 * 24 * 60 * 60 * 1000),
      expiryDate: expiringSoonDate,
    });

    expect(record.status).toBe("EXPIRING_SOON");

    const tasksAfterCreate = await rawPrisma.calendarTask.findMany({
      where: { linkedModule: "TRAINING", linkedEntityId: record.id },
    });
    expect(tasksAfterCreate).toHaveLength(1);
    expect(tasksAfterCreate[0].dueDate.getTime()).toBe(expiringSoonDate.getTime());

    // Re-run the live status-derivation pass (what listTrainingRecords does
    // on every read) several times — must stay at exactly one CalendarTask.
    const { listTrainingRecords } = await import("@/server/modules/training");
    await listTrainingRecords(orgAOwner);
    await listTrainingRecords(orgAOwner);

    const tasksAfterReDerive = await rawPrisma.calendarTask.findMany({
      where: { linkedModule: "TRAINING", linkedEntityId: record.id },
    });
    expect(tasksAfterReDerive).toHaveLength(1);
    expect(tasksAfterReDerive[0].id).toBe(tasksAfterCreate[0].id);
  });

  it("an already-expired record is created with EXPIRED status and also produces exactly one CalendarTask", async () => {
    const pastDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000); // 10 days ago
    const record = await createTrainingRecord(orgAOwner, {
      siteId: orgASite1Id,
      userId: orgAStaffSite1.id,
      courseName: "Fire safety certificate (phase5 test, expired)",
      completionDate: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000),
      expiryDate: pastDate,
    });

    expect(record.status).toBe("EXPIRED");
    const tasks = await rawPrisma.calendarTask.findMany({
      where: { linkedModule: "TRAINING", linkedEntityId: record.id },
    });
    expect(tasks).toHaveLength(1);
  });
});

describe("(d) acknowledgementRequired notices produce distinct Notification rows", () => {
  it("posting an ALL_STAFF notice with acknowledgementRequired:true notifies every active user except the poster, as separate rows", async () => {
    const activeOrgAUserIds = (
      await rawPrisma.user.findMany({ where: { orgId: ORG_A, status: "ACTIVE", deletedAt: null } })
    ).map((u) => u.id);
    expect(activeOrgAUserIds.length).toBeGreaterThan(1);

    const notice = await createNotice(orgAOwner, {
      title: "New infection control policy — please acknowledge",
      body: "Distinct-Notification-rows test fixture.",
      noticeType: "POLICY_CHANGE_ALERT",
      audience: "ALL_STAFF",
      acknowledgementRequired: true,
    });

    const notifications = await rawPrisma.notification.findMany({
      where: { orgId: ORG_A, type: "NOTICE_ACKNOWLEDGEMENT_REQUIRED", relatedEntityId: notice.id },
    });

    const expectedRecipientIds = activeOrgAUserIds.filter((id) => id !== orgAOwner.id);
    expect(notifications).toHaveLength(expectedRecipientIds.length);

    // Distinct: one row per targeted user, no duplicates, poster excluded,
    // and never a row on the Notice model itself (Notifications and
    // Notices are separate models — see src/server/modules/notifications.ts).
    const notifiedUserIds = notifications.map((n) => n.userId).sort();
    expect(notifiedUserIds).toEqual([...expectedRecipientIds].sort());
    expect(new Set(notifiedUserIds).size).toBe(notifiedUserIds.length);
    expect(notifications.every((n) => n.relatedEntityType === "NOTICE")).toBe(true);
    expect(notifications.some((n) => n.userId === orgAOwner.id)).toBe(false);
  });

  it("a notice WITHOUT acknowledgementRequired produces zero Notification rows", async () => {
    const notice = await createNotice(orgAOwner, {
      title: "FYI only — no acknowledgement needed",
      body: "Distinct-Notification-rows negative-control fixture.",
      noticeType: "INTERNAL_ANNOUNCEMENT",
      audience: "ALL_STAFF",
      acknowledgementRequired: false,
    });

    const notifications = await rawPrisma.notification.findMany({
      where: { orgId: ORG_A, relatedEntityId: notice.id },
    });
    expect(notifications).toHaveLength(0);
  });
});

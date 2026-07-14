import { z } from "zod";
import type { NoticeAudience, NoticeType } from "@prisma/client";

import { scopedDb, type ScopedDb } from "@/server/db/scoped-client";
import { requireModulePermission } from "@/server/rbac/permissions";
import type { SessionUser } from "@/server/auth/session";
import { writeAuditLog } from "@/server/modules/audit-log";
import { createNotification } from "@/server/modules/notifications";
import { listUserSiteIds } from "@/server/org/directory";

export const createNoticeSchema = z
  .object({
    title: z.string().min(1).max(300),
    body: z.string().min(1).max(10000),
    noticeType: z.enum(["INTERNAL_ANNOUNCEMENT", "REGULATORY_UPDATE", "POLICY_CHANGE_ALERT"]),
    audience: z.enum(["ALL_STAFF", "MANAGERS_ONLY", "SPECIFIC_SITE"]),
    siteId: z.string().min(1).optional(),
    acknowledgementRequired: z.boolean().optional(),
  })
  .refine((v) => v.audience !== "SPECIFIC_SITE" || !!v.siteId, {
    message: "siteId is required when audience is SPECIFIC_SITE",
    path: ["siteId"],
  });
export type CreateNoticeInput = z.infer<typeof createNoticeSchema>;

const MANAGER_ROLES = new Set(["OWNER", "REGISTERED_MANAGER"]);

/**
 * Whether `notice` is visible to a user with `role` who is assigned to
 * `userSiteIds`. Pure function so the visibility rule is testable in
 * isolation and reused identically by list + detail + acknowledge.
 *
 * SPECIFIC_SITE is the real cross-tenant/cross-site risk called out in
 * BUILD_CHECKLIST.md: a notice scoped to Site 1 must be genuinely invisible
 * to a user at Site 2 of the SAME org, not just orgs differing.
 */
export function isNoticeVisibleTo(
  notice: { audience: NoticeAudience; siteId: string | null },
  role: SessionUser["role"],
  userSiteIds: string[]
): boolean {
  if (notice.audience === "ALL_STAFF") return true;
  if (notice.audience === "MANAGERS_ONLY") return MANAGER_ROLES.has(role);
  // SPECIFIC_SITE
  return notice.siteId !== null && userSiteIds.includes(notice.siteId);
}

export async function requireNoticesViewSession(): Promise<SessionUser> {
  return requireModulePermission("NOTICES", "view");
}

/** List notices visible to the calling session, filtered at the DB level
 * (not just in application code) so an invisible SPECIFIC_SITE notice for
 * another site never leaves the database in the response. */
export async function listVisibleNotices(session: SessionUser) {
  const db = scopedDb(session.orgId);
  const userSiteIds = await listUserSiteIds(db, session.id);
  const isManager = MANAGER_ROLES.has(session.role);

  return db.notice.findMany({
    where: {
      deletedAt: null,
      OR: [
        { audience: "ALL_STAFF" },
        ...(isManager ? [{ audience: "MANAGERS_ONLY" as NoticeAudience }] : []),
        {
          audience: "SPECIFIC_SITE" as NoticeAudience,
          siteId: { in: userSiteIds.length > 0 ? userSiteIds : ["__no_site__"] },
        },
      ],
    },
    orderBy: { postedDate: "desc" },
    include: {
      postedBy: { select: { name: true, email: true } },
      site: { select: { name: true } },
      acknowledgements: { where: { userId: session.id } },
    },
  });
}

/** Fetch one notice, enforcing the same visibility rule as the list (a
 * user can't view a SPECIFIC_SITE notice for a site they're not on by
 * guessing its id). */
export async function getVisibleNotice(session: SessionUser, noticeId: string) {
  const db = scopedDb(session.orgId);
  const notice = await db.notice.findUnique({
    where: { id: noticeId },
    include: { postedBy: { select: { name: true, email: true } }, site: { select: { name: true } } },
  });
  if (!notice) return null;

  const userSiteIds = await listUserSiteIds(db, session.id);
  if (!isNoticeVisibleTo(notice, session.role, userSiteIds)) return null;
  return notice;
}

/**
 * Resolves the org users who are the intended audience of a notice — used
 * both for the "who has/hasn't acknowledged" view and for generating
 * Notifications on create.
 */
export async function resolveNoticeAudienceUsers(
  db: ScopedDb,
  audience: NoticeAudience,
  siteId: string | null
) {
  if (audience === "ALL_STAFF") {
    return db.user.findMany({
      where: { deletedAt: null, status: "ACTIVE" },
      select: { id: true, name: true, email: true },
    });
  }
  if (audience === "MANAGERS_ONLY") {
    return db.user.findMany({
      where: { deletedAt: null, status: "ACTIVE", role: { in: ["OWNER", "REGISTERED_MANAGER"] } },
      select: { id: true, name: true, email: true },
    });
  }
  // SPECIFIC_SITE
  if (!siteId) return [];
  return db.user.findMany({
    where: { deletedAt: null, status: "ACTIVE", userSites: { some: { siteId } } },
    select: { id: true, name: true, email: true },
  });
}

/** "Who has/hasn't acknowledged" view for a notice's poster/managers. Uses
 * the same visibility rule as list/detail — a SPECIFIC_SITE notice's
 * acknowledgement roster must not leak to a user at a different site in
 * the same org (that would still be a real cross-site information leak
 * even though it's same-org). */
export async function getNoticeAcknowledgementStatus(session: SessionUser, noticeId: string) {
  const db = scopedDb(session.orgId);
  const visible = await getVisibleNotice(session, noticeId);
  if (!visible) throw new Error("Notice not found or not visible to caller");

  const notice = await db.notice.findUnique({
    where: { id: noticeId },
    include: {
      postedBy: { select: { name: true, email: true } },
      site: { select: { name: true } },
      acknowledgements: { include: { user: { select: { id: true, name: true, email: true } } } },
    },
  });
  if (!notice) throw new Error("Notice not found in caller's organisation");

  const audienceUsers = await resolveNoticeAudienceUsers(db, notice.audience, notice.siteId);
  const acknowledgedUserIds = new Set(notice.acknowledgements.map((a) => a.userId));

  return {
    notice,
    acknowledged: audienceUsers.filter((u) => acknowledgedUserIds.has(u.id)),
    notAcknowledged: audienceUsers.filter((u) => !acknowledgedUserIds.has(u.id)),
  };
}

export async function createNotice(session: SessionUser, input: CreateNoticeInput) {
  const db = scopedDb(session.orgId);

  if (input.siteId) {
    const site = await db.site.findUnique({ where: { id: input.siteId } });
    if (!site) throw new Error("Site not found in caller's organisation");
  }

  const created = await db.notice.create({
    data: {
      title: input.title,
      body: input.body,
      noticeType: input.noticeType as NoticeType,
      audience: input.audience as NoticeAudience,
      siteId: input.audience === "SPECIFIC_SITE" ? input.siteId : null,
      acknowledgementRequired: input.acknowledgementRequired ?? false,
      postedById: session.id,
    } as never,
  });

  await writeAuditLog(db, {
    orgId: session.orgId,
    userId: session.id,
    entityType: "NOTICE",
    entityId: created.id,
    action: "CREATE",
    after: created,
  });

  if (created.acknowledgementRequired) {
    const audienceUsers = await resolveNoticeAudienceUsers(db, created.audience, created.siteId);
    for (const user of audienceUsers) {
      if (user.id === session.id) continue; // poster doesn't need to be notified of their own notice
      await createNotification(db, {
        orgId: session.orgId,
        userId: user.id,
        type: "NOTICE_ACKNOWLEDGEMENT_REQUIRED",
        relatedEntityType: "NOTICE",
        relatedEntityId: created.id,
      });
    }
  }

  return created;
}

export async function acknowledgeNotice(session: SessionUser, noticeId: string) {
  const db = scopedDb(session.orgId);

  const notice = await getVisibleNotice(session, noticeId);
  if (!notice) {
    throw new Error("Notice not found or not visible to caller");
  }

  const existing = await db.noticeAcknowledgement.findUnique({
    where: { noticeId_userId: { noticeId, userId: session.id } },
  });
  if (existing) return existing; // idempotent

  const ack = await db.noticeAcknowledgement.create({
    data: { noticeId, userId: session.id },
  });

  await writeAuditLog(db, {
    orgId: session.orgId,
    userId: session.id,
    entityType: "NOTICE",
    entityId: noticeId,
    action: "ACKNOWLEDGE",
    after: ack,
  });

  return ack;
}

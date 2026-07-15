import type { ModuleName } from "@prisma/client";

import { scopedDb } from "@/server/db/scoped-client";
import { requireModulePermission } from "@/server/rbac/permissions";
import { getModulePermission } from "@/server/rbac/permissions";
import type { SessionUser } from "@/server/auth/session";
import { computeComplianceScore, complianceBand, type ComplianceBand } from "@/server/compliance/score";

// Modules surfaced on the dashboard as live count badges / the donut
// chart, in a FIXED display order — matches the dataviz categorical
// palette's fixed hue-order rule ("assign categorical hues in fixed
// order, never cycled"). Deliberately a subset of NAV_ITEMS: only the
// governance modules, not admin/system ones.
const DASHBOARD_MODULES: { module: ModuleName; label: string }[] = [
  { module: "AUDITS", label: "Audits" },
  { module: "INCIDENTS", label: "Incidents" },
  { module: "EVENTS", label: "Events" },
  { module: "RISK_REGISTER", label: "Risk Register" },
  { module: "POLICIES", label: "Policies" },
  { module: "FEEDBACK_COMPLAINTS", label: "Feedback & Complaints" },
  { module: "NOTICES", label: "Notices" },
  { module: "TRAINING", label: "Staff Training" },
];

export type ModuleCount = { module: ModuleName; label: string; count: number };

export type RecentActivityItem = {
  id: string;
  action: string;
  entityType: string;
  timestamp: Date;
  actor: string;
};

export type DashboardData = {
  moduleCounts: ModuleCount[];
  siteCount: number;
  userCount: number;
  complianceScore: number;
  complianceBand: ComplianceBand;
  recentActivity: RecentActivityItem[];
};

/**
 * Core dashboard data-shaping logic, already authorized — takes orgId and
 * role directly rather than re-deriving them from a live session, so it is
 * independently testable against a real database (see
 * tests/phase2-onboarding-dashboard.test.ts), including the cross-tenant
 * assertion that Org B's AuditLogEntry rows and counts never leak into
 * Org A's result. The public entry point below (getDashboardData) is what
 * the dashboard page calls; it does the RBAC gate first.
 *
 * Every query below goes through scopedDb(orgId) — none of this file
 * imports rawPrisma.
 */
export async function buildDashboardData(
  orgId: string,
  role: SessionUser["role"]
): Promise<DashboardData> {
  const db = scopedDb(orgId);

  const visibility = await Promise.all(
    DASHBOARD_MODULES.map(async (m) => ({
      ...m,
      canView: (await getModulePermission(role, m.module)).canView,
    }))
  );
  const countable = visibility.filter((m) => m.canView);

  const [
    auditsAll,
    incidentsAll,
    eventCount,
    riskCount,
    policiesAll,
    feedbackCount,
    noticeCount,
    trainingCount,
    siteCount,
    userCount,
    recentLog,
  ] = await Promise.all([
    db.audit.findMany({ where: {}, select: { status: true, scheduledDate: true } }),
    db.incident.findMany({ where: {}, select: { status: true } }),
    db.event.count({ where: {} }),
    db.riskEntry.count({ where: {} }),
    db.policy.findMany({ where: {}, select: { reviewDate: true } }),
    db.feedbackComplaint.count({ where: {} }),
    db.notice.count({ where: {} }),
    db.trainingRecord.count({ where: {} }),
    db.site.count({ where: {} }),
    db.user.count({ where: { deletedAt: null } }),
    db.auditLogEntry.findMany({
      where: {},
      orderBy: { timestamp: "desc" },
      take: 10,
      include: { user: { select: { email: true, name: true } } },
    }),
  ]);

  const now = new Date();
  const overdueAudits = auditsAll.filter(
    (a) => a.status === "OVERDUE" || (a.status === "SCHEDULED" && a.scheduledDate < now)
  ).length;
  const openIncidents = incidentsAll.filter(
    (i) => i.status === "OPEN" || i.status === "INVESTIGATING"
  ).length;
  const policiesNeedingReview = policiesAll.filter((p) => p.reviewDate < now).length;

  const score = computeComplianceScore({
    totalAudits: auditsAll.length,
    overdueAudits,
    totalIncidents: incidentsAll.length,
    openIncidents,
    totalPolicies: policiesAll.length,
    policiesNeedingReview,
  });

  const rawCounts: Record<string, number> = {
    AUDITS: auditsAll.length,
    INCIDENTS: incidentsAll.length,
    EVENTS: eventCount,
    RISK_REGISTER: riskCount,
    POLICIES: policiesAll.length,
    FEEDBACK_COMPLAINTS: feedbackCount,
    NOTICES: noticeCount,
    TRAINING: trainingCount,
  };

  const moduleCounts: ModuleCount[] = countable.map((m) => ({
    module: m.module,
    label: m.label,
    count: rawCounts[m.module] ?? 0,
  }));

  const recentActivity: RecentActivityItem[] = recentLog.map((entry) => ({
    id: entry.id,
    action: entry.action,
    entityType: entry.entityType,
    timestamp: entry.timestamp,
    actor: entry.user.name || entry.user.email,
  }));

  return {
    moduleCounts,
    siteCount,
    userCount,
    complianceScore: score,
    complianceBand: complianceBand(score),
    recentActivity,
  };
}

/**
 * Public entry point used by the dashboard page. Auth -> org -> RBAC:
 * gated by requireModulePermission("DASHBOARD", "view") — orgId and role
 * come only from the authenticated session.
 */
export async function getDashboardData(): Promise<DashboardData> {
  const session = await requireModulePermission("DASHBOARD", "view");
  return buildDashboardData(session.orgId, session.role);
}

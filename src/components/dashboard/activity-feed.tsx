import type { RecentActivityItem } from "@/server/dashboard/data";

const ACTION_LABEL: Record<string, string> = {
  CREATE: "created",
  UPDATE: "updated",
  DELETE: "deleted",
  APPROVE: "approved",
  RESTORE: "restored",
  EXPORT: "exported",
  LOGIN: "logged in",
  LOGOUT: "logged out",
  INVITE: "invited",
  ACKNOWLEDGE: "acknowledged",
};

const ENTITY_LABEL: Record<string, string> = {
  ORGANISATION: "the organisation",
  SITE: "a site",
  USER: "a team member",
  AUDIT: "an audit",
  INCIDENT: "an incident",
  EVENT: "an event",
  RISK_ENTRY: "a risk entry",
  POLICY: "a policy",
  FEEDBACK_COMPLAINT: "a feedback/complaint record",
  NOTICE: "a notice",
  TRAINING_RECORD: "a training record",
  CALENDAR_TASK: "a calendar task",
};

function formatTimestamp(d: Date) {
  return new Date(d).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Recent activity feed — driven directly by AuditLogEntry rows fetched via
 * scopedDb(orgId) in src/server/dashboard/data.ts (buildDashboardData).
 * Nothing here queries data itself; it only formats what it's given, so
 * the cross-tenant guarantee lives entirely in the scoped query, not in
 * this component (see tests/phase2-onboarding-dashboard.test.ts).
 */
export function ActivityFeed({ items }: { items: RecentActivityItem[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-slate-500">No activity recorded yet for your organisation.</p>;
  }

  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.id} className="flex items-start gap-3 text-sm">
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" aria-hidden />
          <div>
            <p className="text-slate-800">
              <span className="font-medium">{item.actor}</span>{" "}
              {ACTION_LABEL[item.action] ?? item.action.toLowerCase()}{" "}
              {ENTITY_LABEL[item.entityType] ?? item.entityType.toLowerCase()}
            </p>
            <p className="text-xs text-slate-500">{formatTimestamp(item.timestamp)}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

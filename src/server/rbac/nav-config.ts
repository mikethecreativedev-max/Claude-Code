import type { ModuleName } from "@prisma/client";

export type NavItem = {
  module: ModuleName;
  label: string;
  href: string;
};

// Matches the RADAR-reference nav structure from the Section 2 page list:
// Compliance/Dashboard, Events, Risks, Audits, Notices, Scheduled
// tasks/Calendar, Documents/Policies, plus the free-tier and admin items.
// Visibility is computed server-side per-role from RolePermission — this
// list is not itself the access control, just the candidate set.
export const NAV_ITEMS: NavItem[] = [
  { module: "DASHBOARD", label: "Dashboard", href: "/dashboard" },
  { module: "AUDITS", label: "Audits", href: "/dashboard/audits" },
  { module: "INCIDENTS", label: "Incidents", href: "/dashboard/incidents" },
  { module: "EVENTS", label: "Events", href: "/dashboard/events" },
  { module: "RISK_REGISTER", label: "Risk Register", href: "/dashboard/risks" },
  { module: "POLICIES", label: "Policies", href: "/dashboard/policies" },
  {
    module: "FEEDBACK_COMPLAINTS",
    label: "Feedback & Complaints",
    href: "/dashboard/feedback",
  },
  { module: "NOTICES", label: "Notices", href: "/dashboard/notices" },
  { module: "TRAINING", label: "Staff Training", href: "/dashboard/training" },
  { module: "CALENDAR", label: "Calendar", href: "/dashboard/calendar" },
  { module: "EVIDENCE_PACKS", label: "Evidence Packs", href: "/dashboard/evidence-packs" },
  { module: "QG_HUB", label: "Quality & Governance Hub", href: "/dashboard/qg-hub" },
  {
    module: "READINESS_SCORER",
    label: "Inspection Readiness",
    href: "/dashboard/readiness",
  },
  { module: "ADMIN_USERS", label: "Users & Roles", href: "/dashboard/admin/users" },
  { module: "ADMIN_SITES", label: "Sites", href: "/dashboard/admin/sites" },
  { module: "ADMIN_BILLING", label: "Billing", href: "/dashboard/admin/billing" },
  {
    module: "ADMIN_DATA_PROTECTION",
    label: "Data Protection Centre",
    href: "/dashboard/admin/data-protection",
  },
  { module: "BNCL_SUPER_ADMIN", label: "BNCL Admin", href: "/bncl-admin" },
];

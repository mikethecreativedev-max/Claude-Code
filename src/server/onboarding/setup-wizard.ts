import { scopedDb } from "@/server/db/scoped-client";
import { requireModulePermission } from "@/server/rbac/permissions";
import { setupWizardSchema, type SetupWizardInput } from "@/server/onboarding/schemas";

/**
 * Persists the setup wizard's output (org details, site(s), registered
 * activities, service type) via the scoped data-access layer only — see
 * BUILD_CHECKLIST.md Phase 2 acceptance criteria.
 *
 * "Service type" convention: Site has no dedicated serviceType column in
 * schema.prisma (which this phase does not modify) — only
 * `registeredActivities String[]`. By convention, documented here and in
 * README.md, the wizard's chosen service type is stored as the FIRST
 * element of each site's registeredActivities array, with any additional
 * regulated activities the user lists following it. This keeps the data
 * model unchanged while still genuinely persisting the service type.
 *
 * Org-details step: only Organisation.name is editable here. The
 * Organisation.update call below is scoped by construction — `where` is
 * always `{ id: orgId }` using the session-derived orgId, never a
 * client-supplied id — even though scopedDb() itself performs no
 * automatic where-injection for Organisation (it is the tenant root, not
 * a member of TENANT_MODELS, since it carries no orgId column of its own).
 */

export type SetupWizardResult = { orgId: string; siteIds: string[] };

/**
 * Core wizard-completion logic, already authorized — takes orgId and the
 * acting user's id directly, so it is testable against a real database
 * without a live NextAuth session (see
 * tests/phase2-onboarding-dashboard.test.ts).
 */
export async function completeSetupWizardForOrg(
  orgId: string,
  actingUserId: string,
  input: SetupWizardInput
): Promise<SetupWizardResult> {
  const db = scopedDb(orgId);

  await db.organisation.update({
    where: { id: orgId },
    data: { name: input.orgName },
  });

  const siteIds: string[] = [];
  for (const site of input.sites) {
    const created = await db.site.create({
      data: {
        orgId,
        name: site.name,
        address: site.address || null,
        registeredActivities: [input.serviceType, ...site.registeredActivities],
      },
    });
    siteIds.push(created.id);

    await db.auditLogEntry.create({
      data: {
        orgId,
        entityType: "SITE",
        entityId: created.id,
        userId: actingUserId,
        action: "CREATE",
        afterSnapshot: {
          name: created.name,
          registeredActivities: created.registeredActivities,
        },
      },
    });
  }

  return { orgId, siteIds };
}

/**
 * Public entry point for POST /api/setup-wizard. Auth -> org -> RBAC:
 * gated by requireModulePermission("ADMIN_SITES", "edit") — there is no
 * dedicated ONBOARDING/SETUP entry in the ModuleName enum (schema.prisma
 * is not modified by this phase); ADMIN_SITES is the closest existing
 * module to "creating/editing Site rows for my org." Per the seeded
 * RolePermission matrix, OWNER and REGISTERED_MANAGER can edit it, STAFF
 * cannot — which matches who should be completing org setup.
 */
export async function completeSetupWizard(input: unknown): Promise<SetupWizardResult> {
  const session = await requireModulePermission("ADMIN_SITES", "edit");
  const parsed = setupWizardSchema.parse(input);
  return completeSetupWizardForOrg(session.orgId, session.id, parsed);
}

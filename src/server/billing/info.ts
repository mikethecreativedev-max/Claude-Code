import { requireModulePermission } from "@/server/rbac/permissions";
import { scopedOrganisation } from "@/server/db/scoped-client";

/** Read-only billing status for the /dashboard/admin/billing page. */
export async function getBillingInfo() {
  const session = await requireModulePermission("ADMIN_BILLING", "view");
  const org = await scopedOrganisation(session.orgId).get();
  return {
    subscriptionTier: org?.subscriptionTier ?? "FREE",
    billingStatus: org?.billingStatus ?? "TRIALING",
    hasStripeCustomer: Boolean(org?.stripeCustomerId),
    isOwner: session.role === "OWNER",
  };
}

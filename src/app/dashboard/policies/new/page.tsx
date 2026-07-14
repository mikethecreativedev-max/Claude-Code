import { requireModulePermission } from "@/server/rbac/permissions";
import { listOrgSites } from "@/server/domain/reference-data";
import { createPolicyAction } from "@/server/policies/actions";
import { PolicyForm } from "@/app/dashboard/policies/PolicyForm";

export default async function NewPolicyPage() {
  const session = await requireModulePermission("POLICIES", "edit");
  const sites = await listOrgSites(session.orgId);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">New Policy</h1>
      <PolicyForm action={createPolicyAction} sites={sites} />
    </div>
  );
}

import { requireModulePermission } from "@/server/rbac/permissions";
import { listOrgSites, listOrgUsers } from "@/server/domain/reference-data";
import { createRiskEntryAction } from "@/server/risks/actions";
import { RiskEntryForm } from "@/app/dashboard/risks/RiskEntryForm";

export default async function NewRiskEntryPage() {
  const session = await requireModulePermission("RISK_REGISTER", "edit");
  const [sites, users] = await Promise.all([
    listOrgSites(session.orgId),
    listOrgUsers(session.orgId),
  ]);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">New Risk Entry</h1>
      <RiskEntryForm action={createRiskEntryAction} sites={sites} users={users} />
    </div>
  );
}

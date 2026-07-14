import { notFound } from "next/navigation";

import { requireModulePermission } from "@/server/rbac/permissions";
import { getPolicyDetail } from "@/server/policies/service";
import { editPolicyAction } from "@/server/policies/actions";
import { listOrgSites } from "@/server/domain/reference-data";
import { PolicyForm } from "@/app/dashboard/policies/PolicyForm";

export default async function EditPolicyPage({ params }: { params: { id: string } }) {
  const session = await requireModulePermission("POLICIES", "edit");
  const policy = await getPolicyDetail(session.orgId, params.id);
  if (!policy) notFound();

  const sites = await listOrgSites(session.orgId);

  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold">Edit Policy</h1>
      <p className="mb-6 text-sm text-slate-500">
        Saving creates a new version (v{policy.versionNumber + 1}) — the current version is
        preserved in the history, per the append-only versioning pattern.
      </p>
      <PolicyForm
        action={editPolicyAction.bind(null, policy.id)}
        sites={sites}
        initial={{
          siteId: policy.siteId,
          title: policy.title,
          reviewDate: policy.reviewDate,
          status: policy.status,
        }}
      />
    </div>
  );
}

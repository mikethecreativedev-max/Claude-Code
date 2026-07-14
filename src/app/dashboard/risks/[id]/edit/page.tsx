import { notFound } from "next/navigation";

import { requireModulePermission } from "@/server/rbac/permissions";
import { getRiskEntryDetail } from "@/server/risks/service";
import { editRiskEntryAction } from "@/server/risks/actions";
import { listOrgSites, listOrgUsers } from "@/server/domain/reference-data";
import { parseMitigationActionsJson } from "@/server/domain/mitigation-actions";
import { RiskEntryForm } from "@/app/dashboard/risks/RiskEntryForm";

export default async function EditRiskEntryPage({ params }: { params: { id: string } }) {
  const session = await requireModulePermission("RISK_REGISTER", "edit");
  const risk = await getRiskEntryDetail(session.orgId, params.id);
  if (!risk) notFound();

  const [sites, users] = await Promise.all([
    listOrgSites(session.orgId),
    listOrgUsers(session.orgId),
  ]);

  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold">Edit Risk Entry</h1>
      <p className="mb-6 text-sm text-slate-500">
        Saving creates a new version (v{risk.versionNumber + 1}) — the current version is preserved
        in the history, per the append-only versioning pattern.
      </p>
      <RiskEntryForm
        action={editRiskEntryAction.bind(null, risk.id)}
        sites={sites}
        users={users}
        initial={{
          siteId: risk.siteId,
          title: risk.title,
          description: risk.description,
          likelihood: risk.likelihood,
          impact: risk.impact,
          riskRating: risk.riskRating,
          ownerId: risk.ownerId,
          reviewDate: risk.reviewDate,
          status: risk.status,
          mitigationActions: parseMitigationActionsJson(risk.mitigationActions),
        }}
      />
    </div>
  );
}

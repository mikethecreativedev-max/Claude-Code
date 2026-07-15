import Link from "next/link";
import { notFound } from "next/navigation";

import { getModulePermission, requireModulePermission } from "@/server/rbac/permissions";
import { getRiskEntryDetail, getRiskEntryVersionChain } from "@/server/risks/service";
import {
  approveRiskEntryAction,
  tagRiskEntryAction,
  uploadRiskEntryAttachmentAction,
  voidRiskEntryAction,
} from "@/server/risks/actions";
import { listRiskEntryAttachments } from "@/server/risks/attachments";
import { getTagsForEntity } from "@/server/domain/tag-integrity";
import { listTaxonomy } from "@/server/domain/reference-data";
import { parseMitigationActionsJson } from "@/server/domain/mitigation-actions";

export default async function RiskEntryDetailPage({ params }: { params: { id: string } }) {
  const session = await requireModulePermission("RISK_REGISTER", "view");
  const risk = await getRiskEntryDetail(session.orgId, params.id);
  if (!risk) notFound();

  const [chain, tags, taxonomy, attachments] = await Promise.all([
    getRiskEntryVersionChain(session.orgId, risk.id),
    getTagsForEntity(session.orgId, "RISK_ENTRY", risk.id),
    listTaxonomy(session.orgId),
    listRiskEntryAttachments(session.orgId, risk.id),
  ]);

  const mitigationActions = parseMitigationActionsJson(risk.mitigationActions);
  const editPerm = await getModulePermission(session.role, "RISK_REGISTER");

  return (
    <div className="max-w-3xl space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{risk.title}</h1>
          <p className="text-sm text-slate-500">
            {risk.site.name} &middot; Owner: {risk.owner.name} &middot; v{risk.versionNumber}
          </p>
        </div>
        <div className="flex gap-2">
          {editPerm.canEdit && (
            <Link
              href={`/dashboard/risks/${risk.id}/edit`}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50"
            >
              Edit
            </Link>
          )}
          {editPerm.canEdit && (
            <form action={voidRiskEntryAction.bind(null, risk.id)}>
              <button
                type="submit"
                className="rounded-md border border-red-300 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
              >
                Void
              </button>
            </form>
          )}
        </div>
      </div>

      <section className="grid grid-cols-4 gap-4 rounded-lg border border-slate-200 p-4 text-sm">
        <div>
          <div className="text-xs uppercase text-slate-400">Likelihood</div>
          <div className="text-lg font-semibold">{risk.likelihood}</div>
        </div>
        <div>
          <div className="text-xs uppercase text-slate-400">Impact</div>
          <div className="text-lg font-semibold">{risk.impact}</div>
        </div>
        <div>
          <div className="text-xs uppercase text-slate-400">Risk rating (server-computed)</div>
          <div className="text-lg font-semibold">{risk.riskRating}</div>
        </div>
        <div>
          <div className="text-xs uppercase text-slate-400">Status</div>
          <div className="text-lg font-semibold">{risk.status}</div>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase text-slate-500">Description</h2>
        <p className="whitespace-pre-wrap text-sm">{risk.description}</p>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase text-slate-500">Mitigation actions</h2>
        {mitigationActions.length === 0 && <p className="text-sm text-slate-400">None recorded.</p>}
        <ul className="space-y-2">
          {mitigationActions.map((a, i) => (
            <li key={i} className="rounded-md border border-slate-200 p-3 text-sm">
              <div className="font-medium">{a.description}</div>
              <div className="text-xs text-slate-500">
                Due {a.dueDate} &middot; {a.status}
                {a.completedDate ? ` · completed ${a.completedDate}` : ""}
              </div>
            </li>
          ))}
        </ul>
      </section>

      {editPerm.canApprove && (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase text-slate-500">Approve status change</h2>
          <form
            action={approveRiskEntryAction.bind(null, risk.id)}
            className="flex items-center gap-2"
          >
            <select
              name="status"
              defaultValue={risk.status}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="OPEN">Open</option>
              <option value="MITIGATING">Mitigating</option>
              <option value="CLOSED">Closed</option>
              <option value="ACCEPTED">Accepted</option>
            </select>
            <button
              type="submit"
              className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
            >
              Approve &amp; create new version
            </button>
          </form>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase text-slate-500">Attachments</h2>
        {attachments.length === 0 && <p className="text-sm text-slate-400">No files attached yet.</p>}
        <ul className="space-y-1 text-sm">
          {attachments.map((a) => (
            <li key={a.id}>
              {a.fileName}{" "}
              <span className="text-slate-400">
                ({(a.sizeBytes / 1024).toFixed(1)} KB, uploaded {a.uploadedAt.toLocaleString()})
              </span>
            </li>
          ))}
        </ul>
        {editPerm.canEdit && (
          <form
            action={uploadRiskEntryAttachmentAction.bind(null, risk.id)}
            encType="multipart/form-data"
            className="mt-2 flex items-center gap-2"
          >
            <input type="file" name="file" required className="text-sm" />
            <button
              type="submit"
              className="rounded-md border border-slate-300 px-3 py-1 text-sm hover:bg-slate-50"
            >
              Upload file
            </button>
          </form>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase text-slate-500">
          Reg 17 / CQC / Six Pillar tags
        </h2>
        <div className="mb-3 space-y-1 text-sm">
          {tags.regClauseTags.map((t) => (
            <div key={t.id} className="inline-block rounded-full bg-slate-100 px-3 py-1 mr-2">
              Reg {t.regSubClause.subParagraph}
            </div>
          ))}
          {tags.cqcKeyQuestionTags.map((t) => (
            <div key={t.id} className="inline-block rounded-full bg-slate-100 px-3 py-1 mr-2">
              CQC: {t.cqcKeyQuestion.name}
            </div>
          ))}
          {tags.sixPillarTags.map((t) => (
            <div key={t.id} className="inline-block rounded-full bg-slate-100 px-3 py-1 mr-2">
              Pillar: {t.sixPillar.name}
            </div>
          ))}
          {tags.regClauseTags.length === 0 &&
            tags.cqcKeyQuestionTags.length === 0 &&
            tags.sixPillarTags.length === 0 && <p className="text-slate-400">No tags yet.</p>}
        </div>
        {editPerm.canEdit && (
          <form action={tagRiskEntryAction.bind(null, risk.id)} className="flex items-center gap-2">
            <select name="taxonomy" className="rounded-md border border-slate-300 px-2 py-1 text-sm">
              <option value="REG_CLAUSE">Reg 17 clause</option>
              <option value="CQC_KEY_QUESTION">CQC key question</option>
              <option value="SIX_PILLAR">Six Pillar</option>
            </select>
            <select name="taxonomyId" className="rounded-md border border-slate-300 px-2 py-1 text-sm">
              <optgroup label="Reg 17 clauses">
                {taxonomy.regClauses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.subParagraph}
                  </option>
                ))}
              </optgroup>
              <optgroup label="CQC key questions">
                {taxonomy.cqcKeyQuestions.map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.name}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Six Pillars">
                {taxonomy.sixPillars.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </optgroup>
            </select>
            <button
              type="submit"
              className="rounded-md border border-slate-300 px-3 py-1 text-sm hover:bg-slate-50"
            >
              Add tag
            </button>
          </form>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase text-slate-500">Version history</h2>
        <ol className="space-y-2 text-sm">
          {chain?.map((v) => (
            <li key={v.id} className="rounded-md border border-slate-200 p-3">
              <span className="font-medium">v{v.versionNumber}</span>
              {v.isCurrentVersion && (
                <span className="ml-2 rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">
                  current
                </span>
              )}
              <span className="ml-2 text-slate-500">
                status={v.status}, rating={v.riskRating}, updated {v.updatedAt.toLocaleString()}
              </span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

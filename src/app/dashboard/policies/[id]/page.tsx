import Link from "next/link";
import { notFound } from "next/navigation";

import { getModulePermission, requireModulePermission } from "@/server/rbac/permissions";
import { getPolicyDetail, getPolicyVersionChain, derivePolicyReviewStatus } from "@/server/policies/service";
import {
  activatePolicyAction,
  tagPolicyAction,
  uploadPolicyAttachmentAction,
  voidPolicyAction,
} from "@/server/policies/actions";
import { getCurrentPolicyAttachment } from "@/server/policies/attachments";
import { getTagsForEntity } from "@/server/domain/tag-integrity";
import { listTaxonomy } from "@/server/domain/reference-data";

export default async function PolicyDetailPage({ params }: { params: { id: string } }) {
  const session = await requireModulePermission("POLICIES", "view");
  const policy = await getPolicyDetail(session.orgId, params.id);
  if (!policy) notFound();

  const [chain, tags, taxonomy, attachment, editPerm] = await Promise.all([
    getPolicyVersionChain(session.orgId, policy.id),
    getTagsForEntity(session.orgId, "POLICY", policy.id),
    listTaxonomy(session.orgId),
    getCurrentPolicyAttachment(session.orgId, policy.id),
    getModulePermission(session.role, "POLICIES"),
  ]);

  const reviewStatus = derivePolicyReviewStatus(policy.reviewDate);

  return (
    <div className="max-w-3xl space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{policy.title}</h1>
          <p className="text-sm text-slate-500">
            {policy.site.name} &middot; v{policy.versionNumber} &middot; review {reviewStatus}
          </p>
        </div>
        <div className="flex gap-2">
          {editPerm.canEdit && (
            <Link
              href={`/dashboard/policies/${policy.id}/edit`}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50"
            >
              Edit
            </Link>
          )}
          {editPerm.canEdit && (
            <form action={voidPolicyAction.bind(null, policy.id)}>
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

      <section className="grid grid-cols-3 gap-4 rounded-lg border border-slate-200 p-4 text-sm">
        <div>
          <div className="text-xs uppercase text-slate-400">Status</div>
          <div className="text-lg font-semibold">{policy.status}</div>
        </div>
        <div>
          <div className="text-xs uppercase text-slate-400">Review date</div>
          <div className="text-lg font-semibold">{policy.reviewDate.toLocaleDateString()}</div>
        </div>
        <div>
          <div className="text-xs uppercase text-slate-400">Review status</div>
          <div className="text-lg font-semibold">{reviewStatus}</div>
        </div>
      </section>

      {editPerm.canApprove && (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase text-slate-500">Activate / change status</h2>
          <form action={activatePolicyAction.bind(null, policy.id)} className="flex items-center gap-2">
            <select
              name="status"
              defaultValue={policy.status}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="ACTIVE">Active</option>
              <option value="UNDER_REVIEW">Under review</option>
              <option value="SUPERSEDED">Superseded</option>
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
        <h2 className="mb-2 text-sm font-semibold uppercase text-slate-500">File attachment</h2>
        {attachment ? (
          <p className="text-sm">
            {attachment.fileName}{" "}
            <span className="text-slate-400">
              ({(attachment.sizeBytes / 1024).toFixed(1)} KB, uploaded{" "}
              {attachment.uploadedAt.toLocaleString()})
            </span>
          </p>
        ) : (
          <p className="text-sm text-slate-400">No file attached yet.</p>
        )}
        {editPerm.canEdit && (
          <form
            action={uploadPolicyAttachmentAction.bind(null, policy.id)}
            encType="multipart/form-data"
            className="mt-2 flex items-center gap-2"
          >
            <input type="file" name="file" required className="text-sm" />
            <button
              type="submit"
              className="rounded-md border border-slate-300 px-3 py-1 text-sm hover:bg-slate-50"
            >
              {attachment ? "Replace file" : "Upload file"}
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
          <form action={tagPolicyAction.bind(null, policy.id)} className="flex items-center gap-2">
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
                status={v.status}, review {v.reviewDate.toLocaleDateString()}, updated{" "}
                {v.updatedAt.toLocaleString()}
              </span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

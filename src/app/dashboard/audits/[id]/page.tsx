import Link from "next/link";
import { notFound } from "next/navigation";

import { requireModulePermission, getModulePermission } from "@/server/rbac/permissions";
import { scopedDb } from "@/server/db/scoped-client";
import {
  listSixPillars,
  listRegulatorySubClauses,
  listCQCKeyQuestions,
} from "@/server/taxonomy/reference-data";
import * as auditService from "@/server/audits/service";
import { FollowUpActionsArraySchema } from "@/server/audits/schemas";
import { FollowUpActionsEditor } from "@/components/follow-up-actions-editor";
import {
  editAuditAction,
  completeAuditAction,
  voidAuditAction,
  tagAuditRegClauseAction,
  removeAuditRegClauseTagAction,
  tagAuditCQCKeyQuestionAction,
  removeAuditCQCKeyQuestionTagAction,
  uploadAuditAttachmentAction,
} from "@/app/dashboard/audits/actions";

export default async function AuditDetailPage({ params }: { params: { id: string } }) {
  const session = await requireModulePermission("AUDITS", "view");
  const perm = await getModulePermission(session.role, "AUDITS");

  const audit = await auditService.getAuditById(session, params.id);
  if (!audit) notFound();

  const [chain, activity, tags, attachments, sixPillars, regClauses, cqcQuestions, orgUsers] =
    await Promise.all([
      auditService.getAuditVersionChain(session, params.id),
      auditService.getAuditActivityLog(session, params.id),
      auditService.listAuditTags(session, audit.id),
      auditService.listAuditAttachments(session, audit.id),
      listSixPillars(),
      listRegulatorySubClauses(),
      listCQCKeyQuestions(),
      scopedDb(session.orgId).user.findMany({
        where: { deletedAt: null },
        orderBy: { name: "asc" },
      }),
    ]);

  const taggedRegClauseIds = new Set(tags.regClauseTags.map((t) => t.regSubClauseId));
  const taggedCQCIds = new Set(tags.cqcKeyQuestionTags.map((t) => t.cqcKeyQuestionId));
  const followUpActions = FollowUpActionsArraySchema.parse(audit.followUpActions ?? []);

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">{audit.type}</h1>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium">
            {audit.status}
          </span>
        </div>
        <p className="mt-1 text-sm text-slate-500">
          Site: {audit.site.name} · Version {audit.versionNumber}
          {audit.deletedAt && (
            <span className="ml-2 rounded bg-red-100 px-2 py-0.5 text-xs text-red-800">Voided</span>
          )}
        </p>
      </div>

      {!audit.isCurrentVersion && audit.supersededById && (
        <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">
          This is a superseded historical version.{" "}
          <Link
            href={`/dashboard/audits/${audit.supersededById}`}
            className="font-medium text-brand-700 underline"
          >
            View the current version
          </Link>
          .
        </p>
      )}

      {audit.isCurrentVersion && !audit.deletedAt && perm.canApprove && audit.status !== "COMPLETED" && (
        <form
          action={completeAuditAction}
          className="flex items-center gap-3 rounded-md border border-green-200 bg-green-50 p-4"
        >
          <input type="hidden" name="id" value={audit.id} />
          <label className="text-sm font-medium">Result score (0-100)</label>
          <input
            type="number"
            min={0}
            max={100}
            name="resultScore"
            className="w-24 rounded-md border border-slate-300 px-2 py-1 text-sm"
          />
          <button
            type="submit"
            className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800"
          >
            Mark completed (approve)
          </button>
        </form>
      )}

      {audit.isCurrentVersion && !audit.deletedAt && perm.canEdit && (
        <section className="rounded-md border border-slate-200 p-4">
          <h2 className="mb-3 text-lg font-medium">Edit</h2>
          <p className="mb-3 text-xs text-slate-500">
            Saving creates a new version and supersedes this one (append-only versioning) — see
            editAudit() in src/server/audits/service.ts.
          </p>
          <form action={editAuditAction} className="space-y-4">
            <input type="hidden" name="id" value={audit.id} />
            <div>
              <label className="mb-1 block text-sm font-medium">Audit type</label>
              <input
                name="type"
                defaultValue={audit.type}
                required
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Scheduled date</label>
              <input
                type="date"
                name="scheduledDate"
                defaultValue={audit.scheduledDate.toISOString().slice(0, 10)}
                required
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Six Pillar</label>
              <select
                name="sixPillarId"
                defaultValue={audit.sixPillarId ?? ""}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">— None —</option>
                {sixPillars.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.description}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Result score (0-100)</label>
              <input
                type="number"
                min={0}
                max={100}
                name="resultScore"
                defaultValue={audit.resultScore ?? ""}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium">Follow-up actions</label>
              <FollowUpActionsEditor
                formFieldName="followUpActions"
                initialActions={followUpActions}
                ownerOptions={orgUsers.map((u) => ({ id: u.id, name: u.name }))}
              />
            </div>
            <button
              type="submit"
              className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
            >
              Save new version
            </button>
          </form>

          <form action={voidAuditAction} className="mt-4 border-t border-slate-100 pt-4">
            <input type="hidden" name="id" value={audit.id} />
            <button type="submit" className="text-sm text-red-600 hover:underline">
              Void this audit
            </button>
          </form>
        </section>
      )}

      <section className="rounded-md border border-slate-200 p-4">
        <h2 className="mb-3 text-lg font-medium">Regulatory clause tags (Reg 17)</h2>
        <ul className="mb-3 flex flex-wrap gap-2">
          {tags.regClauseTags.map((t) => (
            <li
              key={t.id}
              className="flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs"
            >
              {t.regSubClause.subParagraph}
              {perm.canEdit && (
                <form action={removeAuditRegClauseTagAction}>
                  <input type="hidden" name="tagId" value={t.id} />
                  <input type="hidden" name="auditId" value={audit.id} />
                  <button type="submit" className="text-red-600" aria-label="Remove tag">
                    ×
                  </button>
                </form>
              )}
            </li>
          ))}
          {tags.regClauseTags.length === 0 && (
            <li className="text-sm text-slate-500">No Reg 17 tags yet.</li>
          )}
        </ul>
        {perm.canEdit && (
          <form action={tagAuditRegClauseAction} className="flex gap-2">
            <input type="hidden" name="auditId" value={audit.id} />
            <select
              name="regSubClauseId"
              className="rounded-md border border-slate-300 px-2 py-1 text-sm"
            >
              {regClauses
                .filter((c) => !taggedRegClauseIds.has(c.id))
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.subParagraph}
                  </option>
                ))}
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

      <section className="rounded-md border border-slate-200 p-4">
        <h2 className="mb-3 text-lg font-medium">CQC key question tags</h2>
        <ul className="mb-3 flex flex-wrap gap-2">
          {tags.cqcKeyQuestionTags.map((t) => (
            <li
              key={t.id}
              className="flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs"
            >
              {t.cqcKeyQuestion.name}
              {perm.canEdit && (
                <form action={removeAuditCQCKeyQuestionTagAction}>
                  <input type="hidden" name="tagId" value={t.id} />
                  <input type="hidden" name="auditId" value={audit.id} />
                  <button type="submit" className="text-red-600" aria-label="Remove tag">
                    ×
                  </button>
                </form>
              )}
            </li>
          ))}
          {tags.cqcKeyQuestionTags.length === 0 && (
            <li className="text-sm text-slate-500">No CQC key question tags yet.</li>
          )}
        </ul>
        {perm.canEdit && (
          <form action={tagAuditCQCKeyQuestionAction} className="flex gap-2">
            <input type="hidden" name="auditId" value={audit.id} />
            <select
              name="cqcKeyQuestionId"
              className="rounded-md border border-slate-300 px-2 py-1 text-sm"
            >
              {cqcQuestions
                .filter((q) => !taggedCQCIds.has(q.id))
                .map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.name}
                  </option>
                ))}
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

      <section className="rounded-md border border-slate-200 p-4">
        <h2 className="mb-3 text-lg font-medium">Attachments</h2>
        <ul className="mb-3 space-y-1 text-sm">
          {attachments.map((a) => (
            <li key={a.id}>
              {a.fileName} <span className="text-slate-400">({(a.sizeBytes / 1024).toFixed(1)} KB)</span>
            </li>
          ))}
          {attachments.length === 0 && <li className="text-slate-500">No attachments yet.</li>}
        </ul>
        {perm.canEdit && (
          <form
            action={uploadAuditAttachmentAction}
            encType="multipart/form-data"
            className="flex items-center gap-2"
          >
            <input type="hidden" name="auditId" value={audit.id} />
            <input type="file" name="file" required className="text-sm" />
            <button
              type="submit"
              className="rounded-md border border-slate-300 px-3 py-1 text-sm hover:bg-slate-50"
            >
              Upload
            </button>
          </form>
        )}
        <p className="mt-2 text-xs text-slate-400">
          V1 storage: local-disk stub, not real S3 — see src/server/governance/attachments.ts.
        </p>
      </section>

      <section className="rounded-md border border-slate-200 p-4">
        <h2 className="mb-3 text-lg font-medium">Version history</h2>
        <ul className="space-y-1 text-sm">
          {chain.map((v) => (
            <li key={v.id}>
              <Link
                href={`/dashboard/audits/${v.id}`}
                className={`hover:underline ${v.id === audit.id ? "font-semibold" : ""}`}
              >
                v{v.versionNumber} {v.isCurrentVersion ? "(current)" : "(superseded)"}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-md border border-slate-200 p-4">
        <h2 className="mb-3 text-lg font-medium">Activity (AuditLogEntry)</h2>
        <ul className="space-y-2 text-sm">
          {activity.map((entry) => (
            <li key={entry.id} className="border-b border-slate-100 pb-2 last:border-0">
              <span className="font-medium">{entry.action}</span> by {entry.user.name} —{" "}
              {entry.timestamp.toISOString()}
            </li>
          ))}
          {activity.length === 0 && <li className="text-slate-500">No activity yet.</li>}
        </ul>
      </section>
    </div>
  );
}

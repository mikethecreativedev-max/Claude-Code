import Link from "next/link";
import { notFound } from "next/navigation";

import { requireModulePermission, getModulePermission } from "@/server/rbac/permissions";
import { scopedDb } from "@/server/db/scoped-client";
import {
  listSixPillars,
  listRegulatorySubClauses,
  listCQCKeyQuestions,
} from "@/server/taxonomy/reference-data";
import * as incidentService from "@/server/incidents/service";
import { FollowUpActionsArraySchema } from "@/server/incidents/schemas";
import { FollowUpActionsEditor } from "@/components/follow-up-actions-editor";
import {
  editIncidentAction,
  startInvestigationAction,
  closeIncidentAction,
  voidIncidentAction,
  tagIncidentRegClauseAction,
  removeIncidentRegClauseTagAction,
  tagIncidentCQCKeyQuestionAction,
  removeIncidentCQCKeyQuestionTagAction,
  tagIncidentSixPillarAction,
  removeIncidentSixPillarTagAction,
  uploadIncidentAttachmentAction,
} from "@/app/dashboard/incidents/actions";

const SEVERITIES = ["NO_HARM", "LOW", "MODERATE", "SEVERE", "DEATH"] as const;

export default async function IncidentDetailPage({ params }: { params: { id: string } }) {
  const session = await requireModulePermission("INCIDENTS", "view");
  const perm = await getModulePermission(session.role, "INCIDENTS");

  const incident = await incidentService.getIncidentById(session, params.id);
  if (!incident) notFound();

  const [chain, activity, tags, attachments, sixPillars, regClauses, cqcQuestions, orgUsers] =
    await Promise.all([
      incidentService.getIncidentVersionChain(session, params.id),
      incidentService.getIncidentActivityLog(session, params.id),
      incidentService.listIncidentTags(session, incident.id),
      incidentService.listIncidentAttachments(session, incident.id),
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
  const taggedSixPillarIds = new Set(tags.sixPillarTags.map((t) => t.sixPillarId));
  const followUpActions = FollowUpActionsArraySchema.parse(incident.followUpActions ?? []);

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">
            Incident — {incident.dateTime.toISOString().slice(0, 10)}
          </h1>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium">
            {incident.status}
          </span>
        </div>
        <p className="mt-1 text-sm text-slate-500">
          Site: {incident.site.name} · Severity: {incident.severityGrading} · Version{" "}
          {incident.versionNumber}
          {incident.notifiableToCQC && (
            <span className="ml-2 rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
              Notifiable to CQC
            </span>
          )}
          {incident.deletedAt && (
            <span className="ml-2 rounded bg-red-100 px-2 py-0.5 text-xs text-red-800">Voided</span>
          )}
        </p>
      </div>

      {!incident.isCurrentVersion && incident.supersededById && (
        <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">
          This is a superseded historical version.{" "}
          <Link
            href={`/dashboard/incidents/${incident.supersededById}`}
            className="font-medium text-brand-700 underline"
          >
            View the current version
          </Link>
          .
        </p>
      )}

      {incident.isCurrentVersion && !incident.deletedAt && perm.canEdit && incident.status === "OPEN" && (
        <form action={startInvestigationAction} className="rounded-md border border-blue-200 bg-blue-50 p-4">
          <input type="hidden" name="id" value={incident.id} />
          <button
            type="submit"
            className="rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800"
          >
            Start investigation
          </button>
        </form>
      )}

      {incident.isCurrentVersion &&
        !incident.deletedAt &&
        perm.canApprove &&
        incident.status !== "CLOSED" && (
          <form
            action={closeIncidentAction}
            className="flex items-center gap-3 rounded-md border border-green-200 bg-green-50 p-4"
          >
            <input type="hidden" name="id" value={incident.id} />
            <button
              type="submit"
              className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800"
            >
              Close incident (approve)
            </button>
          </form>
        )}

      {incident.isCurrentVersion && !incident.deletedAt && perm.canEdit && (
        <section className="rounded-md border border-slate-200 p-4">
          <h2 className="mb-3 text-lg font-medium">Edit</h2>
          <p className="mb-3 text-xs text-slate-500">
            Saving creates a new version and supersedes this one (append-only versioning) — see
            editIncident() in src/server/incidents/service.ts.
          </p>
          <form action={editIncidentAction} className="space-y-4">
            <input type="hidden" name="id" value={incident.id} />
            <div>
              <label className="mb-1 block text-sm font-medium">Date/time</label>
              <input
                type="datetime-local"
                name="dateTime"
                defaultValue={incident.dateTime.toISOString().slice(0, 16)}
                required
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Description</label>
              <textarea
                name="description"
                defaultValue={incident.description}
                required
                rows={5}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Severity grading</label>
              <select
                name="severityGrading"
                defaultValue={incident.severityGrading}
                required
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                {SEVERITIES.map((s) => (
                  <option key={s} value={s}>
                    {s.replace("_", " ")}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">PSIRF classification</label>
              <input
                name="psirfClassification"
                defaultValue={incident.psirfClassification}
                required
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="notifiableToCQC"
                defaultChecked={incident.notifiableToCQC}
              />
              Notifiable to CQC
            </label>
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

          <form action={voidIncidentAction} className="mt-4 border-t border-slate-100 pt-4">
            <input type="hidden" name="id" value={incident.id} />
            <button type="submit" className="text-sm text-red-600 hover:underline">
              Void this incident
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
                <form action={removeIncidentRegClauseTagAction}>
                  <input type="hidden" name="tagId" value={t.id} />
                  <input type="hidden" name="incidentId" value={incident.id} />
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
          <form action={tagIncidentRegClauseAction} className="flex gap-2">
            <input type="hidden" name="incidentId" value={incident.id} />
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
                <form action={removeIncidentCQCKeyQuestionTagAction}>
                  <input type="hidden" name="tagId" value={t.id} />
                  <input type="hidden" name="incidentId" value={incident.id} />
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
          <form action={tagIncidentCQCKeyQuestionAction} className="flex gap-2">
            <input type="hidden" name="incidentId" value={incident.id} />
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
        <h2 className="mb-3 text-lg font-medium">Six Pillar tags</h2>
        <ul className="mb-3 flex flex-wrap gap-2">
          {tags.sixPillarTags.map((t) => (
            <li
              key={t.id}
              className="flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs"
            >
              {t.sixPillar.name}
              {perm.canEdit && (
                <form action={removeIncidentSixPillarTagAction}>
                  <input type="hidden" name="tagId" value={t.id} />
                  <input type="hidden" name="incidentId" value={incident.id} />
                  <button type="submit" className="text-red-600" aria-label="Remove tag">
                    ×
                  </button>
                </form>
              )}
            </li>
          ))}
          {tags.sixPillarTags.length === 0 && (
            <li className="text-sm text-slate-500">No Six Pillar tags yet.</li>
          )}
        </ul>
        {perm.canEdit && (
          <form action={tagIncidentSixPillarAction} className="flex gap-2">
            <input type="hidden" name="incidentId" value={incident.id} />
            <select
              name="sixPillarId"
              className="rounded-md border border-slate-300 px-2 py-1 text-sm"
            >
              {sixPillars
                .filter((p) => !taggedSixPillarIds.has(p.id))
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.description}
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
              {a.fileName}{" "}
              <span className="text-slate-400">({(a.sizeBytes / 1024).toFixed(1)} KB)</span>
            </li>
          ))}
          {attachments.length === 0 && <li className="text-slate-500">No attachments yet.</li>}
        </ul>
        {perm.canEdit && (
          <form
            action={uploadIncidentAttachmentAction}
            encType="multipart/form-data"
            className="flex items-center gap-2"
          >
            <input type="hidden" name="incidentId" value={incident.id} />
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
                href={`/dashboard/incidents/${v.id}`}
                className={`hover:underline ${v.id === incident.id ? "font-semibold" : ""}`}
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

import { requireModulePermission } from "@/server/rbac/permissions";
import { scopedDb } from "@/server/db/scoped-client";
import { createIncidentAction } from "@/app/dashboard/incidents/actions";

const SEVERITIES = ["NO_HARM", "LOW", "MODERATE", "SEVERE", "DEATH"] as const;

export default async function NewIncidentPage() {
  const session = await requireModulePermission("INCIDENTS", "edit");

  const sites = await scopedDb(session.orgId).site.findMany({
    where: { deletedAt: null },
    orderBy: { name: "asc" },
  });

  return (
    <div className="max-w-xl">
      <h1 className="mb-6 text-2xl font-semibold">Report incident</h1>
      <form action={createIncidentAction} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="siteId">
            Site
          </label>
          <select
            id="siteId"
            name="siteId"
            required
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="dateTime">
            Date/time of incident
          </label>
          <input
            id="dateTime"
            name="dateTime"
            type="datetime-local"
            required
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
          <p className="mb-2 font-medium">Anonymisation guidance</p>
          <p>
            Do not include service users&apos; full names, dates of birth, addresses, or other
            directly identifying details in the description below — use initials or a role
            reference (e.g. &quot;Service User A&quot;) wherever possible, in line with PSIRF
            good-practice guidance.
          </p>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="description">
            Description
          </label>
          <textarea
            id="description"
            name="description"
            required
            rows={5}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="anonymisationAcknowledged" required className="mt-1" />
          <span>
            I confirm I have read the anonymisation guidance above and have not included
            directly identifying service-user details in the description.
          </span>
        </label>

        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="severityGrading">
            Severity grading
          </label>
          <select
            id="severityGrading"
            name="severityGrading"
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
          <label className="mb-1 block text-sm font-medium" htmlFor="psirfClassification">
            PSIRF classification
          </label>
          <input
            id="psirfClassification"
            name="psirfClassification"
            required
            placeholder="e.g. Learning response"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="notifiableToCQC" />
          Notifiable to CQC
        </label>

        <button
          type="submit"
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          Submit incident report
        </button>
      </form>
    </div>
  );
}

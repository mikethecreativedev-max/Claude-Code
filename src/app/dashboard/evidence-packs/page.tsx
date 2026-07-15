import { requireModulePermissionWithTier } from "@/server/rbac/tier";
import { listTaxonomy } from "@/server/domain/reference-data";
import { CQC_DOMAIN_LABELS } from "@/server/evidence-packs/query";

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default async function EvidencePacksPage() {
  const session = await requireModulePermissionWithTier("EVIDENCE_PACKS", "view", "PAID");
  const { regClauses, cqcKeyQuestions, sixPillars } = await listTaxonomy(session.orgId);

  const today = new Date();
  const ninetyDaysAgo = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000);

  return (
    <main>
      <h1 className="text-2xl font-semibold">Evidence Pack Generator</h1>
      <p className="mt-2 max-w-2xl text-sm text-slate-600">
        Compile every tagged Audit, Incident, Event, Risk Register entry, Policy and
        Feedback/Complaint record for this organisation into a single, inspection-presentable
        PDF — the &ldquo;hand this to a CQC inspector&rdquo; export. Pick a date range and,
        optionally, a single regulatory domain to narrow the pack; leave the domain as
        &ldquo;All domains&rdquo; for a complete pack.
      </p>

      <form
        method="GET"
        action="/api/evidence-packs"
        target="_blank"
        className="mt-6 max-w-xl space-y-4 rounded-md border border-slate-200 p-6"
      >
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-600">From</label>
            <input
              type="date"
              name="dateFrom"
              defaultValue={isoDate(ninetyDaysAgo)}
              required
              className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600">To</label>
            <input
              type="date"
              name="dateTo"
              defaultValue={isoDate(today)}
              required
              className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600">Domain filter</label>
          <select
            name="domain"
            defaultValue="ALL"
            className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          >
            <option value="ALL">All domains (full pack)</option>
            <optgroup label="CQC Key Question">
              {cqcKeyQuestions.map((q) => (
                <option key={q.id} value={`CQC_KEY_QUESTION:${q.id}`}>
                  {CQC_DOMAIN_LABELS[q.name] ?? q.name}
                </option>
              ))}
            </optgroup>
            <optgroup label="Reg 17 sub-clause">
              {regClauses.map((c) => (
                <option key={c.id} value={`REG_CLAUSE:${c.id}`}>
                  {c.subParagraph} — {c.description.slice(0, 70)}
                  {c.description.length > 70 ? "…" : ""}
                </option>
              ))}
            </optgroup>
            <optgroup label="Six Pillar">
              {sixPillars.map((p) => (
                <option key={p.id} value={`SIX_PILLAR:${p.id}`}>
                  {p.description}
                </option>
              ))}
            </optgroup>
          </select>
        </div>

        <button
          type="submit"
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          Generate PDF evidence pack
        </button>
        <p className="text-xs text-slate-500">
          Opens in a new tab as a downloadable PDF. Every export writes an audit log entry.
        </p>
      </form>
    </main>
  );
}

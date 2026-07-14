import Link from "next/link";

import { scopedDb } from "@/server/db/scoped-client";
import { requireModulePermission } from "@/server/rbac/permissions";
import { CQC_DOMAINS, CQC_DOMAIN_LABELS } from "@/server/readiness/questions";
import type { ScorePerDomain } from "@/server/readiness/scoring";

function ScoreLineChart({ points }: { points: { label: string; score: number }[] }) {
  if (points.length === 0) return null;

  const width = 640;
  const height = 180;
  const padding = 24;
  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;

  const xStep = points.length > 1 ? innerWidth / (points.length - 1) : 0;
  const coords = points.map((p, i) => ({
    x: padding + i * xStep,
    y: padding + innerHeight * (1 - p.score / 100),
    ...p,
  }));
  const path = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x},${c.y}`).join(" ");

  return (
    <svg
      role="img"
      aria-label="Overall readiness score over time"
      viewBox={`0 0 ${width} ${height}`}
      className="w-full max-w-2xl"
    >
      {/* gridlines at 0/50/100 */}
      {[0, 50, 100].map((mark) => {
        const y = padding + innerHeight * (1 - mark / 100);
        return (
          <g key={mark}>
            <line x1={padding} y1={y} x2={width - padding} y2={y} stroke="#e2e8f0" strokeWidth={1} />
            <text x={0} y={y + 4} fontSize={10} fill="#64748b">
              {mark}
            </text>
          </g>
        );
      })}
      <path d={path} fill="none" stroke="#0369a1" strokeWidth={2} />
      {coords.map((c) => (
        <circle key={c.label} cx={c.x} cy={c.y} r={3} fill="#0369a1">
          <title>
            {c.label}: {c.score}/100
          </title>
        </circle>
      ))}
    </svg>
  );
}

export default async function ReadinessHistoryPage() {
  const session = await requireModulePermission("READINESS_SCORER", "view");

  // Cross-tenant risk: this must only ever read the calling session's own
  // org's rows. scopedDb(session.orgId) enforces that at the data layer
  // (see src/server/db/scoped-client.ts); tests/phase3-free-tier.test.ts
  // asserts an Org B session can never see Org A's history here.
  const scores = await scopedDb(session.orgId).readinessScore.findMany({
    orderBy: { dateTaken: "asc" },
    include: { site: { select: { name: true } } },
  });

  const chartPoints = scores.map((s) => ({
    label: new Date(s.dateTaken).toLocaleDateString("en-GB"),
    score: s.overallScore,
  }));

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Readiness History</h1>
        <Link href="/dashboard/readiness" className="text-sm text-brand-700 hover:underline">
          &larr; Take questionnaire
        </Link>
      </div>
      <p className="mt-2 text-sm text-slate-600">
        Every readiness score submitted for your organisation, ordered by date taken.
      </p>

      {scores.length === 0 ? (
        <p className="mt-6 text-sm text-slate-500">
          No readiness scores yet. <Link href="/dashboard/readiness" className="underline">Take the questionnaire</Link>.
        </p>
      ) : (
        <>
          <div className="mt-6">
            <ScoreLineChart points={chartPoints} />
          </div>

          <table className="mt-8 w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2 pr-4 font-medium">Date</th>
                <th className="py-2 pr-4 font-medium">Site</th>
                <th className="py-2 pr-4 font-medium">Overall</th>
                {CQC_DOMAINS.map((domain) => (
                  <th key={domain} className="py-2 pr-4 font-medium">
                    {CQC_DOMAIN_LABELS[domain]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {scores.map((s) => {
                const perDomain = s.scorePerDomain as ScorePerDomain;
                return (
                  <tr key={s.id} className="border-b border-slate-100">
                    <td className="py-2 pr-4">{new Date(s.dateTaken).toLocaleString("en-GB")}</td>
                    <td className="py-2 pr-4">{s.site?.name ?? "Organisation-wide"}</td>
                    <td className="py-2 pr-4 font-medium">{s.overallScore}</td>
                    {CQC_DOMAINS.map((domain) => (
                      <td key={domain} className="py-2 pr-4">
                        {perDomain[domain] ?? "-"}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

import Link from "next/link";

import { scopedDb } from "@/server/db/scoped-client";
import { requireModulePermission } from "@/server/rbac/permissions";
import { READINESS_QUESTIONS } from "@/server/readiness/questions";

import { ReadinessForm } from "./readiness-form";

export default async function ReadinessPage() {
  const session = await requireModulePermission("READINESS_SCORER", "view");

  const sites = await scopedDb(session.orgId).site.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Inspection Readiness Scorer</h1>
        <Link href="/dashboard/readiness/history" className="text-sm text-brand-700 hover:underline">
          View history &rarr;
        </Link>
      </div>
      <p className="mt-2 text-sm text-slate-600">
        Answer each question for your organisation (or a specific site). Scoring is per CQC key
        question domain, plus an overall score. Available on every subscription tier.
      </p>

      <ReadinessForm questions={READINESS_QUESTIONS} sites={sites} />
    </div>
  );
}

import Link from "next/link";

import { listQGHubContentForViewer } from "@/server/content/qg-hub";
import { requireModulePermission } from "@/server/rbac/permissions";

export default async function QGHubPage() {
  const session = await requireModulePermission("QG_HUB", "view");
  const items = await listQGHubContentForViewer(session);

  return (
    <div>
      <h1 className="text-2xl font-semibold">Quality &amp; Governance Hub</h1>
      <p className="mt-2 text-sm text-slate-600">
        Guidance articles and lessons curated by BNCL. Available on every subscription tier.
      </p>

      {items.length === 0 ? (
        <p className="mt-6 text-sm text-slate-500">No content published yet.</p>
      ) : (
        <ul className="mt-6 space-y-3">
          {items.map((item) => (
            <li key={item.id} className="rounded-md border border-slate-200 p-4">
              <Link
                href={`/dashboard/qg-hub/${item.id}`}
                className="font-medium text-brand-700 hover:underline"
              >
                {item.title}
              </Link>
              <div className="mt-1 text-xs text-slate-500">
                {item.category} &middot; {item.contentType}
                {session.role === "BNCL_ADMIN" && item.publishStatus !== "PUBLISHED"
                  ? " · DRAFT (visible to you as BNCL_ADMIN only)"
                  : ""}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

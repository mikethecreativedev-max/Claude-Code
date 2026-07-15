import { notFound } from "next/navigation";

import { getQGHubContentForViewer } from "@/server/content/qg-hub";
import { requireModulePermission } from "@/server/rbac/permissions";

export default async function QGHubDetailPage({ params }: { params: { id: string } }) {
  const session = await requireModulePermission("QG_HUB", "view");
  const content = await getQGHubContentForViewer(session, params.id);

  if (!content) {
    notFound();
  }

  return (
    <article>
      <h1 className="text-2xl font-semibold">{content.title}</h1>
      <div className="mt-1 text-xs text-slate-500">
        {content.category} &middot; {content.contentType}
        {content.publishStatus !== "PUBLISHED" ? " · DRAFT" : ""}
      </div>
      <div className="prose mt-6 max-w-none whitespace-pre-wrap text-sm text-slate-800">
        {content.body ?? "No content body yet."}
      </div>
    </article>
  );
}

import { notFound } from "next/navigation";

import { getModulePermission, requireModulePermission } from "@/server/rbac/permissions";
import { getNoticeAcknowledgementStatus } from "@/server/modules/notices";
import { acknowledgeNoticeAction } from "../actions";

export default async function NoticeDetailPage({ params }: { params: { id: string } }) {
  const session = await requireModulePermission("NOTICES", "view");
  const canEdit = (await getModulePermission(session.role, "NOTICES")).canEdit;

  let status;
  try {
    status = await getNoticeAcknowledgementStatus(session, params.id);
  } catch {
    // Not found, or not visible to this session (e.g. a SPECIFIC_SITE
    // notice for a site this user isn't assigned to) — either way, treat
    // it the same as "doesn't exist" from this viewer's point of view.
    notFound();
  }

  const { notice, acknowledged, notAcknowledged } = status;
  const acknowledgedByMe = acknowledged.some((u) => u.id === session.id);

  return (
    <div>
      <h1 className="text-2xl font-semibold">{notice.title}</h1>
      <p className="mt-1 text-sm text-slate-600">
        Posted {notice.postedDate.toISOString().slice(0, 10)} by {notice.postedBy.name} ·{" "}
        {notice.audience === "SPECIFIC_SITE" ? `Site: ${notice.site?.name ?? "—"}` : notice.audience.replace("_", " ")}
      </p>

      <p className="mt-6 max-w-2xl whitespace-pre-wrap text-sm">{notice.body}</p>

      {notice.acknowledgementRequired && (
        <div className="mt-6 max-w-lg rounded-md border border-slate-200 p-4">
          {acknowledgedByMe ? (
            <p className="text-sm font-medium text-emerald-700">You have acknowledged this notice.</p>
          ) : (
            <form action={acknowledgeNoticeAction}>
              <input type="hidden" name="noticeId" value={notice.id} />
              <p className="mb-3 text-sm text-slate-600">
                This notice requires acknowledgement.
              </p>
              <button
                type="submit"
                className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
              >
                Acknowledge
              </button>
            </form>
          )}
        </div>
      )}

      {canEdit && notice.acknowledgementRequired && (
        <section className="mt-8 max-w-lg">
          <h2 className="text-sm font-semibold">Acknowledgement roster</h2>
          <div className="mt-2 grid grid-cols-2 gap-4 text-sm">
            <div>
              <h3 className="mb-1 font-medium text-emerald-700">
                Acknowledged ({acknowledged.length})
              </h3>
              <ul className="space-y-1">
                {acknowledged.map((u) => (
                  <li key={u.id}>{u.name}</li>
                ))}
                {acknowledged.length === 0 && <li className="text-slate-500">None yet.</li>}
              </ul>
            </div>
            <div>
              <h3 className="mb-1 font-medium text-amber-700">
                Not yet acknowledged ({notAcknowledged.length})
              </h3>
              <ul className="space-y-1">
                {notAcknowledged.map((u) => (
                  <li key={u.id}>{u.name}</li>
                ))}
                {notAcknowledged.length === 0 && <li className="text-slate-500">Everyone has acknowledged.</li>}
              </ul>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

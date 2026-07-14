import { notFound } from "next/navigation";

import { getFeedback } from "@/server/modules/feedback";
import { requireModulePermission } from "@/server/rbac/permissions";
import { updateFeedbackAction } from "../actions";

export default async function EditFeedbackPage({ params }: { params: { id: string } }) {
  const session = await requireModulePermission("FEEDBACK_COMPLAINTS", "view");
  const complaint = await getFeedback(session, params.id);
  if (!complaint) notFound();

  return (
    <div>
      <h1 className="text-2xl font-semibold">Edit feedback / complaint</h1>
      <p className="mt-1 text-sm text-slate-600">
        {complaint.source} — {complaint.site.name}
      </p>

      <form action={updateFeedbackAction} className="mt-6 max-w-lg space-y-3">
        <input type="hidden" name="id" value={complaint.id} />
        <div>
          <label className="mb-1 block text-xs font-medium">Category</label>
          <input
            name="category"
            required
            defaultValue={complaint.category}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium">Description</label>
          <textarea
            name="description"
            required
            rows={3}
            defaultValue={complaint.description}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium">Outcome</label>
          <textarea
            name="outcome"
            rows={2}
            defaultValue={complaint.outcome ?? ""}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium">Status</label>
          <select
            name="status"
            defaultValue={complaint.status}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="OPEN">Open</option>
            <option value="IN_PROGRESS">In progress</option>
            <option value="RESOLVED">Resolved</option>
            <option value="CLOSED">Closed</option>
          </select>
        </div>
        <button
          type="submit"
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          Save changes
        </button>
      </form>
    </div>
  );
}

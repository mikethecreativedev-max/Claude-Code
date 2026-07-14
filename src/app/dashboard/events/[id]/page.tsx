import { notFound } from "next/navigation";

import { getModulePermission, requireModulePermission } from "@/server/rbac/permissions";
import {
  getEvent,
  listRegSubClausesForTagging,
  SUGGESTED_EVENT_TYPES,
} from "@/server/modules/events";
import { addEventAttachmentAction, tagEventAction, updateEventAction } from "../actions";

export default async function EditEventPage({ params }: { params: { id: string } }) {
  const session = await requireModulePermission("EVENTS", "view");
  const canEdit = (await getModulePermission(session.role, "EVENTS")).canEdit;

  const result = await getEvent(session, params.id);
  if (!result) notFound();
  const { event, tags, attachments } = result;
  const regSubClauses = canEdit ? await listRegSubClausesForTagging(session) : [];

  return (
    <div>
      <h1 className="text-2xl font-semibold">Event: {event.title}</h1>
      <p className="mt-1 text-sm text-slate-600">{event.site.name}</p>

      {canEdit ? (
        <form action={updateEventAction} className="mt-6 max-w-lg space-y-3">
          <input type="hidden" name="id" value={event.id} />
          <div>
            <label className="mb-1 block text-xs font-medium">Event type</label>
            <input
              name="eventType"
              required
              defaultValue={event.eventType}
              list="event-type-suggestions"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <datalist id="event-type-suggestions">
              {SUGGESTED_EVENT_TYPES.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">Title</label>
            <input
              name="title"
              required
              defaultValue={event.title}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">Description</label>
            <textarea
              name="description"
              required
              rows={3}
              defaultValue={event.description}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">Date &amp; time</label>
            <input
              type="datetime-local"
              name="dateTime"
              required
              defaultValue={event.dateTime.toISOString().slice(0, 16)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">Status</label>
            <select name="status" defaultValue={event.status} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
              <option value="OPEN">Open</option>
              <option value="CLOSED">Closed</option>
            </select>
          </div>
          <button type="submit" className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
            Save changes
          </button>
        </form>
      ) : (
        <dl className="mt-6 max-w-lg space-y-2 text-sm">
          <div>
            <dt className="font-medium">Type</dt>
            <dd>{event.eventType}</dd>
          </div>
          <div>
            <dt className="font-medium">Description</dt>
            <dd>{event.description}</dd>
          </div>
          <div>
            <dt className="font-medium">Status</dt>
            <dd>{event.status}</dd>
          </div>
        </dl>
      )}

      <section className="mt-8 max-w-lg">
        <h2 className="text-sm font-semibold">Reg 17 tags</h2>
        <ul className="mt-2 space-y-1 text-sm">
          {tags.map((t) => (
            <li key={t.id}>
              {t.regSubClause.subParagraph} — {t.regSubClause.description}
            </li>
          ))}
          {tags.length === 0 && <li className="text-slate-500">No tags yet.</li>}
        </ul>
        {canEdit && (
          <form action={tagEventAction} className="mt-3 flex gap-2">
            <input type="hidden" name="eventId" value={event.id} />
            <select name="regSubClauseId" required className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm">
              {regSubClauses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.subParagraph}
                </option>
              ))}
            </select>
            <button type="submit" className="rounded-md bg-slate-700 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800">
              Add tag
            </button>
          </form>
        )}
      </section>

      <section className="mt-8 max-w-lg">
        <h2 className="text-sm font-semibold">Attachments</h2>
        <ul className="mt-2 space-y-1 text-sm">
          {attachments.map((a) => (
            <li key={a.id}>
              {a.fileName} ({Math.round(a.sizeBytes / 1024)} KB)
            </li>
          ))}
          {attachments.length === 0 && <li className="text-slate-500">No attachments yet.</li>}
        </ul>
        {canEdit && (
          <form action={addEventAttachmentAction} className="mt-3 flex gap-2" encType="multipart/form-data">
            <input type="hidden" name="eventId" value={event.id} />
            <input type="file" name="file" required className="flex-1 text-sm" />
            <button type="submit" className="rounded-md bg-slate-700 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800">
              Upload
            </button>
          </form>
        )}
      </section>
    </div>
  );
}

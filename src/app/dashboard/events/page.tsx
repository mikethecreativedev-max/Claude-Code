import Link from "next/link";

import { getModulePermission, requireModulePermission } from "@/server/rbac/permissions";
import { scopedDb } from "@/server/db/scoped-client";
import { listEvents, SUGGESTED_EVENT_TYPES } from "@/server/modules/events";
import { listOrgSites } from "@/server/org/directory";
import { createEventAction } from "./actions";

// Events module definition is intentionally under-specified by the source
// document — see BUILD_CHECKLIST.md "Known open item" and README.md
// "Events (open item)". This page implements ONLY a minimal generic log:
// free-text eventType (with suggestions), title, description, dateTime,
// status, tagging, attachments. Do not read further semantics into this
// page — it is not a subtype of, or merged with, Incidents.
export default async function EventsPage() {
  const session = await requireModulePermission("EVENTS", "view");
  const canEdit = (await getModulePermission(session.role, "EVENTS")).canEdit;

  const [events, sites] = await Promise.all([
    listEvents(session),
    listOrgSites(scopedDb(session.orgId)),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-semibold">Events</h1>
      <p className="mt-1 max-w-2xl text-sm text-slate-600">
        Minimal generic event log. <strong>Definition pending product confirmation</strong> — this
        is intentionally a generic log (free-text event type, title, description, date/time,
        status, tagging, attachments) and not a specific workflow. See BUILD_CHECKLIST.md
        &quot;Known open item&quot; and README.md.
      </p>

      <table className="mt-6 w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-slate-500">
            <th className="py-2 pr-4">Type</th>
            <th className="py-2 pr-4">Title</th>
            <th className="py-2 pr-4">Site</th>
            <th className="py-2 pr-4">Date</th>
            <th className="py-2 pr-4">Status</th>
          </tr>
        </thead>
        <tbody>
          {events.map((e) => (
            <tr key={e.id} className="border-b border-slate-100">
              <td className="py-2 pr-4">{e.eventType}</td>
              <td className="py-2 pr-4">
                <Link className="text-brand-600 hover:underline" href={`/dashboard/events/${e.id}`}>
                  {e.title}
                </Link>
              </td>
              <td className="py-2 pr-4">{e.site.name}</td>
              <td className="py-2 pr-4">{e.dateTime.toISOString().slice(0, 10)}</td>
              <td className="py-2 pr-4">{e.status}</td>
            </tr>
          ))}
          {events.length === 0 && (
            <tr>
              <td colSpan={5} className="py-4 text-slate-500">
                No events logged yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {canEdit && (
        <form action={createEventAction} className="mt-8 max-w-lg space-y-3 rounded-md border border-slate-200 p-4">
          <h2 className="text-sm font-semibold">Log new event</h2>
          <div>
            <label className="mb-1 block text-xs font-medium">Site</label>
            <select name="siteId" required className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">Event type (free text — suggestions below)</label>
            <input
              name="eventType"
              required
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
            <input name="title" required className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">Description</label>
            <textarea name="description" required rows={3} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">Date &amp; time</label>
            <input
              type="datetime-local"
              name="dateTime"
              required
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">Status</label>
            <select name="status" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
              <option value="OPEN">Open</option>
              <option value="CLOSED">Closed</option>
            </select>
          </div>
          <button type="submit" className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
            Save
          </button>
        </form>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";

export type RiskFormSite = { id: string; name: string };
export type RiskFormUser = { id: string; name: string };
export type RiskFormMitigationAction = {
  description: string;
  ownerId: string;
  dueDate: string;
  status: string;
  completedDate: string | null;
};

const inputClass = "w-full rounded-md border border-slate-300 px-3 py-2 text-sm";
const labelClass = "mb-1 block text-sm font-medium";

function toDateInputValue(d: Date | string | null | undefined) {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toISOString().slice(0, 10);
}

/**
 * Shared create/edit form, including the embedded mitigation-actions
 * editor (array of { description, ownerId, dueDate, status,
 * completedDate }, submitted as parallel-named FormData fields and
 * reassembled server-side in src/server/risks/actions.ts — see
 * mitigationActions being a Json array field on RiskEntry, not a
 * separate table).
 */
export function RiskEntryForm({
  action,
  sites,
  users,
  initial,
}: {
  action: (formData: FormData) => void;
  sites: RiskFormSite[];
  users: RiskFormUser[];
  initial?: {
    siteId: string;
    title: string;
    description: string;
    likelihood: number;
    impact: number;
    riskRating: number;
    ownerId: string;
    reviewDate: Date;
    status: string;
    mitigationActions: RiskFormMitigationAction[];
  };
}) {
  const [actions, setActions] = useState<RiskFormMitigationAction[]>(
    initial?.mitigationActions?.length
      ? initial.mitigationActions
      : [{ description: "", ownerId: "", dueDate: "", status: "OPEN", completedDate: null }]
  );

  function updateAction(index: number, patch: Partial<RiskFormMitigationAction>) {
    setActions((prev) => prev.map((a, i) => (i === index ? { ...a, ...patch } : a)));
  }

  return (
    <form action={action} className="max-w-2xl space-y-4">
      <div>
        <label className={labelClass} htmlFor="title">
          Title
        </label>
        <input
          id="title"
          name="title"
          required
          defaultValue={initial?.title}
          className={inputClass}
        />
      </div>

      <div>
        <label className={labelClass} htmlFor="description">
          Description
        </label>
        <textarea
          id="description"
          name="description"
          required
          rows={4}
          defaultValue={initial?.description}
          className={inputClass}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass} htmlFor="siteId">
            Site
          </label>
          <select id="siteId" name="siteId" required defaultValue={initial?.siteId} className={inputClass}>
            <option value="" disabled>
              Select site
            </option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass} htmlFor="ownerId">
            Owner
          </label>
          <select id="ownerId" name="ownerId" required defaultValue={initial?.ownerId} className={inputClass}>
            <option value="" disabled>
              Select owner
            </option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className={labelClass} htmlFor="likelihood">
            Likelihood (1-5)
          </label>
          <input
            id="likelihood"
            name="likelihood"
            type="number"
            min={1}
            max={5}
            required
            defaultValue={initial?.likelihood ?? 1}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="impact">
            Impact (1-5)
          </label>
          <input
            id="impact"
            name="impact"
            type="number"
            min={1}
            max={5}
            required
            defaultValue={initial?.impact ?? 1}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="status">
            Status
          </label>
          <select id="status" name="status" defaultValue={initial?.status ?? "OPEN"} className={inputClass}>
            <option value="OPEN">Open</option>
            <option value="MITIGATING">Mitigating</option>
            <option value="CLOSED">Closed</option>
            <option value="ACCEPTED">Accepted</option>
          </select>
        </div>
      </div>

      {/* riskRating is intentionally NOT an editable field — it is always
          server-computed as likelihood * impact (see
          src/server/risks/service.ts computeRiskRating). This hidden
          field exists only to prove, via a manual/curl test, that a
          spoofed value submitted here is silently overwritten. */}
      <input type="hidden" name="riskRating" value={initial?.riskRating ?? 1} />

      <div>
        <label className={labelClass} htmlFor="reviewDate">
          Review date
        </label>
        <input
          id="reviewDate"
          name="reviewDate"
          type="date"
          required
          defaultValue={toDateInputValue(initial?.reviewDate)}
          className={inputClass}
        />
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className={labelClass}>Mitigation actions</label>
          <button
            type="button"
            onClick={() =>
              setActions((prev) => [
                ...prev,
                { description: "", ownerId: "", dueDate: "", status: "OPEN", completedDate: null },
              ])
            }
            className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
          >
            + Add action
          </button>
        </div>
        <div className="space-y-3">
          {actions.map((a, i) => (
            <div key={i} className="rounded-md border border-slate-200 p-3">
              <div className="mb-2 grid grid-cols-2 gap-2">
                <input
                  name="mitigation_description"
                  placeholder="Description"
                  value={a.description}
                  onChange={(e) => updateAction(i, { description: e.target.value })}
                  className={inputClass}
                />
                <select
                  name="mitigation_ownerId"
                  value={a.ownerId}
                  onChange={(e) => updateAction(i, { ownerId: e.target.value })}
                  className={inputClass}
                >
                  <option value="">Owner</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <input
                  name="mitigation_dueDate"
                  type="date"
                  value={a.dueDate}
                  onChange={(e) => updateAction(i, { dueDate: e.target.value })}
                  className={inputClass}
                />
                <select
                  name="mitigation_status"
                  value={a.status}
                  onChange={(e) => updateAction(i, { status: e.target.value })}
                  className={inputClass}
                >
                  <option value="OPEN">Open</option>
                  <option value="IN_PROGRESS">In progress</option>
                  <option value="DONE">Done</option>
                </select>
                <input
                  name="mitigation_completedDate"
                  type="date"
                  value={a.completedDate ?? ""}
                  onChange={(e) => updateAction(i, { completedDate: e.target.value })}
                  className={inputClass}
                />
              </div>
              <button
                type="button"
                onClick={() => setActions((prev) => prev.filter((_, idx) => idx !== i))}
                className="mt-2 text-xs text-red-600 hover:underline"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      </div>

      <button
        type="submit"
        className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
      >
        Save
      </button>
    </form>
  );
}

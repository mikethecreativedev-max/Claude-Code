"use client";

import { useState } from "react";

// Mirrors the Json shape validated server-side by
// src/server/audits/schemas.ts / src/server/incidents/schemas.ts
// (FollowUpActionSchema) — { description, ownerId, dueDate, status,
// completedDate }. This is a client-side editor over that array; on
// submit it serializes to a single hidden JSON input so the Server Action
// receiving the form can Zod-parse the whole array in one shot. No
// separate table/module exists for these — they live entirely in the
// parent record's `followUpActions` Json column.
export type FollowUpActionDraft = {
  description: string;
  ownerId: string;
  dueDate: string;
  status: "OPEN" | "IN_PROGRESS" | "DONE";
  completedDate?: string | null;
};

export function FollowUpActionsEditor({
  formFieldName,
  initialActions,
  ownerOptions,
}: {
  formFieldName: string;
  initialActions: FollowUpActionDraft[];
  ownerOptions: { id: string; name: string }[];
}) {
  const [actions, setActions] = useState<FollowUpActionDraft[]>(initialActions);

  function update(index: number, patch: Partial<FollowUpActionDraft>) {
    setActions((prev) => prev.map((a, i) => (i === index ? { ...a, ...patch } : a)));
  }
  function addRow() {
    setActions((prev) => [
      ...prev,
      {
        description: "",
        ownerId: ownerOptions[0]?.id ?? "",
        dueDate: new Date().toISOString().slice(0, 10),
        status: "OPEN",
        completedDate: null,
      },
    ]);
  }
  function removeRow(index: number) {
    setActions((prev) => prev.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-3">
      <input type="hidden" name={formFieldName} value={JSON.stringify(actions)} />
      {actions.length === 0 && (
        <p className="text-sm text-slate-500">No follow-up actions yet.</p>
      )}
      {actions.map((a, i) => (
        <div
          key={i}
          className="grid grid-cols-12 items-center gap-2 rounded-md border border-slate-200 p-3"
        >
          <input
            className="col-span-4 rounded-md border border-slate-300 px-2 py-1 text-sm"
            placeholder="Description"
            value={a.description}
            onChange={(e) => update(i, { description: e.target.value })}
          />
          <select
            className="col-span-3 rounded-md border border-slate-300 px-2 py-1 text-sm"
            value={a.ownerId}
            onChange={(e) => update(i, { ownerId: e.target.value })}
          >
            <option value="">Owner…</option>
            {ownerOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
          <input
            type="date"
            className="col-span-2 rounded-md border border-slate-300 px-2 py-1 text-sm"
            value={a.dueDate ? a.dueDate.slice(0, 10) : ""}
            onChange={(e) => update(i, { dueDate: e.target.value })}
          />
          <select
            className="col-span-2 rounded-md border border-slate-300 px-2 py-1 text-sm"
            value={a.status}
            onChange={(e) => update(i, { status: e.target.value as FollowUpActionDraft["status"] })}
          >
            <option value="OPEN">Open</option>
            <option value="IN_PROGRESS">In progress</option>
            <option value="DONE">Done</option>
          </select>
          <button
            type="button"
            onClick={() => removeRow(i)}
            className="col-span-1 rounded-md border border-slate-300 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
          >
            Remove
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={addRow}
        className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
      >
        + Add follow-up action
      </button>
    </div>
  );
}

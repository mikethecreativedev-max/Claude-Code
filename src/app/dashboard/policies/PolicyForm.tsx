const inputClass = "w-full rounded-md border border-slate-300 px-3 py-2 text-sm";
const labelClass = "mb-1 block text-sm font-medium";

function toDateInputValue(d: Date | string | null | undefined) {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toISOString().slice(0, 10);
}

export function PolicyForm({
  action,
  sites,
  initial,
}: {
  action: (formData: FormData) => void;
  sites: { id: string; name: string }[];
  initial?: { siteId: string; title: string; reviewDate: Date; status: string };
}) {
  return (
    <form action={action} className="max-w-2xl space-y-4">
      <div>
        <label className={labelClass} htmlFor="title">
          Title
        </label>
        <input id="title" name="title" required defaultValue={initial?.title} className={inputClass} />
      </div>

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

      <div className="grid grid-cols-2 gap-4">
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
          <label className={labelClass} htmlFor="status">
            Status
          </label>
          <select id="status" name="status" defaultValue={initial?.status ?? "ACTIVE"} className={inputClass}>
            <option value="ACTIVE">Active</option>
            <option value="UNDER_REVIEW">Under review</option>
            <option value="SUPERSEDED">Superseded</option>
          </select>
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

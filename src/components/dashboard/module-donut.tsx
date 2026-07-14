import type { ModuleName } from "@prisma/client";

import type { ModuleCount } from "@/server/dashboard/data";

// Categorical palette, fixed slot order (never cycled, never repainted by
// a filter) — the validated 8-hue default from the dataviz skill's
// reference palette. Keyed by ModuleName (not array position) so a role
// that can't view one module never shifts the colors of the ones it can.
const MODULE_COLOR: Record<ModuleName, string> = {
  AUDITS: "#2a78d6", // slot 1 blue
  INCIDENTS: "#1baf7a", // slot 2 aqua
  EVENTS: "#eda100", // slot 3 yellow
  RISK_REGISTER: "#008300", // slot 4 green
  POLICIES: "#4a3aa7", // slot 5 violet
  FEEDBACK_COMPLAINTS: "#e34948", // slot 6 red
  NOTICES: "#e87ba4", // slot 7 magenta
  TRAINING: "#eb6834", // slot 8 orange
  // Remaining ModuleName members never appear on the dashboard donut
  // (see DASHBOARD_MODULES in src/server/dashboard/data.ts) but the type
  // requires every enum member to be covered.
  DASHBOARD: "#898781",
  CALENDAR: "#898781",
  EVIDENCE_PACKS: "#898781",
  QG_HUB: "#898781",
  READINESS_SCORER: "#898781",
  ADMIN_USERS: "#898781",
  ADMIN_SITES: "#898781",
  ADMIN_BILLING: "#898781",
  ADMIN_DATA_PROTECTION: "#898781",
  BNCL_SUPER_ADMIN: "#898781",
};

/**
 * Module-counts donut chart. A record count is a magnitude, split by
 * module identity — categorical color, fixed order, direct labels in the
 * legend (every slot is labeled since there are only up to 8 — well under
 * the "direct-label up to 4, else rely on legend" default, so here the
 * legend itself doubles as full direct labeling). Built as CSS
 * conic-gradient rather than manual SVG arc-path math — same visual
 * result, far less code to get wrong.
 */
export function ModuleDonut({ counts }: { counts: ModuleCount[] }) {
  const total = counts.reduce((sum, c) => sum + c.count, 0);

  if (counts.length === 0) {
    return <p className="text-sm text-slate-500">No modules visible to your role yet.</p>;
  }

  if (total === 0) {
    return (
      <div className="flex items-center gap-6">
        <div
          className="h-36 w-36 shrink-0 rounded-full border-[14px] border-slate-200"
          role="img"
          aria-label="No records yet across any module"
        />
        <p className="text-sm text-slate-500">
          No records yet. Counts will appear here as your team starts using each module.
        </p>
      </div>
    );
  }

  let cursor = 0;
  const segments = counts
    .filter((c) => c.count > 0)
    .map((c) => {
      const start = (cursor / total) * 360;
      cursor += c.count;
      const end = (cursor / total) * 360;
      return `${MODULE_COLOR[c.module]} ${start}deg ${end}deg`;
    });

  return (
    <div className="flex flex-wrap items-center gap-6">
      <div
        className="relative h-36 w-36 shrink-0 rounded-full"
        style={{ background: `conic-gradient(${segments.join(", ")})` }}
        role="img"
        aria-label={`Records by module, ${total} total`}
      >
        <div className="absolute inset-[14px] flex flex-col items-center justify-center rounded-full bg-white">
          <span className="text-xl font-semibold text-slate-900">{total}</span>
          <span className="text-[11px] text-slate-500">records</span>
        </div>
      </div>

      <ul className="min-w-[10rem] flex-1 space-y-1.5 text-sm">
        {counts.map((c) => (
          <li key={c.module} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-slate-700">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: MODULE_COLOR[c.module] }}
                aria-hidden
              />
              {c.label}
            </span>
            <span className="font-medium tabular-nums text-slate-900">{c.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

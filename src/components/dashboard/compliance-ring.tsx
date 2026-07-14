import type { ComplianceBand } from "@/server/compliance/score";

// Fixed status palette (never themed, never reused for series identity) —
// see the dataviz skill's status-palette reference. Values are the
// validated defaults (good/warning/critical), chosen deliberately distinct
// from the donut chart's categorical hues below so a status color never
// impersonates a series.
const BAND_COLOR: Record<ComplianceBand, string> = {
  good: "#0ca30c",
  warning: "#fab219",
  critical: "#d03b3b",
};

const BAND_LABEL: Record<ComplianceBand, string> = {
  good: "On track",
  warning: "Needs attention",
  critical: "Critical",
};

const SIZE = 140;
const STROKE = 14;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * Compliance score ring — a single-value progress ring. Score/band come
 * from the pure V1-placeholder formula in src/server/compliance/score.ts
 * (see that file's docstring and README.md "Compliance score" section for
 * the full inputs/formula/provisional-status disclosure). This component
 * only renders; it does no computation of its own.
 */
export function ComplianceRing({ score, band }: { score: number; band: ComplianceBand }) {
  const clamped = Math.min(100, Math.max(0, score));
  const offset = CIRCUMFERENCE * (1 - clamped / 100);
  const color = BAND_COLOR[band];

  return (
    <div className="flex flex-col items-center gap-2">
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={`Compliance score ${clamped} out of 100, ${BAND_LABEL[band]}`}>
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke="#e1e0d9"
          strokeWidth={STROKE}
        />
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke={color}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
        />
        <text
          x="50%"
          y="47%"
          textAnchor="middle"
          className="fill-slate-900"
          style={{ fontSize: 30, fontWeight: 600 }}
        >
          {clamped}
        </text>
        <text x="50%" y="63%" textAnchor="middle" className="fill-slate-500" style={{ fontSize: 12 }}>
          / 100
        </text>
      </svg>
      <span
        className="rounded-full px-2.5 py-0.5 text-xs font-medium"
        style={{ backgroundColor: `${color}1a`, color }}
      >
        {BAND_LABEL[band]}
      </span>
    </div>
  );
}

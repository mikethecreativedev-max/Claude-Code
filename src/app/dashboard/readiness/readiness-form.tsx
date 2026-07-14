"use client";

import { useState, useTransition } from "react";
import Link from "next/link";

import { submitReadinessQuestionnaire } from "@/server/readiness/actions";
import { CQC_DOMAIN_LABELS, type ReadinessQuestion } from "@/server/readiness/questions";

type Site = { id: string; name: string };

const ANSWER_OPTIONS: { value: 0 | 1 | 2; label: string }[] = [
  { value: 0, label: "No" },
  { value: 1, label: "Partial" },
  { value: 2, label: "Yes" },
];

export function ReadinessForm({
  questions,
  sites,
}: {
  questions: readonly ReadinessQuestion[];
  sites: Site[];
}) {
  const [answers, setAnswers] = useState<Record<string, 0 | 1 | 2>>(() =>
    Object.fromEntries(questions.map((q) => [q.id, 0 as const]))
  );
  const [siteId, setSiteId] = useState<string>("");
  const [result, setResult] = useState<
    { ok: true; overallScore: number } | { ok: false; error: string } | null
  >(null);
  const [isPending, startTransition] = useTransition();

  const domains = Array.from(new Set(questions.map((q) => q.domain)));

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setResult(null);
    startTransition(async () => {
      const response = await submitReadinessQuestionnaire({
        siteId: siteId || undefined,
        responses: questions.map((q) => ({ questionId: q.id, value: answers[q.id] })),
      });
      setResult(response.ok ? { ok: true, overallScore: response.overallScore } : response);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-8">
      {sites.length > 0 && (
        <div>
          <label htmlFor="siteId" className="mb-1 block text-sm font-medium">
            Site (optional)
          </label>
          <select
            id="siteId"
            value={siteId}
            onChange={(e) => setSiteId(e.target.value)}
            className="w-full max-w-sm rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">Organisation-wide</option>
            {sites.map((site) => (
              <option key={site.id} value={site.id}>
                {site.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {domains.map((domain) => (
        <fieldset key={domain} className="rounded-md border border-slate-200 p-4">
          <legend className="px-1 text-sm font-semibold text-brand-700">
            {CQC_DOMAIN_LABELS[domain]}
          </legend>
          <div className="mt-2 space-y-4">
            {questions
              .filter((q) => q.domain === domain)
              .map((q) => (
                <div key={q.id}>
                  <p className="text-sm text-slate-800">{q.text}</p>
                  <div className="mt-2 flex gap-4">
                    {ANSWER_OPTIONS.map((opt) => (
                      <label key={opt.value} className="flex items-center gap-1.5 text-sm">
                        <input
                          type="radio"
                          name={q.id}
                          checked={answers[q.id] === opt.value}
                          onChange={() => setAnswers((prev) => ({ ...prev, [q.id]: opt.value }))}
                        />
                        {opt.label}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
          </div>
        </fieldset>
      ))}

      <div>
        <button
          type="submit"
          disabled={isPending}
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {isPending ? "Submitting..." : "Submit questionnaire"}
        </button>
      </div>

      {result && result.ok && (
        <p className="text-sm text-green-700">
          Score recorded: {result.overallScore}/100 overall.{" "}
          <Link href="/dashboard/readiness/history" className="underline">
            View history
          </Link>
        </p>
      )}
      {result && !result.ok && <p className="text-sm text-red-600">{result.error}</p>}
    </form>
  );
}

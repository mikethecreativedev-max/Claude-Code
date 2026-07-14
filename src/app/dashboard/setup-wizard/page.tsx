"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { SERVICE_TYPES, type ServiceType } from "@/server/onboarding/schemas";

type SiteDraft = { name: string; address: string; registeredActivities: string; };

const EMPTY_SITE: SiteDraft = { name: "", address: "", registeredActivities: "" };

/**
 * Setup wizard: org details, site(s), registered activities, service type
 * — persisted via POST /api/setup-wizard (see
 * src/server/onboarding/setup-wizard.ts, which does the actual scoped
 * writes and RBAC gate). This page only collects input and never sends an
 * orgId — the API route derives it entirely from the session.
 */
export default function SetupWizardPage() {
  const router = useRouter();
  const [step, setStep] = useState<0 | 1>(0);
  const [orgName, setOrgName] = useState("");
  const [serviceType, setServiceType] = useState<ServiceType>(SERVICE_TYPES[0]);
  const [sites, setSites] = useState<SiteDraft[]>([{ ...EMPTY_SITE }]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function updateSite(index: number, patch: Partial<SiteDraft>) {
    setSites((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  function addSite() {
    setSites((prev) => [...prev, { ...EMPTY_SITE }]);
  }

  function removeSite(index: number) {
    setSites((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const payload = {
      orgName,
      serviceType,
      sites: sites.map((s) => ({
        name: s.name,
        address: s.address,
        registeredActivities: s.registeredActivities
          .split(",")
          .map((a) => a.trim())
          .filter(Boolean),
      })),
    };

    try {
      const res = await fetch("/api/setup-wizard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Something went wrong");
        setSubmitting(false);
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Something went wrong");
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold">Set up your organisation</h1>
      <p className="mt-1 text-sm text-slate-600">
        Step {step + 1} of 2 — {step === 0 ? "organisation details" : "sites & registered activities"}
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-6">
        {step === 0 && (
          <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-6">
            <div>
              <label htmlFor="orgName" className="mb-1 block text-sm font-medium">
                Organisation name
              </label>
              <input
                id="orgName"
                required
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label htmlFor="serviceType" className="mb-1 block text-sm font-medium">
                Service type
              </label>
              <select
                id="serviceType"
                value={serviceType}
                onChange={(e) => setServiceType(e.target.value as ServiceType)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                {SERVICE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              disabled={!orgName}
              onClick={() => setStep(1)}
              className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              Next: sites
            </button>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            {sites.map((site, i) => (
              <div key={i} className="space-y-3 rounded-lg border border-slate-200 bg-white p-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold">Site {i + 1}</h2>
                  {sites.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeSite(i)}
                      className="text-xs text-red-600 hover:underline"
                    >
                      Remove
                    </button>
                  )}
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">Site name</label>
                  <input
                    required
                    value={site.name}
                    onChange={(e) => updateSite(i, { name: e.target.value })}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">Address</label>
                  <input
                    value={site.address}
                    onChange={(e) => updateSite(i, { address: e.target.value })}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">
                    Registered activities (comma-separated)
                  </label>
                  <input
                    required
                    value={site.registeredActivities}
                    onChange={(e) => updateSite(i, { registeredActivities: e.target.value })}
                    placeholder="e.g. Treatment of disease, disorder or injury"
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>
            ))}

            <button
              type="button"
              onClick={addSite}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50"
            >
              + Add another site
            </button>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setStep(0)}
                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {submitting ? "Saving…" : "Finish setup"}
              </button>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}

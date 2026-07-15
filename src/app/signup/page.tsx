"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";

/**
 * Sign-up page: creates a new Organisation + first Owner User + a
 * DataProcessingAgreement acceptance record via POST /api/signup (see
 * src/server/onboarding/signup.ts), then signs the new owner straight in
 * and sends them to the setup wizard — "a brand-new signup produces a
 * working login without any manual DB intervention" (BUILD_CHECKLIST.md
 * Phase 2).
 */
export default function SignUpPage() {
  const [orgName, setOrgName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [dpaAccepted, setDpaAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgName, ownerName, email, password, dpaAccepted }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Something went wrong");
        setSubmitting(false);
        return;
      }

      const signInRes = await signIn("credentials", {
        email,
        password,
        redirect: false,
        callbackUrl: "/dashboard/setup-wizard",
      });
      if (signInRes?.ok) {
        window.location.href = "/dashboard/setup-wizard";
      } else {
        // Account was created but auto-sign-in failed for some reason —
        // send them to log in manually rather than leaving them stuck.
        window.location.href = "/login";
      }
    } catch {
      setError("Something went wrong");
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="mb-1 text-xl font-semibold">Create your organisation</h1>
        <p className="mb-6 text-sm text-slate-600">
          Set up BNCL Compliance Platform for your service. You&apos;ll be the account owner.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
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
              placeholder="e.g. Greenfield Aesthetic Clinic"
            />
          </div>
          <div>
            <label htmlFor="ownerName" className="mb-1 block text-sm font-medium">
              Your name
            </label>
            <input
              id="ownerName"
              required
              value={ownerName}
              onChange={(e) => setOwnerName(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <p className="mt-1 text-xs text-slate-500">At least 8 characters.</p>
          </div>

          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={dpaAccepted}
              onChange={(e) => setDpaAccepted(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              I accept the{" "}
              <span className="font-medium">Data Processing Agreement</span> on behalf of this
              organisation.
            </span>
          </label>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={submitting || !dpaAccepted}
            className="w-full rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {submitting ? "Creating your account…" : "Create organisation"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-600">
          Already have an account?{" "}
          <a href="/login" className="font-medium text-brand-700 hover:underline">
            Sign in
          </a>
        </p>
      </div>
    </main>
  );
}

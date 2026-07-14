"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";

type InviteDetails = { email: string; name: string; role: string; orgName: string };

/**
 * Invite-accept page. Public (no session required) — reads uid/token from
 * the query string, resolves them via GET /api/invites/accept (which
 * never trusts any org/role claim from the client, only what's on the
 * already-created User row — see src/server/onboarding/invite.ts), then
 * lets the invitee set a password via POST to the same route. On success,
 * signs them straight in with their new password and role/org already
 * fixed server-side.
 *
 * Wrapped in Suspense because useSearchParams() forces a client-rendered
 * boundary in the Next.js App Router — without it, `next build` fails with
 * "useSearchParams() should be wrapped in a suspense boundary".
 */
export default function AcceptInvitePage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center px-4">
          <p className="text-sm text-slate-600">Loading…</p>
        </main>
      }
    >
      <AcceptInviteForm />
    </Suspense>
  );
}

function AcceptInviteForm() {
  const searchParams = useSearchParams();
  const uid = searchParams.get("uid") ?? "";
  const token = searchParams.get("token") ?? "";

  const [details, setDetails] = useState<InviteDetails | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!uid || !token) {
      setLoadError("This invite link is invalid or has expired");
      return;
    }
    fetch(`/api/invites/accept?uid=${encodeURIComponent(uid)}&token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) {
          setLoadError(body.error ?? "This invite link is invalid or has expired");
          return;
        }
        setDetails(body);
      })
      .catch(() => setLoadError("This invite link is invalid or has expired"));
  }, [uid, token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/invites/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid, token, password }),
      });
      const body = await res.json();
      if (!res.ok) {
        setSubmitError(body.error ?? "Something went wrong");
        setSubmitting(false);
        return;
      }

      const signInRes = await signIn("credentials", {
        email: body.email,
        password,
        redirect: false,
        callbackUrl: "/dashboard",
      });
      window.location.href = signInRes?.ok ? "/dashboard" : "/login";
    } catch {
      setSubmitError("Something went wrong");
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="mb-6 text-xl font-semibold">Accept your invite</h1>

        {loadError && <p className="text-sm text-red-600">{loadError}</p>}

        {!loadError && !details && <p className="text-sm text-slate-600">Checking your invite…</p>}

        {details && (
          <>
            <p className="mb-6 text-sm text-slate-600">
              You&apos;ve been invited to join <span className="font-medium">{details.orgName}</span>{" "}
              as <span className="font-medium">{details.role.replace("_", " ")}</span> (
              {details.email}). Set a password to finish joining.
            </p>
            <form onSubmit={handleSubmit} className="space-y-4">
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
              </div>
              {submitError && <p className="text-sm text-red-600">{submitError}</p>}
              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {submitting ? "Joining…" : "Set password & join"}
              </button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}

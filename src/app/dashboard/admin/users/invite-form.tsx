"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { INVITE_ROLES, type InviteRole } from "@/server/onboarding/schemas";

/**
 * Client half of the invite screen: posts to POST /api/invites (see
 * src/server/onboarding/invite.ts) which creates the User row (status
 * INVITED) and a token, then returns an acceptUrl. This form never lets
 * the caller choose the invited user's org — there is no org field at
 * all; the API route derives it from the session.
 */
export function InviteForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<InviteRole>(INVITE_ROLES[0]);
  const [error, setError] = useState<string | null>(null);
  const [lastInviteUrl, setLastInviteUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLastInviteUrl(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, role }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Something went wrong");
        setSubmitting(false);
        return;
      }
      setLastInviteUrl(body.acceptUrl);
      setName("");
      setEmail("");
      router.refresh();
    } catch {
      setError("Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-4"
    >
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">Name</label>
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">Email</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">Role</label>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as InviteRole)}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          {INVITE_ROLES.map((r) => (
            <option key={r} value={r}>
              {r.replace("_", " ")}
            </option>
          ))}
        </select>
      </div>
      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
      >
        {submitting ? "Sending…" : "Send invite"}
      </button>

      {error && <p className="w-full text-sm text-red-600">{error}</p>}
      {lastInviteUrl && (
        <p className="w-full text-sm text-slate-600">
          Invite created. Accept link (dev/demo — in production this is emailed):{" "}
          <a href={lastInviteUrl} className="font-medium text-brand-700 hover:underline">
            {lastInviteUrl}
          </a>
        </p>
      )}
    </form>
  );
}

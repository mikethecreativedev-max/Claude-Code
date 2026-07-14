import { getBillingInfo } from "@/server/billing/info";

// NOTE (deviation, documented per BUILD_CHECKLIST.md): this sandbox has no
// real Stripe API keys, so the Checkout/Portal buttons below post to real
// route handlers (src/app/api/admin/billing/checkout|portal/route.ts) that
// are structurally correct and RBAC-gated, but a live redirect to
// checkout.stripe.com/billing portal could not be exercised end-to-end here
// — see BUILD_CHECKLIST.md Phase 7 verification notes.
export default async function AdminBillingPage() {
  const info = await getBillingInfo();

  return (
    <main>
      <h1 className="text-2xl font-semibold">Billing</h1>

      <dl className="mt-6 space-y-2 text-sm">
        <div className="flex gap-2">
          <dt className="w-40 font-medium text-slate-600">Subscription tier</dt>
          <dd>{info.subscriptionTier}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-40 font-medium text-slate-600">Billing status</dt>
          <dd>{info.billingStatus}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-40 font-medium text-slate-600">Stripe customer on file</dt>
          <dd>{info.hasStripeCustomer ? "Yes" : "No"}</dd>
        </div>
      </dl>

      {info.isOwner ? (
        <div className="mt-6 flex gap-3">
          <form action="/api/admin/billing/checkout" method="POST">
            <button
              type="submit"
              className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
            >
              Upgrade via Stripe Checkout
            </button>
          </form>
          <form action="/api/admin/billing/portal" method="POST">
            <button
              type="submit"
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50"
            >
              Manage subscription (Customer Portal)
            </button>
          </form>
        </div>
      ) : (
        <p className="mt-6 text-sm text-slate-500">
          Only the organisation Owner can manage billing/subscription.
        </p>
      )}
    </main>
  );
}

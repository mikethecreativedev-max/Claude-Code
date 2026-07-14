import Stripe from "stripe";

/**
 * Lazily-constructed singleton Stripe client. Lazy (not module-top-level)
 * so importing this file never throws in environments without a Stripe key
 * configured (e.g. most of this test suite, which exercises webhook logic
 * without ever calling out to the real Stripe API) — the error only
 * surfaces when something actually tries to talk to Stripe.
 */
let cached: Stripe | null = null;

export function getStripeClient(): Stripe {
  if (cached) return cached;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "STRIPE_SECRET_KEY is not set. Add it to your environment before calling Stripe."
    );
  }
  cached = new Stripe(key);
  return cached;
}

/** Test-only hook to reset the cached client between fixtures. */
export function __resetStripeClientForTests() {
  cached = null;
}

/**
 * Generic append-only version-chain walker.
 *
 * Audit and Incident (and, in the sibling Risk Register / Policies work,
 * RiskEntry and Policy) never update business fields in place — an "edit"
 * creates a new row and points the OLD row's `supersededById` at it,
 * flipping `isCurrentVersion` on both. There is no explicit `groupId`
 * field tying every version of "the same conceptual record" together, so
 * the only way to reconstruct history is to walk the chain via
 * `supersededById` / its inverse relation `previousVersion`.
 *
 * This helper is deliberately model-agnostic (constrained by a small
 * structural interface) so both Audit and Incident can share one
 * implementation instead of duplicating the walk logic. It does NOT import
 * scopedDb itself — callers pass a `fetchWithLinks` closure that already
 * captures the correct scoped model, keeping this file free of any direct
 * Prisma model coupling.
 */

export interface VersionChainRow {
  id: string;
  versionNumber: number;
  isCurrentVersion: boolean;
  supersededById: string | null;
  // One level of relation data is enough per fetch; the walk re-fetches
  // at each hop rather than relying on Prisma to nest arbitrarily deep.
  previousVersion: { id: string } | null;
  supersededBy: { id: string } | null;
}

/**
 * Given ANY id that belongs to a version chain (not necessarily the
 * current version), returns every row in that chain ordered newest ->
 * oldest. Works by first walking forward via `supersededBy` to find the
 * current (latest) row, then walking backward via `previousVersion` to
 * collect the full history.
 */
export async function walkVersionChain<T extends VersionChainRow>(
  startId: string,
  fetchWithLinks: (id: string) => Promise<T | null>
): Promise<T[]> {
  // 1. Walk forward to the current/latest version.
  let latest = await fetchWithLinks(startId);
  if (!latest) return [];
  const seenForward = new Set<string>([latest.id]);
  while (latest.supersededBy?.id) {
    const next = await fetchWithLinks(latest.supersededBy.id);
    if (!next || seenForward.has(next.id)) break; // guard against a corrupt cycle
    seenForward.add(next.id);
    latest = next;
  }

  // 2. Walk backward from the latest version, collecting the full chain.
  const chain: T[] = [latest];
  const seenBackward = new Set<string>([latest.id]);
  let cursor = latest;
  while (cursor.previousVersion?.id) {
    const prev = await fetchWithLinks(cursor.previousVersion.id);
    if (!prev || seenBackward.has(prev.id)) break; // guard against a corrupt cycle
    seenBackward.add(prev.id);
    chain.push(prev);
    cursor = prev;
  }

  return chain;
}

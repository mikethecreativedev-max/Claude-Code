/**
 * APPEND-ONLY / VERSIONING PATTERN — shared walk logic.
 *
 * RiskEntry and Policy rows are never updated in place for business
 * fields (see prisma/schema.prisma header comment). An "edit" creates a
 * new row (versionNumber = old.versionNumber + 1, isCurrentVersion =
 * true), then the OLD row gets supersededById = new row's id and
 * isCurrentVersion = false.
 *
 * The forward pointer (`supersededById`) lives on the OLD row and points
 * at the NEW row. To walk the chain backwards from the current version we
 * therefore look up, at each step, "which row has supersededById equal to
 * this row's id" — that row is the previous version. This module is
 * data-layer agnostic (it takes a caller-supplied, already org-scoped
 * lookup function) so the same walk logic is reused for both RiskEntry
 * and Policy without duplicating it per model.
 */

export type VersionedRecord = {
  id: string;
  versionNumber: number;
  isCurrentVersion: boolean;
  supersededById: string | null;
};

// Defensive upper bound so a data bug (an accidental cycle) can never hang
// a request — no real version chain should ever approach this length.
const MAX_CHAIN_LENGTH = 1000;

/**
 * Returns the full version chain, newest (current) first, oldest last.
 */
export async function walkVersionChain<T extends VersionedRecord>(
  current: T,
  findPreviousVersion: (currentId: string) => Promise<T | null>
): Promise<T[]> {
  const chain: T[] = [current];
  let cursor = current;

  for (let i = 0; i < MAX_CHAIN_LENGTH; i++) {
    const previous = await findPreviousVersion(cursor.id);
    if (!previous) break;
    chain.push(previous);
    cursor = previous;
  }

  return chain;
}

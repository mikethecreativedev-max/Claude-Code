import { z } from "zod";

/**
 * Input validation for the Evidence Pack Generator's single entry point
 * (GET /api/evidence-packs, see src/app/api/evidence-packs/route.ts and
 * the selection form at src/app/dashboard/evidence-packs/page.tsx). No
 * query-string value reaches the query layer unvalidated.
 *
 * `orgId`/`siteId` are deliberately NOT accepted here: the org always
 * comes from the verified session (resolved by the route handler via
 * requireModulePermissionWithTier before this schema ever runs), never
 * from client input, per this codebase's tenant-isolation rules.
 *
 * The domain filter is encoded as a single `domain` field
 * ("ALL" | "REG_CLAUSE:<id>" | "CQC_KEY_QUESTION:<id>" | "SIX_PILLAR:<id>")
 * so the selection UI can use one plain <select>, with no client-side JS
 * required to keep two dependent fields in sync.
 */
const DOMAIN_TAXONOMIES = ["REG_CLAUSE", "CQC_KEY_QUESTION", "SIX_PILLAR"] as const;

const domainFieldSchema = z
  .string()
  .max(220)
  .default("ALL")
  .transform((raw, ctx) => {
    if (raw === "ALL" || raw === "") {
      return { taxonomy: "ALL" as const };
    }
    const sepIndex = raw.indexOf(":");
    const taxonomy = sepIndex === -1 ? raw : raw.slice(0, sepIndex);
    const value = sepIndex === -1 ? "" : raw.slice(sepIndex + 1);

    if (!(DOMAIN_TAXONOMIES as readonly string[]).includes(taxonomy) || value.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'domain must be "ALL" or "<TAXONOMY>:<id>" (REG_CLAUSE/CQC_KEY_QUESTION/SIX_PILLAR)',
      });
      return z.NEVER;
    }

    return {
      taxonomy: taxonomy as (typeof DOMAIN_TAXONOMIES)[number],
      value,
    };
  });

export const evidencePackQuerySchema = z
  .object({
    dateFrom: z.coerce.date({ errorMap: () => ({ message: "dateFrom must be a valid date" }) }),
    dateTo: z.coerce.date({ errorMap: () => ({ message: "dateTo must be a valid date" }) }),
    domain: domainFieldSchema,
  })
  .refine((data) => data.dateFrom.getTime() <= data.dateTo.getTime(), {
    message: "dateFrom must be on or before dateTo",
    path: ["dateFrom"],
  });

export type EvidencePackQuery = z.infer<typeof evidencePackQuerySchema>;

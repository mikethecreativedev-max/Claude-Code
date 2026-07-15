import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";

import { requireModulePermissionWithTier } from "@/server/rbac/tier";
import { generateEvidencePack } from "@/server/evidence-packs/service";
import { UnauthorizedError } from "@/server/auth/session";
import { ForbiddenError } from "@/server/rbac/permissions";
import { TierRequiredError } from "@/server/rbac/tier";

// pdfkit uses Node's fs/stream APIs — this route must run on the Node.js
// runtime, not the Edge runtime.
export const runtime = "nodejs";

/**
 * GET /api/evidence-packs?dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD&domain=ALL|REG_CLAUSE:<id>|CQC_KEY_QUESTION:<id>|SIX_PILLAR:<id>
 *
 * The single entry point for generating and downloading an Evidence Pack
 * as a real PDF. Runs the mandatory auth -> org -> RBAC -> tier chain
 * (requireModulePermissionWithTier) before touching any data, exactly like
 * every other paid-tier route handler in this codebase — see
 * src/server/rbac/tier.ts's own docstring for the required call shape.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await requireModulePermissionWithTier("EVIDENCE_PACKS", "view", "PAID");

    const searchParams = Object.fromEntries(request.nextUrl.searchParams.entries());
    const { pdf, filename } = await generateEvidencePack(session, searchParams);

    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(pdf.length),
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (err instanceof ForbiddenError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    if (err instanceof TierRequiredError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    if (err instanceof ZodError) {
      return NextResponse.json({ error: "Invalid input", issues: err.issues }, { status: 400 });
    }
    throw err;
  }
}

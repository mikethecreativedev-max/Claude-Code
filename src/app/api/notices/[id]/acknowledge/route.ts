import { NextResponse } from "next/server";

import { acknowledgeNotice } from "@/server/modules/notices";
import { requireModulePermission } from "@/server/rbac/permissions";
import { toErrorResponse } from "@/server/http/error-response";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    // "view" is sufficient to acknowledge — acknowledging isn't editing the
    // notice itself, it's the reader affirming they've read it. Visibility
    // (including the SPECIFIC_SITE site check) is still re-verified inside
    // acknowledgeNotice() regardless of this permission check.
    const session = await requireModulePermission("NOTICES", "view");
    const ack = await acknowledgeNotice(session, params.id);
    return NextResponse.json({ item: ack }, { status: 201 });
  } catch (err) {
    return toErrorResponse(err);
  }
}

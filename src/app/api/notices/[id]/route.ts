import { NextResponse } from "next/server";

import { getNoticeAcknowledgementStatus, requireNoticesViewSession } from "@/server/modules/notices";
import { toErrorResponse } from "@/server/http/error-response";

/** Detail view: the notice plus the "who has/hasn't acknowledged" list. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireNoticesViewSession();
    const status = await getNoticeAcknowledgementStatus(session, params.id);
    return NextResponse.json(status);
  } catch (err) {
    return toErrorResponse(err);
  }
}

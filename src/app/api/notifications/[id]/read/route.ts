import { NextResponse } from "next/server";

import { markNotificationRead, requireAuthenticatedUser } from "@/server/modules/notifications";
import { toErrorResponse } from "@/server/http/error-response";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireAuthenticatedUser();
    const updated = await markNotificationRead(session, params.id);
    return NextResponse.json({ item: updated });
  } catch (err) {
    return toErrorResponse(err);
  }
}

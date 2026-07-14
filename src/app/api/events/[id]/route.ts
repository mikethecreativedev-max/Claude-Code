import { NextResponse } from "next/server";

import { updateEvent, updateEventSchema } from "@/server/modules/events";
import { requireModulePermission } from "@/server/rbac/permissions";
import { toErrorResponse } from "@/server/http/error-response";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireModulePermission("EVENTS", "edit");
    const body = await req.json();
    const input = updateEventSchema.parse(body);
    const updated = await updateEvent(session, params.id, input);
    return NextResponse.json({ item: updated });
  } catch (err) {
    return toErrorResponse(err);
  }
}

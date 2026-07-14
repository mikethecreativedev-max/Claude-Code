import { NextResponse } from "next/server";

import { updateFeedback, updateFeedbackSchema } from "@/server/modules/feedback";
import { requireModulePermission } from "@/server/rbac/permissions";
import { toErrorResponse } from "@/server/http/error-response";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireModulePermission("FEEDBACK_COMPLAINTS", "edit");
    const body = await req.json();
    const input = updateFeedbackSchema.parse(body);
    const updated = await updateFeedback(session, params.id, input);
    return NextResponse.json({ item: updated });
  } catch (err) {
    return toErrorResponse(err);
  }
}

import { NextResponse } from "next/server";

import { updateTrainingRecord, updateTrainingRecordSchema } from "@/server/modules/training";
import { requireModulePermission } from "@/server/rbac/permissions";
import { toErrorResponse } from "@/server/http/error-response";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireModulePermission("TRAINING", "edit");
    const body = await req.json();
    const input = updateTrainingRecordSchema.parse(body);
    const updated = await updateTrainingRecord(session, params.id, input);
    return NextResponse.json({ item: updated });
  } catch (err) {
    return toErrorResponse(err);
  }
}

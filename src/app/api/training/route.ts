import { NextResponse } from "next/server";

import {
  createTrainingRecord,
  createTrainingRecordSchema,
  listTrainingRecords,
  requireTrainingViewSession,
} from "@/server/modules/training";
import { requireModulePermission } from "@/server/rbac/permissions";
import { toErrorResponse } from "@/server/http/error-response";

export async function GET() {
  try {
    const session = await requireTrainingViewSession();
    const items = await listTrainingRecords(session);
    return NextResponse.json({ items });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const session = await requireModulePermission("TRAINING", "edit");
    const body = await req.json();
    const input = createTrainingRecordSchema.parse(body);
    const created = await createTrainingRecord(session, input);
    return NextResponse.json({ item: created }, { status: 201 });
  } catch (err) {
    return toErrorResponse(err);
  }
}

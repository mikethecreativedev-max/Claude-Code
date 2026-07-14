import { NextResponse } from "next/server";

import {
  createManualCalendarTask,
  createManualCalendarTaskSchema,
  listCalendarTasksGroupedByDate,
  requireCalendarViewSession,
} from "@/server/modules/calendar";
import { requireModulePermission } from "@/server/rbac/permissions";
import { toErrorResponse } from "@/server/http/error-response";

export async function GET() {
  try {
    const session = await requireCalendarViewSession();
    const groups = await listCalendarTasksGroupedByDate(session);
    return NextResponse.json({ groups });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const session = await requireModulePermission("CALENDAR", "edit");
    const body = await req.json();
    const input = createManualCalendarTaskSchema.parse(body);
    const created = await createManualCalendarTask(session, input);
    return NextResponse.json({ item: created }, { status: 201 });
  } catch (err) {
    return toErrorResponse(err);
  }
}

import { NextResponse } from "next/server";

import {
  createEvent,
  createEventSchema,
  listEvents,
  requireEventsViewSession,
} from "@/server/modules/events";
import { requireModulePermission } from "@/server/rbac/permissions";
import { toErrorResponse } from "@/server/http/error-response";

// Events: definition pending product confirmation — see
// src/server/modules/events.ts header comment and README.md "Known open
// item: Events". This route (and its sibling under [id]) implement ONLY
// the minimal generic log described there.

export async function GET() {
  try {
    const session = await requireEventsViewSession();
    const items = await listEvents(session);
    return NextResponse.json({ items });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const session = await requireModulePermission("EVENTS", "edit");
    const body = await req.json();
    const input = createEventSchema.parse(body);
    const created = await createEvent(session, input);
    return NextResponse.json({ item: created }, { status: 201 });
  } catch (err) {
    return toErrorResponse(err);
  }
}

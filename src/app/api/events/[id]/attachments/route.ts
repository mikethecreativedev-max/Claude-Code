import { NextResponse } from "next/server";

import {
  attachToEvent,
  attachToEventSchema,
  listEventAttachments,
} from "@/server/modules/events";
import { requireModulePermission } from "@/server/rbac/permissions";
import { toErrorResponse } from "@/server/http/error-response";

// No S3 upload wiring exists in this codebase yet (README: "not yet wired
// (Phase 4+)"). This route persists attachment metadata only, matching the
// level of implementation available in this phase — see
// src/server/modules/events.ts.

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireModulePermission("EVENTS", "view");
    const items = await listEventAttachments(session, params.id);
    return NextResponse.json({ items });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireModulePermission("EVENTS", "edit");
    const body = await req.json();
    const input = attachToEventSchema.parse(body);
    const attachment = await attachToEvent(session, params.id, input);
    return NextResponse.json({ item: attachment }, { status: 201 });
  } catch (err) {
    return toErrorResponse(err);
  }
}

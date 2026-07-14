import { NextResponse } from "next/server";

import { listEventTags, tagEvent, tagEventSchema } from "@/server/modules/events";
import { requireModulePermission } from "@/server/rbac/permissions";
import { toErrorResponse } from "@/server/http/error-response";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireModulePermission("EVENTS", "view");
    const tags = await listEventTags(session, params.id);
    return NextResponse.json({ items: tags });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireModulePermission("EVENTS", "edit");
    const body = await req.json();
    const input = tagEventSchema.parse(body);
    const tag = await tagEvent(session, params.id, input.regSubClauseId);
    return NextResponse.json({ item: tag }, { status: 201 });
  } catch (err) {
    return toErrorResponse(err);
  }
}

import { NextResponse } from "next/server";

import {
  createNotice,
  createNoticeSchema,
  listVisibleNotices,
  requireNoticesViewSession,
} from "@/server/modules/notices";
import { requireModulePermission } from "@/server/rbac/permissions";
import { toErrorResponse } from "@/server/http/error-response";

export async function GET() {
  try {
    const session = await requireNoticesViewSession();
    const items = await listVisibleNotices(session);
    return NextResponse.json({ items });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const session = await requireModulePermission("NOTICES", "edit");
    const body = await req.json();
    const input = createNoticeSchema.parse(body);
    const created = await createNotice(session, input);
    return NextResponse.json({ item: created }, { status: 201 });
  } catch (err) {
    return toErrorResponse(err);
  }
}

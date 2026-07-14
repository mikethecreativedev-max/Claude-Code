import { NextResponse } from "next/server";

import { listNotifications, requireAuthenticatedUser } from "@/server/modules/notifications";
import { toErrorResponse } from "@/server/http/error-response";

// No ModuleName exists for Notifications (personal inbox items, not a
// governance module) — see src/server/modules/notifications.ts header
// comment for why this route uses requireAuth() rather than
// requireModulePermission().
export async function GET() {
  try {
    const session = await requireAuthenticatedUser();
    const items = await listNotifications(session);
    return NextResponse.json({ items });
  } catch (err) {
    return toErrorResponse(err);
  }
}

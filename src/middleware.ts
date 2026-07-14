import { withAuth } from "next-auth/middleware";

// UI-level route protection only — NOT the access-control layer. Every
// route handler and server action re-checks auth -> org -> RBAC
// server-side regardless of what this middleware does (see
// src/server/rbac/permissions.ts). This just keeps signed-out users off
// authenticated pages before a page even renders.
export default withAuth({
  pages: {
    signIn: "/login",
  },
});

export const config = {
  matcher: [
    "/",
    "/dashboard/:path*",
    "/bncl-admin/:path*",
  ],
};

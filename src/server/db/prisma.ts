import { PrismaClient } from "@prisma/client";

// This is the ONLY file allowed to construct a PrismaClient. Every other
// module that needs tenant data must go through scoped-client.ts. The
// three exceptions (NextAuth's Prisma adapter, the BNCL super-admin
// module, and this file's own re-export for scoped-client.ts to wrap) are
// enumerated in scripts/check-tenant-isolation-imports.js — that script is
// the enforcement mechanism, not this comment.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const rawPrisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = rawPrisma;
}

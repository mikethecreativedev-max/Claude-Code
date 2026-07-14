#!/usr/bin/env node
/**
 * Fails the build if anything outside the allowlist imports the raw
 * (unscoped) Prisma client. This is the automated check referenced by
 * BUILD_CHECKLIST.md Phase 1 — "Every tenant-scoped query goes through a
 * single scoped data-access layer... No raw prisma calls to tenant tables
 * anywhere else in the codebase."
 *
 * Run via `npm run check:tenant-isolation-imports`. Wire into CI.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "src");

// Files that are allowed to import rawPrisma directly:
// - scoped-client.ts itself (it wraps rawPrisma)
// - the BNCL super-admin module (the one explicitly-marked unscoped path)
// - the NextAuth adapter config (NextAuth's PrismaAdapter needs the raw
//   client by design; User/Account/Session/VerificationToken access here
//   is framework-owned, not business-logic tenant queries)
// - the RBAC permissions module (RolePermission is a global reference
//   table seeded once, identical across every org — it carries no orgId
//   and is not in scoped-client.ts's TENANT_MODELS set, so it is not a
//   tenant-isolation concern the same way business data is)
const ALLOWLIST = [
  path.join(SRC, "server", "db", "prisma.ts"),
  path.join(SRC, "server", "db", "scoped-client.ts"),
  path.join(SRC, "server", "bncl-admin", "client.ts"),
  path.join(SRC, "server", "auth", "auth.ts"),
  path.join(SRC, "server", "rbac", "permissions.ts"),
];

const IMPORT_PATTERN = /from\s+["']@\/server\/db\/prisma["']/;

/** @type {string[]} */
const violations = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath);
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      if (ALLOWLIST.includes(fullPath)) continue;
      const content = fs.readFileSync(fullPath, "utf8");
      if (IMPORT_PATTERN.test(content)) {
        violations.push(fullPath);
      }
    }
  }
}

if (fs.existsSync(SRC)) {
  walk(SRC);
}

if (violations.length > 0) {
  console.error(
    "\nTenant isolation violation: the following files import the raw " +
      "(unscoped) Prisma client directly. All tenant data access must go " +
      "through scopedDb() in src/server/db/scoped-client.ts:\n"
  );
  for (const file of violations) {
    console.error(`  - ${path.relative(ROOT, file)}`);
  }
  console.error("");
  process.exit(1);
}

console.log(
  "OK: no unscoped raw-Prisma imports found outside the allowlist " +
    `(${ALLOWLIST.length} allowlisted files).`
);

import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import EmailProvider from "next-auth/providers/email";

import { rawPrisma } from "@/server/db/prisma";

// This file is allowlisted (scripts/check-tenant-isolation-imports.js) to
// import the raw Prisma client. NextAuth's PrismaAdapter and the
// Credentials provider's login lookup necessarily run before we know which
// org a session belongs to, so they cannot go through scopedDb(). Every
// other file in this codebase must NOT do this.

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(rawPrisma),
  session: {
    // JWT strategy required (Credentials provider is incompatible with the
    // "database" session strategy), and it's what lets us embed orgId/role
    // claims directly in the token per the build spec.
    strategy: "jwt",
  },
  pages: {
    signIn: "/login",
  },
  providers: [
    CredentialsProvider({
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await rawPrisma.user.findFirst({
          where: {
            email: credentials.email.toLowerCase(),
            deletedAt: null,
            status: "ACTIVE",
          },
        });

        if (!user?.passwordHash) return null;

        const valid = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!valid) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          orgId: user.orgId,
          role: user.role,
        };
      },
    }),
    EmailProvider({
      server: {
        host: process.env.EMAIL_SERVER_HOST,
        port: Number(process.env.EMAIL_SERVER_PORT ?? 587),
        auth: {
          user: process.env.EMAIL_SERVER_USER,
          pass: process.env.EMAIL_SERVER_PASSWORD,
        },
      },
      from: process.env.EMAIL_FROM,
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const authUser = user as unknown as { orgId?: string; role?: string };
        if (authUser.orgId) token.orgId = authUser.orgId;
        if (authUser.role) token.role = authUser.role;
      } else if (token.email && (!token.orgId || !token.role)) {
        // Magic-link sign-ins hit this branch: the adapter creates the
        // session before `authorize()` runs, so orgId/role aren't on
        // `user` yet the first time. Look the user up once and cache the
        // claims on the token.
        const dbUser = await rawPrisma.user.findFirst({
          where: { email: token.email, deletedAt: null, status: "ACTIVE" },
        });
        if (dbUser) {
          token.orgId = dbUser.orgId;
          token.role = dbUser.role;
          token.sub = dbUser.id;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub as string;
        session.user.orgId = token.orgId as string;
        session.user.role = token.role as string;
      }
      return session;
    },
  },
};

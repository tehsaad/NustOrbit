import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { twoFactor } from "better-auth/plugins/two-factor";
import { db } from "@/server/db";
import { hashPassword, verifyPassword } from "@/server/crypto/password";
import { sendEmail } from "@/server/email";
import { recordAudit } from "@/server/audit";

const DAY = 60 * 60 * 24;
const idleDays = Number(process.env.SESSION_IDLE_DAYS ?? 14);
// Failed-login budget per IP per 15 minutes (raised only in automated test environments).
const signInMax = Number(process.env.AUTH_SIGNIN_RATE_MAX ?? 5);

export const auth = betterAuth({
  appName: "Orbit",
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  trustedOrigins: [process.env.BETTER_AUTH_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`].filter(
    (o): o is string => Boolean(o),
  ),
  database: prismaAdapter(db, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
    // Private deployment: the only account is created via a one-time CLI-issued claim link (see src/server/auth/bootstrap.ts).
    disableSignUp: true,
    minPasswordLength: 12,
    maxPasswordLength: 256,
    password: { hash: hashPassword, verify: verifyPassword },
    revokeSessionsOnPasswordReset: true,
    resetPasswordTokenExpiresIn: 60 * 30,
    sendResetPassword: async ({ user, url }) => {
      await sendEmail({
        to: user.email,
        subject: "Reset your Orbit password",
        text: `A password reset was requested for your Orbit account.\n\nOpen this link within 30 minutes to choose a new password:\n${url}\n\nIf you did not request this, ignore this email.`,
      });
    },
  },
  session: {
    // Rolling idle expiry: a session unused for `idleDays` expires. The absolute
    // lifetime cap is enforced in getCurrentSession() (src/server/auth/session.ts).
    expiresIn: idleDays * DAY,
    updateAge: DAY,
    // No cookie cache: every request is validated against the database so revocation is immediate.
    cookieCache: { enabled: false },
    freshAge: 60 * 15,
  },
  rateLimit: {
    enabled: true,
    storage: "database",
    window: 60,
    max: 60,
    customRules: {
      "/sign-in/email": { window: 15 * 60, max: signInMax },
      "/two-factor/verify-totp": { window: 15 * 60, max: 5 },
      "/two-factor/verify-backup-code": { window: 15 * 60, max: 5 },
      "/request-password-reset": { window: 60 * 60, max: 3 },
      "/reset-password": { window: 60 * 60, max: 5 },
      "/change-password": { window: 15 * 60, max: 5 },
    },
  },
  advanced: {
    useSecureCookies: process.env.NODE_ENV === "production",
    defaultCookieAttributes: { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" },
    ipAddress: { ipAddressHeaders: ["x-vercel-forwarded-for", "x-forwarded-for", "x-real-ip"] },
  },
  databaseHooks: {
    session: {
      create: {
        after: async (session) => {
          await recordAudit({ userId: session.userId, action: "auth.session.created", ip: session.ipAddress ?? null, userAgent: session.userAgent ?? null });
        },
      },
    },
  },
  plugins: [twoFactor({ issuer: "Orbit" }), nextCookies()],
});

export type AuthSession = typeof auth.$Infer.Session;

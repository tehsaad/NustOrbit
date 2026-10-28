import type { Metadata } from "next";
import { Monitor, Smartphone } from "lucide-react";
import { requireUser, getCurrentSession } from "@/server/auth/session";
import { db } from "@/server/db";
import { getPrefs } from "@/server/prefs";
import { PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";
import { Button } from "@/components/ui/button";
import { ConfirmAction } from "@/components/forms";
import { revokeOtherSessions, revokeSession } from "@/server/actions/security";
import { fmtDateTime } from "@/lib/format";
import { PasswordForm, TwoFactorPanel } from "./security-client";

export const metadata: Metadata = { title: "Security" };

function describeAgent(ua: string | null) {
  if (!ua) return "Unknown device";
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "";
  return `${browser}${os ? ` on ${os}` : ""}`;
}

export default async function SecurityPage() {
  const user = await requireUser();
  const current = await getCurrentSession();
  const { timezone: tz } = await getPrefs(user.id);
  const [sessions, audit, me] = await Promise.all([
    db.session.findMany({ where: { userId: user.id, expiresAt: { gt: new Date() } }, orderBy: { updatedAt: "desc" }, select: { id: true, createdAt: true, updatedAt: true, expiresAt: true, ipAddress: true, userAgent: true } }),
    db.auditEvent.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 25 }),
    db.user.findUnique({ where: { id: user.id }, select: { twoFactorEnabled: true } }),
  ]);
  const absoluteDays = Number(process.env.SESSION_ABSOLUTE_DAYS ?? 60);
  const idleDays = Number(process.env.SESSION_IDLE_DAYS ?? 14);

  return (
    <div className="space-y-6">
      <PageHeader title="Security" description={`Sessions expire after ${idleDays} days without use and ${absoluteDays} days after sign-in, whichever comes first.`} />

      <SectionCard
        title="Active sessions"
        action={
          sessions.length > 1 ? (
            <ConfirmAction
              action={revokeOtherSessions}
              hidden={{}}
              title="Sign out everywhere else?"
              description="Every other browser and device will be signed out immediately."
              confirmLabel="Sign out others"
              trigger={
                <Button size="sm" variant="outline">
                  Sign out other sessions
                </Button>
              }
            />
          ) : undefined
        }
      >
        <ul className="divide-y">
          {sessions.map((s) => {
            const isCurrent = s.id === current?.session.id;
            const Icon = /Android|iPhone|Mobile/.test(s.userAgent ?? "") ? Smartphone : Monitor;
            return (
              <li key={s.id} className="flex items-center gap-3 py-3">
                <Icon className="size-5 text-muted-foreground" aria-hidden="true" />
                <div className="min-w-0 flex-1 text-sm">
                  <p className="font-medium">
                    {describeAgent(s.userAgent)} {isCurrent ? <span className="ml-1 rounded bg-primary/15 px-1.5 py-0.5 text-[10px] text-primary">This device</span> : null}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Signed in {fmtDateTime(s.createdAt, tz)} · last active {fmtDateTime(s.updatedAt, tz)}
                    {s.ipAddress ? ` · ${s.ipAddress}` : ""}
                  </p>
                </div>
                {!isCurrent ? (
                  <ConfirmAction
                    action={revokeSession}
                    hidden={{ id: s.id }}
                    title="Revoke this session?"
                    description="That device will be signed out on its next request."
                    confirmLabel="Revoke"
                    trigger={
                      <Button size="sm" variant="ghost">
                        Revoke
                      </Button>
                    }
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      </SectionCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Password">
          <PasswordForm />
        </SectionCard>
        <SectionCard title="Two-step verification (TOTP)">
          <TwoFactorPanel enabled={Boolean(me?.twoFactorEnabled)} />
        </SectionCard>
      </div>

      <SectionCard title="Recent security activity">
        {audit.length === 0 ? (
          <p className="text-sm text-muted-foreground">No activity recorded yet.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {audit.map((a) => (
              <li key={a.id} className="flex flex-wrap gap-x-3">
                <span className="font-mono text-xs text-muted-foreground">{fmtDateTime(a.createdAt, tz)}</span>
                <span>{a.action}</span>
                {a.targetId ? <span className="text-muted-foreground">{a.targetType}:{a.targetId.slice(0, 24)}</span> : null}
                {a.ip ? <span className="text-xs text-muted-foreground">{a.ip}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}

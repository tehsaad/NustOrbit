import type { Metadata } from "next";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { PROVIDERS } from "@/server/integrations/registry";
import { QALAM_TEMPLATES } from "@/server/integrations/providers/qalam";
import { lmsAllowedHosts } from "@/server/integrations/providers/lms";
import { emailConfigured, googleConfigured, pushConfigured } from "@/server/env";
import { PageHeader } from "@/components/page-header";
import { IntegrationCard } from "./integration-card";

// Interactive LMS sync makes many web-service calls over a slow host.
export const maxDuration = 120;

export const metadata: Metadata = { title: "Integrations" };

export default async function IntegrationsPage({ searchParams }: { searchParams: Promise<{ connected?: string; error?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const [connections, runs, pushDevices] = await Promise.all([
    db.integrationConnection.findMany({ where: { userId: user.id }, include: { credentials: { select: { kind: true, updatedAt: true } } } }),
    db.syncRun.findMany({ where: { userId: user.id }, orderBy: { startedAt: "desc" }, take: 30 }),
    db.pushSubscription.count({ where: { userId: user.id } }),
  ]);
  const env = { google: googleConfigured(), push: pushConfigured(), email: emailConfigured() };

  const groups: { title: string; ids: string[] }[] = [
    { title: "University", ids: ["lms", "qalam"] },
    { title: "Google", ids: ["google-calendar", "gmail", "google-tasks", "google-keep"] },
    { title: "Notifications & devices", ids: ["web-push", "email", "android-companion"] },
  ];

  return (
    <div>
      <PageHeader title="Integrations" description="Every source Orbit can use, what it can access, and how fresh its data is. Credentials are encrypted on the server and never sent to your browser." />
      {sp.connected ? <p className="mb-4 rounded-lg border border-success/40 bg-success/10 px-3 py-2 text-sm">Connected {PROVIDERS.find((p) => p.id === sp.connected)?.name ?? sp.connected}.</p> : null}
      {sp.error ? (
        <p className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm" role="alert">
          {sp.error.slice(0, 300)}
        </p>
      ) : null}
      <div className="space-y-8">
        {groups.map((g) => (
          <section key={g.title}>
            <h2 className="mb-3 text-sm font-semibold text-muted-foreground">{g.title}</h2>
            <div className="grid gap-4 lg:grid-cols-2">
              {g.ids.map((id) => {
                const def = PROVIDERS.find((p) => p.id === id)!;
                const conn = connections.find((c) => c.provider === id);
                return (
                  <IntegrationCard
                    key={id}
                    def={def}
                    env={env}
                    pushDevices={pushDevices}
                    lmsHost={lmsAllowedHosts()[0]}
                    qalamTemplates={QALAM_TEMPLATES}
                    connection={
                      conn
                        ? {
                            status: conn.status,
                            accountLabel: conn.accountLabel,
                            grantedScopes: conn.grantedScopes,
                            lastSuccessAt: conn.lastSuccessAt?.toISOString() ?? null,
                            lastSyncAt: conn.lastSyncAt?.toISOString() ?? null,
                            lastError: conn.lastError,
                            credentialKinds: conn.credentials.map((c) => c.kind),
                            config: (conn.config as Record<string, unknown> | null) ?? null,
                          }
                        : null
                    }
                    runs={runs
                      .filter((r) => r.provider === id)
                      .slice(0, 5)
                      .map((r) => ({ id: r.id, status: r.status, trigger: r.trigger, startedAt: r.startedAt.toISOString(), created: r.created, updated: r.updated, error: r.error }))}
                  />
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { CheckCircle2, CircleDashed, Download, KeyRound, Link2, RefreshCw, ShieldAlert, Unplug, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FormDialog, SelectField, SubmitButton, TextField, useFormAction } from "@/components/forms";
import { connectLmsFeed, connectLmsToken, disconnectIntegration, importLmsIcsFile, importQalam, startGoogleConnect, syncNow } from "@/server/actions/integrations";
import type { ProviderDefinition } from "@/server/integrations/registry";
import { freshness } from "@/domain/freshness";
import { cn } from "@/lib/utils";
import { PushToggle } from "@/components/push-toggle";

type Conn = {
  status: string;
  accountLabel: string | null;
  grantedScopes: string[];
  lastSuccessAt: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
  credentialKinds: string[];
  config: Record<string, unknown> | null;
};

type Run = { id: string; status: string; trigger: string; startedAt: string; created: number; updated: number; error: string | null };

const AVAIL: Record<string, { label: string; className: string }> = {
  available: { label: "Available", className: "bg-success/15 text-success" },
  "needs-configuration": { label: "Needs server config", className: "bg-warning/15 text-warning" },
  "import-only": { label: "Import only", className: "bg-chart-2/15 text-chart-2" },
  planned: { label: "Planned", className: "bg-muted text-muted-foreground" },
  "not-available": { label: "Not available", className: "bg-muted text-muted-foreground" },
};

function StatusLine({ conn }: { conn: Conn | null }) {
  if (!conn || conn.status === "DISCONNECTED") {
    if (conn?.lastSuccessAt) return <span className="text-xs text-muted-foreground">Last import {freshness(new Date(conn.lastSuccessAt), new Date()).label.replace("Synced ", "")}</span>;
    return <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><CircleDashed className="size-3.5" /> Not connected</span>;
  }
  if (conn.status === "NEEDS_REAUTH") return <span className="flex items-center gap-1.5 text-xs text-destructive"><ShieldAlert className="size-3.5" /> Needs reconnecting — sync paused</span>;
  if (conn.status === "ERROR") return <span className="flex items-center gap-1.5 text-xs text-destructive"><ShieldAlert className="size-3.5" /> Last sync failed</span>;
  const f = freshness(conn.lastSuccessAt ? new Date(conn.lastSuccessAt) : null, new Date());
  return <span className="flex items-center gap-1.5 text-xs text-success"><CheckCircle2 className="size-3.5" /> Connected · {f.label}</span>;
}

function DisconnectButton({ provider, purgeLabel }: { provider: string; purgeLabel?: string }) {
  return (
    <FormDialog
      trigger={
        <Button variant="ghost" size="sm">
          <Unplug /> Disconnect
        </Button>
      }
      title="Disconnect integration"
      description="Stored credentials are deleted (and revoked at Google for Google services). Synchronization stops."
      action={disconnectIntegration}
      submitLabel="Disconnect"
    >
      {() => (
        <>
          <input type="hidden" name="provider" value={provider} />
          {purgeLabel ? (
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="purge" className="mt-0.5 size-4" />
              <span>{purgeLabel}</span>
            </label>
          ) : null}
        </>
      )}
    </FormDialog>
  );
}

function SyncButton({ provider }: { provider: string }) {
  const { onSubmit, pending } = useFormAction(syncNow);
  return (
    <form onSubmit={onSubmit}>
      <input type="hidden" name="provider" value={provider} />
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        <RefreshCw className={cn(pending && "animate-spin")} /> Sync now
      </Button>
    </form>
  );
}

export function IntegrationCard({
  def,
  connection,
  runs,
  env,
  pushDevices,
  lmsHost,
  qalamTemplates,
}: {
  def: ProviderDefinition;
  connection: Conn | null;
  runs: Run[];
  env: { google: boolean; push: boolean; email: boolean };
  pushDevices: number;
  lmsHost: string;
  qalamTemplates: Record<string, { columns: string[]; example: string; help: string }>;
}) {
  const avail = def.availability === "needs-configuration" && ((def.category === "google" && env.google) || (def.id === "email" && env.email)) ? "available" : def.availability;
  const a = AVAIL[avail];
  const connected = connection && connection.status !== "DISCONNECTED";

  return (
    <article className="flex flex-col rounded-xl border bg-card p-4 shadow-xs">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">{def.name}</h3>
            <span className={cn("rounded-md px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide", a.className)}>{a.label}</span>
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">{def.description}</p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1">
        {def.capabilities.map((c) => (
          <Badge key={c} variant="outline" className="text-[10px] font-normal">
            {c}
          </Badge>
        ))}
      </div>

      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{def.note}</p>

      {def.scopes?.length ? (
        <details className="mt-2 text-xs">
          <summary className="cursor-pointer text-muted-foreground">Permissions requested</summary>
          <ul className="mt-1 space-y-1">
            {def.scopes.map((s) => (
              <li key={s.scope}>
                <code className="text-[10px]">{s.scope.replace("https://www.googleapis.com/auth/", "")}</code>
                {s.sensitive ? <span className="ml-1 text-warning">(sensitive)</span> : null} — {s.reason}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <div className="mt-4 border-t pt-3">
        {def.id === "web-push" ? (
          <div className="space-y-2">
            <span className="text-xs text-muted-foreground">{pushDevices} device{pushDevices === 1 ? "" : "s"} registered</span>
            <PushToggle configured={env.push} />
          </div>
        ) : def.id === "email" ? (
          <span className="text-xs text-muted-foreground">{env.email ? "Configured. Choose the Email channel when creating reminders." : "Not configured on this deployment."}</span>
        ) : (
          <>
            <StatusLine conn={connection} />
            {connection?.accountLabel && connected ? <p className="mt-1 text-xs text-muted-foreground">Account: {connection.accountLabel}</p> : null}
            {connection?.lastError ? (
              <p className="mt-1 text-xs text-destructive" role="alert">
                {connection.lastError}
              </p>
            ) : null}
          </>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          {def.id === "lms" ? (
            <>
              <FormDialog
                trigger={
                  <Button size="sm" variant={connected ? "outline" : "default"}>
                    <Link2 /> {connected ? "Replace link" : "Connect calendar link"}
                  </Button>
                }
                title="Connect NUST LMS calendar"
                description="In the LMS open Calendar → Export calendar, choose “All events” and “Recent and next 60 days”, then click “Get calendar URL”. Paste that link here. It is stored encrypted and only used to read your calendar."
                action={connectLmsFeed}
                submitLabel="Save & sync"
              >
                {(s) => <TextField label="Calendar export URL" name="url" type="url" required placeholder={`https://${lmsHost}/calendar/export_execute.php?…`} state={s} autoComplete="off" />}
              </FormDialog>
              <FormDialog
                trigger={
                  <Button size="sm" variant="outline">
                    <Upload /> Import .ics
                  </Button>
                }
                title="Import an LMS calendar file"
                description="Export your calendar from the LMS as an .ics file and upload it. Re-importing updates existing items instead of duplicating them."
                action={importLmsIcsFile}
                submitLabel="Import"
              >
                {() => <input type="file" name="file" accept=".ics,text/calendar" required className="text-sm" />}
              </FormDialog>
              <FormDialog
                trigger={
                  <Button size="sm" variant="ghost">
                    <KeyRound /> Web-service token
                  </Button>
                }
                title="Moodle web-service token (advanced)"
                description="Only if the LMS shows Preferences → Security keys with a “Moodle mobile web service” key. That key lets Orbit read courses, assignments, submission status and grades. Never paste your LMS password."
                action={connectLmsToken}
                submitLabel="Verify & sync"
              >
                {(s) => <TextField label="Token (32 characters)" name="token" required autoComplete="off" state={s} />}
              </FormDialog>
              {connected ? <SyncButton provider="lms" /> : null}
              {connection ? <DisconnectButton provider="lms" purgeLabel="Also delete everything imported from the LMS" /> : null}
            </>
          ) : def.id === "qalam" ? (
            <>
              <FormDialog
                trigger={
                  <Button size="sm">
                    <Upload /> Import CSV
                  </Button>
                }
                title="Import Qalam data"
                description="Prepare a CSV from your own Qalam pages using the column layout below. Imported rows are labelled “Imported”."
                action={importQalam}
                submitLabel="Import"
                wide
              >
                {(s) => (
                  <>
                    <SelectField
                      label="Data type"
                      name="kind"
                      state={s}
                      options={[
                        { value: "marks", label: "Marks / assessments" },
                        { value: "attendance", label: "Attendance" },
                        { value: "timetable", label: "Timetable" },
                        { value: "results", label: "Semester results" },
                      ]}
                    />
                    <div className="space-y-2 rounded-lg bg-muted/50 p-3 text-xs">
                      {Object.entries(qalamTemplates).map(([k, t]) => (
                        <div key={k}>
                          <p className="font-medium capitalize">{k}</p>
                          <code className="block break-all">{t.columns.join(",")}</code>
                          <code className="block break-all text-muted-foreground">{t.example}</code>
                          <p className="text-muted-foreground">{t.help}</p>
                        </div>
                      ))}
                    </div>
                    <input type="file" name="file" accept=".csv,text/csv" required className="text-sm" />
                  </>
                )}
              </FormDialog>
              {connection ? <DisconnectButton provider="qalam" purgeLabel="Also delete all rows imported from files" /> : null}
            </>
          ) : def.category === "google" && def.methods.includes("oauth") && def.availability !== "planned" ? (
            env.google ? (
              <>
                <form action={startGoogleConnect}>
                  <input type="hidden" name="provider" value={def.id} />
                  <SubmitButton pending={false}>{connected ? (connection?.status === "NEEDS_REAUTH" ? "Reconnect" : "Reauthorize") : `Connect ${def.name}`}</SubmitButton>
                </form>
                {connected && connection?.status !== "NEEDS_REAUTH" ? <SyncButton provider={def.id} /> : null}
                {def.id === "gmail" && connected ? (
                  <Button asChild size="sm" variant="outline">
                    <Link href="/integrations/gmail">Inbox insights</Link>
                  </Button>
                ) : null}
                {connection ? <DisconnectButton provider={def.id} purgeLabel={def.id === "google-calendar" ? "Also remove Google events copied into Orbit" : undefined} /> : null}
              </>
            ) : (
              <p className="text-xs text-muted-foreground">Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET on the server to enable. See docs/integrations.md.</p>
            )
          ) : def.id === "android-companion" ? (
            <Button asChild size="sm" variant="outline">
              <a href="/api/export/ics">
                <Download /> Download upcoming .ics (with alerts)
              </a>
            </Button>
          ) : null}
        </div>
      </div>

      {runs.length ? (
        <details className="mt-3 text-xs">
          <summary className="cursor-pointer text-muted-foreground">Sync history</summary>
          <ul className="mt-2 space-y-1">
            {runs.map((r) => (
              <li key={r.id} className="flex gap-2">
                <span className={cn("font-medium", r.status === "FAILED" ? "text-destructive" : r.status === "SUCCESS" ? "text-success" : "text-muted-foreground")}>{r.status}</span>
                <span className="text-muted-foreground">
                  {new Date(r.startedAt).toLocaleString()} · {r.trigger}
                  {r.status !== "FAILED" ? ` · +${r.created} / ~${r.updated}` : ""}
                </span>
                {r.error ? <span className="truncate text-destructive">{r.error}</span> : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </article>
  );
}

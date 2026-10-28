import type { Metadata } from "next";
import Link from "next/link";
import { Download, Shield } from "lucide-react";
import { requireUser } from "@/server/auth/session";
import { getPrefs } from "@/server/prefs";
import { PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";
import { Button } from "@/components/ui/button";
import { PreferencesForm } from "./preferences-form";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireUser();
  const prefs = await getPrefs(user.id);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/settings/security">
              <Shield /> Security & sessions
            </Link>
          </Button>
        }
      />
      <SectionCard title="Preferences">
        <PreferencesForm
          prefs={{
            timezone: prefs.timezone,
            attendanceThresholdPct: prefs.attendanceThresholdPct,
            attendancePolicyNote: prefs.attendancePolicyNote,
            attendanceLateAs: prefs.attendanceLateAs,
            attendanceLeaveAs: prefs.attendanceLeaveAs,
            defaultTargetPct: prefs.defaultTargetPct,
            weekStartsOn: prefs.weekStartsOn,
            defaultReminderMinutes: prefs.defaultReminderMinutes,
            notifyPush: prefs.notifyPush,
            notifyEmail: prefs.notifyEmail,
          }}
        />
      </SectionCard>
      <SectionCard title="Your data">
        <p className="mb-3 text-sm text-muted-foreground">Download everything Orbit stores for you. Integration credentials are never included.</p>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <a href="/api/export/backup">
              <Download /> Full backup (JSON)
            </a>
          </Button>
          <Button asChild variant="outline" size="sm">
            <a href="/api/export/backup?scope=notes&format=md">
              <Download /> Notes (Markdown)
            </a>
          </Button>
          <Button asChild variant="outline" size="sm">
            <a href="/api/export/ics">
              <Download /> Upcoming items (.ics)
            </a>
          </Button>
        </div>
      </SectionCard>
      <p className="text-xs text-muted-foreground">Orbit is an independent student-built tool and is not an official NUST application.</p>
    </div>
  );
}

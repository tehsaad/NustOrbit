import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { requireUser } from "@/server/auth/session";
import { PageHeader } from "@/components/page-header";
import { QALAM_TEMPLATES } from "@/server/integrations/providers/qalam";
import { QALAM_BOOKMARKLET, QALAM_BOOKMARKLET_SOURCE } from "@/lib/qalam-bookmarklet";
import { QalamExportHelper } from "./export-helper";
import { ExtensionPairing } from "./extension-pairing";

export const metadata: Metadata = { title: "Export from Qalam" };

export default async function QalamExportPage() {
  await requireUser();
  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/integrations" className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline">
        <ArrowLeft className="size-3.5" /> Integrations
      </Link>
      <PageHeader
        title="Get your Qalam data into Orbit"
        description="Qalam has no student API and blocks automated sign-in, so Orbit never asks for your Qalam password. Instead, export your data from your own logged-in Qalam tab and import it here."
      />

      <div className="mb-6 flex items-start gap-2 rounded-lg border border-success/40 bg-success/5 p-3 text-sm">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
        <p className="text-muted-foreground">
          The export tool runs <span className="text-foreground">in your browser, in your own Qalam session</span>. It reads only what the page is already showing you, makes no
          network requests, and never sees your password. You can read its full source below before using it.
        </p>
      </div>

      <section className="mb-8">
        <h2 className="text-sm font-semibold">Option A — Browser extension (recommended)</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          The Orbit extension reads the Qalam page you have open and sends it straight to your account — no CSV editing. It runs in your own logged-in browser, never sees your
          password, and only reads a page when you click <span className="text-foreground">Read this page</span>.
        </p>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
          <li>
            Load the extension from the <code>extension/</code> folder of your Orbit project (Chrome → <code>chrome://extensions</code> → Developer mode → Load unpacked). Full steps
            are in <code>extension/README.md</code>.
          </li>
          <li>Create a pairing token below and paste it, with your Orbit URL, into the extension.</li>
          <li>In Qalam, open a page (marks, attendance, timetable, results), click the extension, review the rows, and send.</li>
        </ol>
        <ExtensionPairing />
        <p className="mt-3 text-xs text-muted-foreground">
          The column aliases are still being calibrated to Qalam&apos;s real layout. If a page reads but the columns look wrong, the mapping is shown for review before anything is
          sent — tell Orbit what you see (or share redacted page HTML) and the adapter will be tuned.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold">Option B — Bookmarklet + CSV (no install)</h2>
        <p className="mb-3 mt-1 text-sm text-muted-foreground">Prefer not to install anything? Export a CSV from your Qalam tab and import it.</p>
        <QalamExportHelper bookmarklet={QALAM_BOOKMARKLET} source={QALAM_BOOKMARKLET_SOURCE} />
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold">Then import it</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
          <li>Open the downloaded CSV. Keep the one table you want (marks, attendance, timetable or results) and delete the others.</li>
          <li>Rename its header row to match the Orbit columns for that type (below), then save.</li>
          <li>
            Go to <Link href="/integrations" className="text-primary hover:underline">Integrations → Qalam → Import CSV</Link>, pick the data type, and upload. Re-importing updates
            rows instead of duplicating them.
          </li>
        </ol>
        <div className="mt-3 space-y-2 rounded-lg bg-muted/50 p-3 text-xs">
          {Object.entries(QALAM_TEMPLATES).map(([k, t]) => (
            <div key={k}>
              <p className="font-medium capitalize">{k}</p>
              <code className="block break-all">{t.columns.join(",")}</code>
              <p className="text-muted-foreground">{t.help}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Marks and attendance imported this way are labelled <span className="font-medium">Imported</span> in Orbit, and submission status is never inferred from a file.
        </p>
      </section>
    </div>
  );
}

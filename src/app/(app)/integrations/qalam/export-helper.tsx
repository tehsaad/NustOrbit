"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

export function QalamExportHelper({ bookmarklet, source }: { bookmarklet: string; source: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(bookmarklet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked; user can copy the source manually below */
    }
  }

  return (
    <section>
      <h2 className="text-sm font-semibold">1. Create the export bookmark</h2>
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
        <li>Copy the bookmarklet code, then add a new bookmark in your browser and paste it as the URL (name it &ldquo;Export Qalam&rdquo;).</li>
        <li>
          On desktop: show the bookmarks bar (Ctrl/Cmd+Shift+B), right-click it → Add page, paste as URL.
        </li>
      </ol>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={copy}>
          {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy bookmarklet"}
        </Button>
        <span className="text-xs text-muted-foreground">then paste it as a new bookmark&apos;s URL</span>
      </div>
      <details className="mt-3 text-xs">
        <summary className="cursor-pointer text-muted-foreground">Read the full source (recommended before running anything)</summary>
        <pre className="mt-2 max-h-72 overflow-auto rounded-lg bg-muted p-3 font-mono text-[11px] leading-relaxed">{source}</pre>
      </details>

      <h2 className="mt-6 text-sm font-semibold">2. Export</h2>
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
        <li>Sign in to Qalam and open the page that shows the data you want (e.g. your marks, or attendance).</li>
        <li>Click the &ldquo;Export Qalam&rdquo; bookmark. It downloads a CSV of the tables on that page.</li>
      </ol>
    </section>
  );
}

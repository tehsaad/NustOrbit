import type { Metadata } from "next";
import Link from "next/link";
import { userCount } from "@/server/auth/setup";
import { SetupForm } from "./setup-form";

export const metadata: Metadata = { title: "Setup" };
export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const done = (await userCount()) > 0;
  const configured = Boolean(process.env.SETUP_TOKEN);
  return (
    <div className="rounded-2xl border bg-card p-6 shadow-sm">
      {done ? (
        <div className="text-sm">
          <p className="font-medium">Setup is complete.</p>
          <p className="mt-1 text-muted-foreground">This deployment already has its administrator. Registration is disabled.</p>
          <Link href="/sign-in" className="mt-4 inline-flex text-primary hover:underline">
            Sign in →
          </Link>
        </div>
      ) : !configured ? (
        <div className="text-sm">
          <p className="font-medium">Setup token not configured</p>
          <p className="mt-1 text-muted-foreground">Set the SETUP_TOKEN environment variable on the server, then reload this page.</p>
        </div>
      ) : (
        <>
          <h2 className="font-medium">Create your account</h2>
          <p className="mt-1 text-sm text-muted-foreground">One-time private setup. You need the SETUP_TOKEN from your deployment&apos;s environment.</p>
          <SetupForm />
        </>
      )}
    </div>
  );
}

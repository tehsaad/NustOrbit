import type { Metadata } from "next";
import Link from "next/link";
import { userCount } from "@/server/auth/bootstrap";
import { ClaimForm } from "./claim-form";

export const metadata: Metadata = { title: "Create your account" };
export const dynamic = "force-dynamic";

export default async function ClaimPage() {
  const done = (await userCount()) > 0;
  return (
    <div className="rounded-2xl border bg-card p-6 shadow-sm">
      {done ? (
        <div className="text-sm">
          <p className="font-medium">Setup is complete.</p>
          <p className="mt-1 text-muted-foreground">This Orbit already has its account. Registration is disabled.</p>
          <Link href="/sign-in" className="mt-4 inline-flex text-primary hover:underline">
            Sign in →
          </Link>
        </div>
      ) : (
        <ClaimForm />
      )}
    </div>
  );
}

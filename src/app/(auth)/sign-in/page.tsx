import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/server/auth/session";
import { userCount } from "@/server/auth/setup";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage() {
  if (await getCurrentSession()) redirect("/");
  const needsSetup = (await userCount()) === 0;
  return (
    <div className="rounded-2xl border bg-card p-6 shadow-sm">
      {needsSetup ? (
        <div className="text-sm">
          <p className="font-medium">Orbit hasn&apos;t been set up yet.</p>
          <p className="mt-1 text-muted-foreground">Create the administrator account with your setup token.</p>
          <Link href="/setup" className="mt-4 inline-flex text-primary underline-offset-4 hover:underline">
            Go to setup →
          </Link>
        </div>
      ) : (
        <SignInForm />
      )}
    </div>
  );
}

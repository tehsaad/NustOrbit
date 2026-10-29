import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/server/auth/session";
import { userCount } from "@/server/auth/bootstrap";
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
          <p className="mt-1 text-muted-foreground">
            The account is created from a one-time setup link. Open the link you were sent, or generate one with <code className="text-xs">npm run admin:invite</code>.
          </p>
        </div>
      ) : (
        <SignInForm />
      )}
    </div>
  );
}

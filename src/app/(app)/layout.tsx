import { requireUser } from "@/server/auth/session";
import { AppShell } from "@/components/shell/app-shell";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return <AppShell user={{ name: user.name, email: user.email }}>{children}</AppShell>;
}

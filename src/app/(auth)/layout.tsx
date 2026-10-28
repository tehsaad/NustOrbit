import { OrbitMark } from "@/components/shell/orbit-mark";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden px-4 py-10">
      <div aria-hidden="true" className="pointer-events-none absolute -top-40 left-1/2 size-[36rem] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
      <div className="relative w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <OrbitMark className="size-11" />
          <h1 className="mt-3 text-xl font-semibold tracking-tight">Orbit</h1>
          <p className="text-sm text-muted-foreground">Everything in sync. Nothing forgotten.</p>
        </div>
        {children}
        <p className="mt-8 text-center text-xs text-muted-foreground">An independent student-built tool. Not an official NUST application.</p>
      </div>
    </div>
  );
}

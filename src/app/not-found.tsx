import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-2 p-6 text-center">
      <p className="text-sm text-muted-foreground">404</p>
      <h1 className="text-xl font-semibold">This page drifted out of orbit</h1>
      <Link href="/" className="text-sm text-primary hover:underline">
        Back to overview
      </Link>
    </div>
  );
}

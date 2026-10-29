"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { NAV, isActive } from "./nav";
import { OrbitMark } from "./orbit-mark";
import { CommandPalette, openCommandPalette } from "./command-palette";
import { UserMenu } from "./user-menu";

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="flex flex-col gap-0.5">
      {NAV.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
            )}
          >
            <item.icon className={cn("size-4", active && "text-primary")} aria-hidden="true" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function AppShell({ user, children }: { user: { name: string; email: string }; children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const mobileItems = NAV.filter((n) => n.mobile);

  return (
    <div className="flex min-h-dvh">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground">
        Skip to content
      </a>
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r bg-sidebar px-3 py-4 lg:flex">
        <Link href="/" className="mb-5 flex items-center gap-2.5 px-2">
          <OrbitMark />
          <div className="leading-tight">
            <div className="font-semibold tracking-tight">Orbit</div>
            <div className="text-[11px] text-muted-foreground">Everything in sync</div>
          </div>
        </Link>
        <button
          type="button"
          onClick={openCommandPalette}
          className="mb-4 flex items-center gap-2 rounded-lg border bg-background/50 px-3 py-1.5 text-sm text-muted-foreground hover:bg-background"
        >
          <Search className="size-4" aria-hidden="true" />
          <span className="flex-1 text-left">Search</span>
          <kbd className="rounded border px-1.5 font-mono text-[10px]">⌘K</kbd>
        </button>
        <div className="flex-1 overflow-y-auto">
          <NavLinks />
        </div>
        <div className="mt-3 border-t pt-3">
          <UserMenu user={user} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-2 border-b bg-background/85 px-4 py-2.5 backdrop-blur lg:hidden">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Open navigation">
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 bg-sidebar p-4">
              <SheetHeader className="p-0 pb-4">
                <SheetTitle className="flex items-center gap-2">
                  <OrbitMark className="size-6" /> Orbit
                </SheetTitle>
              </SheetHeader>
              <NavLinks onNavigate={() => setOpen(false)} />
              <div className="mt-4 border-t pt-3">
                <UserMenu user={user} />
              </div>
            </SheetContent>
          </Sheet>
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <OrbitMark className="size-6" /> Orbit
          </Link>
          <Button variant="ghost" size="icon" className="ml-auto" aria-label="Search" onClick={openCommandPalette}>
            <Search />
          </Button>
        </header>

        <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 pb-24 pt-5 sm:px-6 lg:px-8 lg:pb-10 lg:pt-8">
          {children}
        </main>

        <nav aria-label="Quick" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
          {mobileItems.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn("flex flex-col items-center gap-0.5 py-2 text-[11px]", active ? "text-primary" : "text-muted-foreground")}
              >
                <item.icon className="size-5" aria-hidden="true" />
                {item.label}
              </Link>
            );
          })}
          <button type="button" onClick={() => setOpen(true)} className="flex flex-col items-center gap-0.5 py-2 text-[11px] text-muted-foreground">
            <Menu className="size-5" aria-hidden="true" />
            More
          </button>
        </nav>
      </div>
      <CommandPalette />
    </div>
  );
}

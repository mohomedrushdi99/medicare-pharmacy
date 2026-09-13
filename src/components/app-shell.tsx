import { Link, useRouterState } from "@tanstack/react-router";
import {
  FileText,
  LayoutDashboard,
  Menu,
  Package,
  Receipt,
  Settings,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { UserButton } from "@/lib/auth/gates";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { cn } from "@/lib/utils";
import { PharmacyMark } from "@/components/pharmacy-mark";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useWorkspace } from "@/components/workspace-provider";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/inventory", label: "Inventory", icon: Package },
  { to: "/billing", label: "Billing", icon: Receipt },
  { to: "/invoices", label: "Invoices", icon: FileText },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

function NavLinks({
  compact,
  onNavigate,
}: {
  compact?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav className="flex flex-1 flex-col gap-1 px-3">
      {NAV.map((item) => {
        const active =
          item.to === "/"
            ? pathname === "/"
            : pathname === item.to || pathname.startsWith(`${item.to}/`);
        const Icon = item.icon;
        return (
          <Link
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
              compact && "justify-center px-0",
              active
                ? "bg-white/10 text-white"
                : "text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground",
            )}
            aria-current={active ? "page" : undefined}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {compact ? <span className="sr-only">{item.label}</span> : item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function Brand({ compact }: { compact?: boolean }) {
  const settings = useWorkspace();
  return (
    <div className={cn("flex items-center gap-3 px-4 py-5", compact && "justify-center px-2")}>
      <div className="text-primary">
        <PharmacyMark className="h-9 w-9" />
      </div>
      {compact ? (
        <span className="sr-only">{settings.appName}</span>
      ) : (
        <div className="min-w-0">
          <p className="truncate font-display text-base font-semibold tracking-tight text-sidebar-foreground">
            {settings.appName}
          </p>
          <p className="truncate text-xs text-sidebar-muted">{settings.subtitle || "Pharmacy"}</p>
        </div>
      )}
    </div>
  );
}

function SidebarBody({ compact, onNavigate }: { compact?: boolean; onNavigate?: () => void }) {
  const user = useCurrentUser();
  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <Brand compact={compact} />
      <NavLinks compact={compact} onNavigate={onNavigate} />
      <div className="mt-auto border-t border-sidebar-border p-4">
        <div className={cn("text-sidebar-foreground", compact && "flex justify-center")}>
          <UserButton />
        </div>
        {user?.primaryEmail && !compact ? (
          <p className="mt-2 truncate text-xs text-sidebar-muted">{user.primaryEmail}</p>
        ) : null}
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const settings = useWorkspace();
  const compact = settings.sidebarAppearance === "compact";
  const [open, setOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const title =
    NAV.find((n) =>
      n.to === "/" ? pathname === "/" : pathname === n.to || pathname.startsWith(`${n.to}/`),
    )?.label ?? settings.appName;

  return (
    <div className="min-h-screen bg-background">
      <aside
        className={cn(
          "no-print fixed inset-y-0 left-0 z-30 hidden border-r border-sidebar-border lg:flex",
          compact ? "w-[4.5rem]" : "w-64",
        )}
      >
        <SidebarBody compact={compact} />
      </aside>

      <div className={cn("min-h-screen", compact ? "lg:pl-[4.5rem]" : "lg:pl-64")}>
        <header className="no-print sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-background/90 px-4 backdrop-blur-sm lg:hidden">
          <Button variant="ghost" size="icon" onClick={() => setOpen(true)} aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </Button>
          <div className="flex min-w-0 items-center gap-2">
            <span className="text-primary">
              <PharmacyMark className="h-7 w-7" />
            </span>
            <span className="truncate font-display text-base font-semibold">{title}</span>
          </div>
        </header>

        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="left" className="p-0">
            <SidebarBody onNavigate={() => setOpen(false)} />
          </SheetContent>
        </Sheet>

        <main className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}

import { useQuery } from "@tanstack/react-query";
import { createContext, useContext, useEffect, type ReactNode } from "react";
import { AuthSplash } from "@/components/auth-splash";
import { DEFAULT_ACCENT } from "@/lib/settings-map";
import type { PharmacySettings } from "@/lib/types";
import { contrastOn } from "@/lib/utils";
import { loadWorkspace } from "@/server/workspace";

const WorkspaceContext = createContext<PharmacySettings | null>(null);

export function useWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("useWorkspace must be used within WorkspaceProvider");
  return value;
}

export function useWorkspaceOptional() {
  return useContext(WorkspaceContext);
}

function applyAppearance(settings: PharmacySettings) {
  const root = document.documentElement;
  const accent = settings.accentColor || DEFAULT_ACCENT;
  root.style.setProperty("--primary", accent);
  root.style.setProperty("--ring", accent);
  root.style.setProperty("--primary-foreground", contrastOn(accent));
  root.dataset.density = settings.layoutDensity;

  const preferDark = () => window.matchMedia("(prefers-color-scheme: dark)").matches;
  const applyDark = (dark: boolean) => root.classList.toggle("dark", dark);

  if (settings.theme === "system") {
    applyDark(preferDark());
    return "system";
  }
  applyDark(settings.theme === "dark");
  return settings.theme;
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const query = useQuery({
    queryKey: ["workspace"],
    queryFn: () => loadWorkspace(),
  });

  useEffect(() => {
    if (!query.data) return;
    const mode = applyAppearance(query.data);
    if (mode !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyAppearance(query.data);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [query.data]);

  if (query.isPending) return <AuthSplash message="Opening the pharmacy…" />;

  if (query.isError || !query.data) {
    return (
      <div className="grid min-h-screen place-items-center bg-background px-6 text-center">
        <div className="max-w-sm space-y-2">
          <h1 className="font-display text-xl font-semibold">Unable to load the workspace</h1>
          <p className="text-sm text-muted-foreground">
            {query.error instanceof Error ? query.error.message : "Please refresh and try again."}
          </p>
        </div>
      </div>
    );
  }

  return <WorkspaceContext.Provider value={query.data}>{children}</WorkspaceContext.Provider>;
}

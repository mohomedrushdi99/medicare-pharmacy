import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { AuthSplash } from "@/components/auth-splash";
import { WorkspaceProvider } from "@/components/workspace-provider";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export const Route = createFileRoute("/_app")({
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { user, isPending } = useCurrentUserState();

  if (isPending) return <AuthSplash />;
  if (!user) return <RedirectToSignIn />;

  return (
    <WorkspaceProvider>
      <AppShell>
        <Outlet />
      </AppShell>
    </WorkspaceProvider>
  );
}

import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { AuthSplash } from "@/components/auth-splash";
import { PharmacyMark } from "@/components/pharmacy-mark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient, authEnabled, GROK_PROVIDERS, signIn } from "@/lib/auth/client";
import { OPERATOR } from "@/lib/auth/operator";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { ensureOperatorAccount, recordAudit } from "@/server/workspace";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  const { user, isPending } = useCurrentUserState();
  const navigate = useNavigate();
  const [email, setEmail] = useState(OPERATOR.email);
  const [password, setPassword] = useState(OPERATOR.password);
  const [busy, setBusy] = useState(false);
  const [seeded, setSeeded] = useState(false);

  // Ensure the single operator account exists (idempotent).
  useEffect(() => {
    if (!authEnabled || seeded) return;
    let cancelled = false;
    void (async () => {
      try {
        await ensureOperatorAccount();
      } catch {
        /* seed is best-effort — sign-in will surface real errors */
      } finally {
        if (!cancelled) setSeeded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [seeded]);

  if (isPending) return <AuthSplash message="Checking your session…" />;
  if (user) return <Navigate to="/" />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!authEnabled) return;
    setBusy(true);
    try {
      // Make sure operator exists before first sign-in.
      try {
        await ensureOperatorAccount();
      } catch {
        /* continue — sign-in will report failure */
      }

      const { error } = await authClient.signIn.email({
        email: email.trim().toLowerCase(),
        password,
      });
      if (error) {
        const msg = error.message ?? "Incorrect email or password.";
        // Friendlier message when account was never seeded.
        if (/not found|invalid|credentials|user/i.test(msg)) {
          throw new Error(
            "Incorrect email or password. Use the operator credentials shown below.",
          );
        }
        throw new Error(msg);
      }
      try {
        await recordAudit({
          data: { action: "Login", entity: "user", details: email.trim().toLowerCase() },
        });
      } catch {
        /* audit is best-effort */
      }
      await navigate({ to: "/" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to sign in.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <section className="relative hidden overflow-hidden bg-sidebar text-sidebar-foreground lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-primary/20" />
        <div className="pointer-events-none absolute bottom-0 left-0 h-48 w-48 rounded-full bg-primary/10" />
        <div className="flex items-center gap-3">
          <span className="text-primary">
            <PharmacyMark />
          </span>
          <div>
            <p className="font-display text-lg font-semibold">Medicare Pharmacy</p>
            <p className="text-sm text-sidebar-muted">Wholesale medicine supplier</p>
          </div>
        </div>
        <div className="max-w-md space-y-4">
          <p className="font-display text-4xl font-medium leading-tight tracking-tight">
            Quiet tools for a precise dispensary.
          </p>
          <p className="text-sm leading-relaxed text-sidebar-muted">
            Inventory, stock, billing and invoices — kept simple so the counter stays fast.
          </p>
        </div>
        <p className="text-xs text-sidebar-muted">Colombo, Sri Lanka</p>
      </section>

      <section className="flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-sm space-y-8">
          <div className="flex items-center gap-3 lg:hidden">
            <span className="text-primary">
              <PharmacyMark />
            </span>
            <div>
              <p className="font-display text-lg font-semibold">Medicare Pharmacy</p>
              <p className="text-sm text-muted-foreground">Sign in to continue</p>
            </div>
          </div>
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight">Sign in</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              One operator account for this pharmacy.
            </p>
          </div>

          {authEnabled ? (
            <form className="space-y-4" onSubmit={onSubmit}>
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="username"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? "Signing in…" : "Sign in"}
              </Button>

              <div className="rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
                <p className="font-medium text-foreground">Operator login</p>
                <p className="mt-1">
                  Email: <span className="font-mono text-foreground">{OPERATOR.email}</span>
                </p>
                <p>
                  Password: <span className="font-mono text-foreground">{OPERATOR.password}</span>
                </p>
              </div>
            </form>
          ) : (
            <p className="text-sm text-muted-foreground">Sign-in is disabled.</p>
          )}

          {authEnabled ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3 text-xs uppercase tracking-wide text-muted-foreground">
                <span className="h-px flex-1 bg-border" />
                or
                <span className="h-px flex-1 bg-border" />
              </div>
              <div className="grid gap-2">
                {GROK_PROVIDERS.map((p) => (
                  <Button
                    key={p.providerId}
                    type="button"
                    variant="outline"
                    onClick={() => signIn(p.providerId, { callbackURL: "/" })}
                  >
                    Continue with {p.label}
                  </Button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}

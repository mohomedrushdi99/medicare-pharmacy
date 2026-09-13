import { PharmacyMark } from "@/components/pharmacy-mark";

export function AuthSplash({ message = "Loading pharmacy…" }: { message?: string }) {
  return (
    <main className="grid min-h-screen place-items-center bg-background px-6 text-center">
      <div className="flex flex-col items-center gap-4">
        <span className="text-primary">
          <PharmacyMark />
        </span>
        <div>
          <p className="font-display text-lg font-semibold tracking-tight">Medicare Pharmacy</p>
          <p className="mt-1 text-sm text-muted-foreground">{message}</p>
        </div>
      </div>
    </main>
  );
}

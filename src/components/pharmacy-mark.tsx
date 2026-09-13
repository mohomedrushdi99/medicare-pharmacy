import { cn } from "@/lib/utils";

export function PharmacyMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 40 40"
      className={cn("h-9 w-9", className)}
      aria-hidden="true"
    >
      <rect width="40" height="40" rx="11" fill="currentColor" />
      <path
        d="M20 9.5c.9 0 1.6.7 1.6 1.6v5.3h5.3c.9 0 1.6.7 1.6 1.6s-.7 1.6-1.6 1.6h-5.3v5.3c0 .9-.7 1.6-1.6 1.6s-1.6-.7-1.6-1.6v-5.3h-5.3c-.9 0-1.6-.7-1.6-1.6s.7-1.6 1.6-1.6h5.3v-5.3c0-.9.7-1.6 1.6-1.6Z"
        fill="var(--primary-foreground, #f7fffc)"
      />
    </svg>
  );
}

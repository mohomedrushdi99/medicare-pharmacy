/** Integer-cent money helpers. Never use floating point for totals. */

export function parseMoneyToCents(raw: string | number): number {
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) throw new Error("Please enter a valid price.");
    return Math.round(raw * 100);
  }
  const trimmed = raw.trim().replace(/,/g, "");
  if (!trimmed) throw new Error("Please enter a valid price.");
  if (!/^-?\d+(\.\d{1,4})?$/.test(trimmed)) {
    throw new Error("Please enter a valid price.");
  }
  const negative = trimmed.startsWith("-");
  const [wholePart, fracPart = ""] = trimmed.replace("-", "").split(".");
  const whole = Number.parseInt(wholePart || "0", 10);
  const frac = Number.parseInt((fracPart + "00").slice(0, 2), 10);
  const cents = whole * 100 + frac;
  return negative ? -cents : cents;
}

export function centsToDecimalString(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  return `${sign}${whole}.${frac.toString().padStart(2, "0")}`;
}

export function numericToCents(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === "") return 0;
  return parseMoneyToCents(value);
}

export function formatCents(cents: number, symbol = "Rs."): string {
  const formatted = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
  return `${symbol} ${formatted}`;
}

export function assertNonNegativeCents(cents: number, label = "amount"): number {
  if (!Number.isInteger(cents)) throw new Error(`Please enter a valid ${label}.`);
  if (cents < 0) throw new Error(`Please enter a valid ${label}.`);
  return cents;
}

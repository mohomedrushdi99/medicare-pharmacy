import { format, parseISO, isValid } from "date-fns";

function asDate(value: string | Date): Date {
  if (value instanceof Date) return value;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return parseISO(value);
  const d = new Date(value);
  return d;
}

export function formatDisplayDate(value: string | Date): string {
  const d = asDate(value);
  if (!isValid(d)) return String(value);
  return format(d, "dd MMMM yyyy");
}

export function formatDateTime(value: string | Date): string {
  const d = asDate(value);
  if (!isValid(d)) return String(value);
  return format(d, "dd MMM yyyy, HH:mm");
}

export function formatIsoDate(d = new Date()): string {
  return format(d, "yyyy-MM-dd");
}

export function paymentMethodLabel(method: string): string {
  switch (method) {
    case "cash":
      return "Cash";
    case "card":
      return "Card";
    case "bank_transfer":
      return "Bank Transfer";
    case "other":
      return "Other";
    default:
      return method;
  }
}

export function stockTypeLabel(type: string): string {
  switch (type) {
    case "add":
      return "Add stock";
    case "remove":
      return "Remove stock";
    case "sale":
      return "Sale";
    case "correction":
      return "Correction";
    default:
      return type;
  }
}

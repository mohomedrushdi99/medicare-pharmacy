import { numericToCents } from "@/lib/money";
import type { PharmacySettings, SidebarAppearance, ThemePreference, LayoutDensity } from "@/lib/types";

export type SettingsRow = {
  user_id: string;
  pharmacy_name: string;
  subtitle: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  tax_vat_number: string;
  logo_data: string;
  invoice_prefix: string;
  next_invoice_number: number;
  currency: string;
  currency_symbol: string;
  default_tax_percent: string | number;
  default_discount: string | number;
  invoice_footer: string;
  terms_and_conditions: string;
  accent_color: string;
  theme: string;
  sidebar_appearance: string;
  layout_density: string;
  app_name: string;
  show_today_sales: boolean;
  show_today_invoices: boolean;
  show_total_medicines: boolean;
  show_total_stock: boolean;
  show_low_stock: boolean;
  show_stock_value: boolean;
  show_sales_chart: boolean;
};

export function mapSettings(row: SettingsRow): PharmacySettings {
  return {
    userId: row.user_id,
    pharmacyName: row.pharmacy_name,
    subtitle: row.subtitle,
    address: row.address,
    phone: row.phone,
    email: row.email,
    website: row.website,
    taxVatNumber: row.tax_vat_number,
    logoData: row.logo_data,
    invoicePrefix: row.invoice_prefix,
    nextInvoiceNumber: Number(row.next_invoice_number),
    currency: row.currency,
    currencySymbol: row.currency_symbol,
    defaultTaxPercent: Number(row.default_tax_percent) || 0,
    defaultDiscount: numericToCents(row.default_discount) / 100,
    invoiceFooter: row.invoice_footer,
    termsAndConditions: row.terms_and_conditions,
    accentColor: row.accent_color,
    theme: row.theme as ThemePreference,
    sidebarAppearance: row.sidebar_appearance as SidebarAppearance,
    layoutDensity: row.layout_density as LayoutDensity,
    appName: row.app_name,
    showTodaySales: Boolean(row.show_today_sales),
    showTodayInvoices: Boolean(row.show_today_invoices),
    showTotalMedicines: Boolean(row.show_total_medicines),
    showTotalStock: Boolean(row.show_total_stock),
    showLowStock: Boolean(row.show_low_stock),
    showStockValue: Boolean(row.show_stock_value),
    showSalesChart: Boolean(row.show_sales_chart),
  };
}

export const DEFAULT_ACCENT = "#0F766E";

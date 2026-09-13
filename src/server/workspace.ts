import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { OPERATOR } from "@/lib/auth/operator";
import { auth } from "@/lib/auth/server";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { centsToDecimalString, parseMoneyToCents } from "@/lib/money";
import { mapSettings, type SettingsRow } from "@/lib/settings-map";
import type { PharmacySettings } from "@/lib/types";
import { writeAudit } from "@/server/mappers";

/**
 * Ensure the single pharmacy operator account exists.
 * Idempotent — safe to call on every login page load.
 * No auth required (runs before sign-in).
 */
export const ensureOperatorAccount = createServerFn({ method: "POST" }).handler(
  async () => {
    try {
      // Prefer API create when available (hashes password correctly).
      const result = await auth.api.signUpEmail({
        body: {
          email: OPERATOR.email,
          password: OPERATOR.password,
          name: OPERATOR.name,
        },
      });
      if (result) return { ok: true as const, created: true as const };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Already exists is success for our single-account model.
      if (
        /already|exists|unique|USER_ALREADY|email.*taken/i.test(message)
      ) {
        return { ok: true as const, created: false as const };
      }
      // Fall through — check DB for existing user.
    }

    try {
      const sql = await getSql();
      const rows = await sql<{ id: string }>`
        select id from "user" where email = ${OPERATOR.email} limit 1
      `;
      if (rows[0]) return { ok: true as const, created: false as const };
    } catch {
      /* DB may not be ready yet */
    }

    return { ok: false as const, created: false as const };
  },
);

async function getSettingsRow(userId: string): Promise<PharmacySettings | null> {
  const sql = await getSql();
  const rows = await sql<SettingsRow>`
    select *
    from settings
    where user_id = ${userId}
    limit 1
  `;
  return rows[0] ? mapSettings(rows[0]) : null;
}
async function seedWorkspace(userId: string) {
  const sql = await getSql();

  await sql`insert into settings (
      user_id, pharmacy_name, subtitle, address, phone, email, website,
      invoice_prefix, next_invoice_number, currency, currency_symbol,
      invoice_footer, terms_and_conditions, accent_color, app_name
    ) values (
      ${userId},
      ${"Medicare Pharmacy"},
      ${"Wholesale Medicine Supplier"},
      ${"1123/2/3, Dalupitiya Road, Hunupitiya, Wattala"},
      ${"0759576085"},
      ${"naslanrilwan11@gmail.com"},
      ${""},
      ${"INV"},
      ${1},
      ${"LKR"},
      ${"Rs."},
      ${"Thank you for your business. Please verify goods on receipt."},
      ${"Goods once sold cannot be returned unless damaged in transit."},
      ${"#0F766E"},
      ${"Medicare Pharmacy"}
    )`;

  await writeAudit(sql, userId, "Login", "user", userId, "Workspace created");
}
export const loadWorkspace = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    let settings = await getSettingsRow(context.userId);
    if (!settings) {
      await seedWorkspace(context.userId);
      settings = await getSettingsRow(context.userId);
    }
    if (!settings) throw new Error("Unable to load pharmacy settings.");
    return settings;
  });

const settingsSchema = z.object({
  pharmacyName: z.string().trim().min(1, "Pharmacy name is required").max(120),
  subtitle: z.string().trim().max(160),
  address: z.string().trim().max(400),
  phone: z.string().trim().max(60),
  email: z.string().trim().max(120),
  website: z.string().trim().max(160),
  taxVatNumber: z.string().trim().max(80),
  logoData: z.string().max(900_000).optional(),
  invoicePrefix: z.string().trim().min(1).max(12),
  nextInvoiceNumber: z.number().int().min(1).max(9999999),
  currency: z.string().trim().min(1).max(8),
  currencySymbol: z.string().trim().min(1).max(8),
  defaultTaxPercent: z.number().min(0).max(100),
  defaultDiscount: z.number().min(0),
  invoiceFooter: z.string().max(500),
  termsAndConditions: z.string().max(2000),
  accentColor: z.string().regex(/^#?[0-9A-Fa-f]{6}$/, "Choose a valid colour"),
  theme: z.enum(["light", "dark", "system"]),
  sidebarAppearance: z.enum(["expanded", "compact"]),
  layoutDensity: z.enum(["comfortable", "compact"]),
  appName: z.string().trim().min(1).max(80),
  showTodaySales: z.boolean(),
  showTodayInvoices: z.boolean(),
  showTotalMedicines: z.boolean(),
  showTotalStock: z.boolean(),
  showLowStock: z.boolean(),
  showStockValue: z.boolean(),
  showSalesChart: z.boolean(),
});

export const updateSettings = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => settingsSchema.parse(input))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const accent = data.accentColor.startsWith("#")
      ? data.accentColor.toUpperCase()
      : `#${data.accentColor.toUpperCase()}`;
    const discount = centsToDecimalString(parseMoneyToCents(data.defaultDiscount));
    const logo = data.logoData ?? "";
    await sql`update settings set
      pharmacy_name = ${data.pharmacyName},
      subtitle = ${data.subtitle},
      address = ${data.address},
      phone = ${data.phone},
      email = ${data.email},
      website = ${data.website},
      tax_vat_number = ${data.taxVatNumber},
      logo_data = ${logo},
      invoice_prefix = ${data.invoicePrefix.toUpperCase()},
      next_invoice_number = ${data.nextInvoiceNumber},
      currency = ${data.currency.toUpperCase()},
      currency_symbol = ${data.currencySymbol},
      default_tax_percent = ${data.defaultTaxPercent.toFixed(2)},
      default_discount = ${discount},
      invoice_footer = ${data.invoiceFooter},
      terms_and_conditions = ${data.termsAndConditions},
      accent_color = ${accent},
      theme = ${data.theme},
      sidebar_appearance = ${data.sidebarAppearance},
      layout_density = ${data.layoutDensity},
      app_name = ${data.appName},
      show_today_sales = ${data.showTodaySales},
      show_today_invoices = ${data.showTodayInvoices},
      show_total_medicines = ${data.showTotalMedicines},
      show_total_stock = ${data.showTotalStock},
      show_low_stock = ${data.showLowStock},
      show_stock_value = ${data.showStockValue},
      show_sales_chart = ${data.showSalesChart},
      updated_at = now()
    where user_id = ${context.userId}`;
    await writeAudit(sql, context.userId, "Settings changed", "settings", context.userId);
    const settings = await getSettingsRow(context.userId);
    if (!settings) throw new Error("Unable to save settings.");
    return settings;
  });

export const recordAudit = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) =>
    z.object({
      action: z.string().min(1).max(80),
      entity: z.string().max(40).optional(),
      entityId: z.string().max(40).optional(),
      details: z.string().max(400).optional(),
    }).parse(input),
  )
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await writeAudit(
      sql,
      context.userId,
      data.action,
      data.entity ?? "",
      data.entityId ?? "",
      data.details ?? "",
    );
    return { ok: true };
  });

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

const SEED_MEDICINES = [
  ["AMX500", "Amoxicillin 500mg Capsules", "Amoxicillin", "Antibiotic", "Box", "850.00", "1100.00", 42, 20],
  ["PCM500", "Paracetamol 500mg Tablets", "Paracetamol", "Antipyretic", "Box", "420.00", "580.00", 16, 30],
  ["IBU400", "Ibuprofen 400mg Tablets", "Ibuprofen", "Analgesic", "Box", "610.00", "820.00", 54, 20],
  ["OMZ20", "Omeprazole 20mg Capsules", "Omeprazole", "Gastrointestinal", "Box", "960.00", "1280.00", 28, 15],
  ["MET500", "Metformin 500mg Tablets", "Metformin", "Antidiabetic", "Box", "390.00", "540.00", 70, 25],
  ["ATV10", "Atorvastatin 10mg Tablets", "Atorvastatin", "Cardiovascular", "Box", "720.00", "980.00", 33, 15],
  ["CTZ10", "Cetirizine 10mg Tablets", "Cetirizine", "Antihistamine", "Strip", "95.00", "140.00", 120, 40],
  ["SBTINH", "Salbutamol Inhaler 100mcg", "Salbutamol", "Respiratory", "Unit", "480.00", "690.00", 18, 12],
  ["VTC500", "Vitamin C 500mg Tablets", "Ascorbic Acid", "Vitamin & Supplement", "Bottle", "260.00", "390.00", 8, 20],
  ["AMXCLV", "Co-Amoxiclav 625mg Tablets", "Amoxicillin + Clavulanic Acid", "Antibiotic", "Box", "1450.00", "1890.00", 22, 10],
  ["LST50", "Losartan 50mg Tablets", "Losartan", "Cardiovascular", "Box", "540.00", "760.00", 40, 15],
  ["AML5", "Amlodipine 5mg Tablets", "Amlodipine", "Cardiovascular", "Box", "310.00", "450.00", 61, 20],
  ["AZI500", "Azithromycin 500mg Tablets", "Azithromycin", "Antibiotic", "Box", "980.00", "1320.00", 14, 10],
  ["DCFGEL", "Diclofenac Gel 1% 30g", "Diclofenac", "Dermatology", "Tube", "210.00", "320.00", 36, 12],
  ["ORS20", "ORS Sachets", "Oral Rehydration Salts", "Gastrointestinal", "Pack", "180.00", "260.00", 90, 30],
  ["PNT40", "Pantoprazole 40mg Tablets", "Pantoprazole", "Antacid", "Box", "640.00", "880.00", 25, 12],
] as const;

async function getSettingsRow(userId: string): Promise<PharmacySettings | null> {
  const sql = await getSql();
  const rows = await sql<SettingsRow>`select * from settings where user_id = ${userId} limit 1`;
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
      ${4},
      ${"LKR"},
      ${"Rs."},
      ${"Thank you for your business. Please verify goods on receipt."},
      ${"Goods once sold cannot be returned unless damaged in transit."},
      ${"#0F766E"},
      ${"Medicare Pharmacy"}
    )`;

  for (const m of SEED_MEDICINES) {
    await sql`insert into medicines (
      user_id, code, name, generic_name, category, unit,
      purchase_price, selling_price, current_stock, min_stock, status
    ) values (
      ${userId}, ${m[0]}, ${m[1]}, ${m[2]}, ${m[3]}, ${m[4]},
      ${m[5]}, ${m[6]}, ${m[7]}, ${m[8]}, ${"active"}
    )`;
  }

  const meds = await sql<{ id: number; code: string; name: string; selling_price: string }>`
    select id, code, name, selling_price::text as selling_price from medicines where user_id = ${userId}`;
  const byCode = Object.fromEntries(meds.map((m) => [m.code, m]));

  async function insertSale(
    number: string,
    dayOffset: number,
    method: string,
    discount: string,
    tax: string,
    paid: string,
    lines: { code: string; qty: number }[],
  ) {
    const items = lines.map((line) => {
      const med = byCode[line.code];
      const unit = Number(med.selling_price);
      const total = unit * line.qty;
      return { ...med, qty: line.qty, unit, total };
    });
    const subtotal = items.reduce((s, i) => s + i.total, 0);
    const grand = subtotal - Number(discount) + Number(tax);
    const balance = Number(paid) - grand;
    const dateExpr = dayOffset === 0 ? "current_date" : `current_date - ${dayOffset}`;
    const saleRows = await sql.query<{ id: number }>(
      `insert into sales (
        user_id, invoice_number, invoice_date, subtotal, discount, tax,
        grand_total, amount_paid, balance, payment_method, status
      ) values ($1, $2, ${dateExpr}, $3, $4, $5, $6, $7, $8, $9, 'completed')
      returning id`,
      [
        userId,
        number,
        subtotal.toFixed(2),
        discount,
        tax,
        grand.toFixed(2),
        paid,
        balance.toFixed(2),
        method,
      ],
    );
    const saleId = saleRows[0].id;
    for (const item of items) {
      await sql`insert into sale_items (
        sale_id, user_id, medicine_id, medicine_code, medicine_name, quantity, unit_price, line_total
      ) values (
        ${saleId}, ${userId}, ${item.id}, ${item.code}, ${item.name},
        ${item.qty}, ${item.unit.toFixed(2)}, ${item.total.toFixed(2)}
      )`;
      await sql`insert into stock_movements (
        user_id, medicine_id, adjustment_type, quantity, previous_stock, new_stock, reason, sale_id
      ) values (
        ${userId}, ${item.id}, ${"sale"}, ${item.qty},
        ${(byCode[item.code] ? 0 : 0) + item.qty}, ${0},
        ${"Seed sale"}, ${saleId}
      )`;
    }
  }

  await insertSale("INV-2026-000001", 2, "cash", "0.00", "0.00", "3960.00", [
    { code: "AMX500", qty: 2 },
    { code: "PCM500", qty: 3 },
  ]);
  await insertSale("INV-2026-000002", 1, "card", "200.00", "0.00", "3460.00", [
    { code: "OMZ20", qty: 2 },
    { code: "MET500", qty: 2 },
  ]);
  await insertSale(
    "INV-2026-000003",
    0,
    "bank_transfer",
    "0.00",
    "0.00",
    "3210.00",
    [
      { code: "IBU400", qty: 1 },
      { code: "CTZ10", qty: 4 },
      { code: "VTC500", qty: 2 },
    ],
  );

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

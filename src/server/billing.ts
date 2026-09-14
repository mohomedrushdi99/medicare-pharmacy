import { createServerFn } from "@tanstack/react-start";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { formatDisplayDate, paymentMethodLabel } from "@/lib/format";
import { centsToDecimalString, formatCents, parseMoneyToCents } from "@/lib/money";
import { mapSettings, type SettingsRow } from "@/lib/settings-map";
import { withTransaction } from "@/lib/tx.server";
import type { DashboardStats, PaymentMethod } from "@/lib/types";
import {
  mapMedicine,
  mapSale,
  mapSaleItem,
  writeAudit,
  type MedicineRow,
  type SaleItemRow,
  type SaleRow,
} from "@/server/mappers";

function moneyField(label: string) {
  return z.string().min(1, `Please enter a valid ${label}.`);
}

const completeSaleSchema = z.object({
  items: z
    .array(
      z.object({
        medicineId: z.number().int(),
        quantity: z.number().int().positive("Please enter a valid quantity."),
        bonus: z.number().int().min(0, "Bonus cannot be negative.").default(0),
        unitPrice: z.string().min(1, "Please enter a valid price."),
      }),
    )
    .min(1, "Add at least one item."),
  discount: moneyField("discount"),
  tax: moneyField("tax"),
  amountPaid: moneyField("payment amount"),
  paymentMethod: z.enum(["cash", "card", "bank_transfer", "other"]),
  notes: z.string().max(400).optional(),
  customerName: z.string().max(200).optional(),
});

export const getDashboard = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<DashboardStats> => {
    const sql = await getSql();
    const [counts] = await sql<{
      total_medicines: number;
      total_stock: number;
      low_stock: number;
      stock_value: string | number;
    }>`
      select
        count(*)::int as total_medicines,
        coalesce(sum(current_stock), 0)::int as total_stock,
        count(*) filter (where current_stock < min_stock and status = 'active')::int as low_stock,
        coalesce(sum(current_stock * purchase_price), 0) as stock_value
      from medicines
      where user_id = ${context.userId}`;

    const [today] = await sql<{ sales: string | number; invoices: number }>`
      select coalesce(sum(grand_total), 0) as sales, count(*)::int as invoices
      from sales
      where user_id = ${context.userId}
        and invoice_date = current_date
        and status = 'completed'`;

    const daily = await sql<{ day: string; total: string | number; invoices: number }>`
      select invoice_date::text as day,
             coalesce(sum(grand_total), 0) as total,
             count(*)::int as invoices
      from sales
      where user_id = ${context.userId}
        and status = 'completed'
        and invoice_date >= current_date - 6
      group by invoice_date
      order by invoice_date`;

    const days: DashboardStats["dailySales"] = [];
    for (let i = 6; i >= 0; i -= 1) {
      const d = new Date();
      d.setHours(12, 0, 0, 0);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const found = daily.find((row) => String(row.day).slice(0, 10) === key);
      days.push({
        date: key,
        totalCents: found ? parseMoneyToCents(found.total) : 0,
        invoices: found ? Number(found.invoices) : 0,
      });
    }

    return {
      totalMedicines: Number(counts?.total_medicines ?? 0),
      totalStock: Number(counts?.total_stock ?? 0),
      lowStock: Number(counts?.low_stock ?? 0),
      todaySalesCents: parseMoneyToCents(today?.sales ?? 0),
      todayInvoices: Number(today?.invoices ?? 0),
      stockValueCents: parseMoneyToCents(counts?.stock_value ?? 0),
      dailySales: days,
    };
  });

export const previewNextInvoice = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const rows = await sql<{ invoice_prefix: string; next_invoice_number: number }>`
      select invoice_prefix, next_invoice_number from settings where user_id = ${context.userId}`;
    const prefix = rows[0]?.invoice_prefix ?? "INV";
    const seq = Number(rows[0]?.next_invoice_number ?? 1);
    const year = new Date().getFullYear();
    return {
      invoiceNumber: `${prefix}-${year}-${String(seq).padStart(6, "0")}`,
    };
  });

export const completeSale = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => completeSaleSchema.parse(input))
  .handler(async ({ context, data }) => {
    const discountCents = parseMoneyToCents(data.discount);
    const taxCents = parseMoneyToCents(data.tax);
    const paidCents = parseMoneyToCents(data.amountPaid);
    if (discountCents < 0) throw new Error("Please enter a valid discount amount.");
    if (taxCents < 0) throw new Error("Please enter a valid tax amount.");
    if (paidCents < 0) throw new Error("Please enter a valid payment amount.");

    return withTransaction(async (sql) => {
      const settingsRows = await sql<SettingsRow>`
        select * from settings where user_id = ${context.userId} for update`;
      if (!settingsRows[0]) throw new Error("Unable to complete the invoice.");
      const settings = mapSettings(settingsRows[0]);

      const computedItems: {
        medicine: ReturnType<typeof mapMedicine>;
        quantity: number;
        bonus: number;
        unitCents: number;
        lineCents: number;
      }[] = [];

      for (const item of data.items) {
        const unitCents = parseMoneyToCents(item.unitPrice);
        const bonus = Number(item.bonus ?? 0);
        if (unitCents <= 0) throw new Error("Please enter a valid price.");
        if (item.quantity <= 0) throw new Error("Please enter a valid quantity.");
        if (!Number.isInteger(bonus) || bonus < 0) {
          throw new Error("Please enter a valid bonus quantity.");
        }
        const medRows = await sql<MedicineRow>`
          select * from medicines
          where id = ${item.medicineId} and user_id = ${context.userId}
          for update`;
        if (!medRows[0]) throw new Error("One of the selected medicines could not be found.");
        const medicine = mapMedicine(medRows[0]);
        if (medicine.status !== "active") {
          throw new Error(`${medicine.name} is inactive and cannot be sold.`);
        }
        const totalUnits = item.quantity + bonus;
        if (medicine.currentStock < totalUnits) {
          throw new Error(
            `Insufficient stock for ${medicine.name}. Need ${totalUnits} (qty ${item.quantity} + bonus ${bonus}), available: ${medicine.currentStock}.`,
          );
        }
        computedItems.push({
          medicine,
          quantity: item.quantity,
          bonus,
          unitCents,
          lineCents: unitCents * item.quantity,
        });
      }

      const subtotalCents = computedItems.reduce((sum, item) => sum + item.lineCents, 0);
      if (discountCents > subtotalCents) {
        throw new Error("Discount cannot exceed the subtotal.");
      }
      const grandCents = subtotalCents - discountCents + taxCents;
      if (grandCents < 0) throw new Error("Unable to complete the invoice.");
      const balanceCents = paidCents - grandCents;
      const year = new Date().getFullYear();
      const invoiceNumber = `${settings.invoicePrefix}-${year}-${String(settings.nextInvoiceNumber).padStart(6, "0")}`;

      const saleRows = await sql<SaleRow>`
        insert into sales (
          user_id, invoice_number, invoice_date, subtotal, discount, tax,
          grand_total, amount_paid, balance, payment_method, status, notes, customer_name
        ) values (
          ${context.userId},
          ${invoiceNumber},
          current_date,
          ${centsToDecimalString(subtotalCents)},
          ${centsToDecimalString(discountCents)},
          ${centsToDecimalString(taxCents)},
          ${centsToDecimalString(grandCents)},
          ${centsToDecimalString(paidCents)},
          ${centsToDecimalString(balanceCents)},
          ${data.paymentMethod},
          ${"completed"},
          ${data.notes ?? ""},
          ${(data.customerName ?? "").trim()}
        ) returning *`;
      const saleId = Number(saleRows[0].id);

      for (const item of computedItems) {
        await sql`insert into sale_items (
          sale_id, user_id, medicine_id, medicine_code, medicine_name,
          quantity, bonus, unit_price, line_total
        ) values (
          ${saleId}, ${context.userId}, ${item.medicine.id}, ${item.medicine.code},
          ${item.medicine.name}, ${item.quantity}, ${item.bonus},
          ${centsToDecimalString(item.unitCents)}, ${centsToDecimalString(item.lineCents)}
        )`;
        const previous = item.medicine.currentStock;
        const totalOut = item.quantity + item.bonus;
        const next = previous - totalOut;
        await sql`update medicines set current_stock = ${next}, updated_at = now()
          where id = ${item.medicine.id} and user_id = ${context.userId}`;
        const reason =
          item.bonus > 0
            ? `Invoice ${invoiceNumber} (qty ${item.quantity} + bonus ${item.bonus})`
            : `Invoice ${invoiceNumber}`;
        await sql`insert into stock_movements (
          user_id, medicine_id, adjustment_type, quantity, previous_stock, new_stock, reason, sale_id
        ) values (
          ${context.userId}, ${item.medicine.id}, ${"sale"}, ${totalOut},
          ${previous}, ${next}, ${reason}, ${saleId}
        )`;
      }

      await sql`update settings
        set next_invoice_number = ${settings.nextInvoiceNumber + 1}, updated_at = now()
        where user_id = ${context.userId}`;

      await writeAudit(sql, context.userId, "Sale completed", "sale", saleId, invoiceNumber);
      return mapSale(
        saleRows[0],
        computedItems.map((item, index) => ({
          id: index + 1,
          medicineId: item.medicine.id,
          medicineCode: item.medicine.code,
          medicineName: item.medicine.name,
          quantity: item.quantity,
          bonus: item.bonus,
          unitPriceCents: item.unitCents,
          lineTotalCents: item.lineCents,
        })),
      );
    });
  });

export const listInvoices = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: unknown) =>
    z.object({
      search: z.string().optional(),
      from: z.string().optional(),
      to: z.string().optional(),
      page: z.number().int().min(1).optional(),
      pageSize: z.number().int().min(5).max(100).optional(),
    }).parse(input ?? {}),
  )
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const search = (data.search ?? "").trim();
    const from = data.from || "1970-01-01";
    const to = data.to || "2999-12-31";
    const page = data.page ?? 1;
    const pageSize = data.pageSize ?? 15;
    const offset = (page - 1) * pageSize;
    const like = `%${search}%`;
    const rows = await sql.query<SaleRow & { total_count: number }>(
      `select s.*, coalesce(si.item_count, 0)::int as item_count,
              count(*) over()::int as total_count
       from sales s
       left join (
         select sale_id, count(*) as item_count from sale_items group by sale_id
       ) si on si.sale_id = s.id
       where s.user_id = $1
         and s.invoice_date between $2::date and $3::date
         and ($4 = '' or s.invoice_number ilike $5 or s.payment_method ilike $5)
       order by s.created_at desc
       limit $6 offset $7`,
      [context.userId, from, to, search, like, pageSize, offset],
    );
    const total = rows[0]?.total_count ?? 0;
    return {
      items: rows.map((row) => mapSale(row)),
      total,
      page,
      pageSize,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
    };
  });

export const getInvoice = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => z.object({ id: z.number().int().positive() }).parse(input))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const sales = await sql<SaleRow>`
      select * from sales where id = ${data.id} and user_id = ${context.userId} limit 1`;
    if (!sales[0]) throw new Error("Invoice not found.");
    const items = await sql<SaleItemRow>`
      select * from sale_items where sale_id = ${data.id} and user_id = ${context.userId} order by id`;
    const settingsRows = await sql<SettingsRow>`select * from settings where user_id = ${context.userId}`;
    return {
      sale: mapSale(sales[0], items.map(mapSaleItem)),
      settings: settingsRows[0] ? mapSettings(settingsRows[0]) : null,
    };
  });

function hexRgb(hex: string) {
  const c = hex.replace("#", "");
  return {
    r: parseInt(c.slice(0, 2), 16) / 255,
    g: parseInt(c.slice(2, 4), 16) / 255,
    b: parseInt(c.slice(4, 6), 16) / 255,
  };
}

async function embedLogo(pdf: PDFDocument, dataUrl: string) {
  const match = /^data:image\/(png|jpeg|jpg);base64,(.+)$/i.exec(dataUrl);
  if (!match) return null;
  const bytes = Buffer.from(match[2], "base64");
  try {
    if (match[1].toLowerCase() === "png") return await pdf.embedPng(bytes);
    return await pdf.embedJpg(bytes);
  } catch {
    return null;
  }
}

export const generateInvoicePdf = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => z.object({ id: z.number().int() }).parse(input))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const sales = await sql<SaleRow>`
      select * from sales where id = ${data.id} and user_id = ${context.userId} limit 1`;
    if (!sales[0]) throw new Error("Invoice could not be generated.");
    const items = await sql<SaleItemRow>`
      select * from sale_items where sale_id = ${data.id} and user_id = ${context.userId} order by id`;
    const settingsRows = await sql<SettingsRow>`select * from settings where user_id = ${context.userId}`;
    const settings = settingsRows[0] ? mapSettings(settingsRows[0]) : null;
    if (!settings) throw new Error("Invoice could not be generated.");

    const sale = mapSale(sales[0], items.map(mapSaleItem));
    const symbol = settings.currencySymbol;
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([595.28, 841.89]);
    const serif = await pdf.embedFont(StandardFonts.TimesRomanBold);
    const serifReg = await pdf.embedFont(StandardFonts.TimesRoman);
    const sans = await pdf.embedFont(StandardFonts.Helvetica);
    const sansBold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const accent = hexRgb(settings.accentColor || "#0F766E");
    const ink = rgb(0.09, 0.13, 0.12);
    const muted = rgb(0.38, 0.44, 0.42);
    const line = rgb(0.82, 0.86, 0.84);
    const { width, height } = page.getSize();
    let y = height - 48;

    const logo = settings.logoData ? await embedLogo(pdf, settings.logoData) : null;
    if (logo) {
      const maxH = 42;
      const scale = maxH / logo.height;
      page.drawImage(logo, {
        x: 48,
        y: y - maxH + 12,
        width: logo.width * scale,
        height: maxH,
      });
    }

    const headerX = logo ? 110 : 48;
    page.drawText(settings.pharmacyName.toUpperCase(), {
      x: headerX,
      y,
      size: 18,
      font: serif,
      color: rgb(accent.r, accent.g, accent.b),
    });
    y -= 16;
    if (settings.subtitle) {
      page.drawText(settings.subtitle, {
        x: headerX,
        y,
        size: 10,
        font: sans,
        color: muted,
      });
      y -= 14;
    }
    const contactLines = [
      settings.address,
      settings.phone ? `Contact: ${settings.phone}` : "",
      settings.email ? `Email: ${settings.email}` : "",
      // Website is intentionally not printed on invoices
    ].filter(Boolean);
    for (const line of contactLines) {
      page.drawText(line.slice(0, 90), {
        x: headerX,
        y,
        size: 8,
        font: sans,
        color: muted,
      });
      y -= 11;
    }

    page.drawText("INVOICE", {
      x: width - 48 - sansBold.widthOfTextAtSize("INVOICE", 16),
      y: height - 48,
      size: 16,
      font: sansBold,
      color: ink,
    });
    page.drawText(sale.invoiceNumber, {
      x: width - 48 - sans.widthOfTextAtSize(sale.invoiceNumber, 10),
      y: height - 66,
      size: 10,
      font: sans,
      color: muted,
    });
    const dateLabel = formatDisplayDate(sale.invoiceDate);
    page.drawText(dateLabel, {
      x: width - 48 - sans.widthOfTextAtSize(dateLabel, 9),
      y: height - 80,
      size: 9,
      font: sans,
      color: muted,
    });

    y = height - 120;
    page.drawLine({
      start: { x: 48, y },
      end: { x: width - 48, y },
      thickness: 1.2,
      color: rgb(accent.r, accent.g, accent.b),
    });
    y -= 22;

    if (sale.customerName?.trim()) {
      page.drawText("Customer", {
        x: 48,
        y,
        size: 8,
        font: sansBold,
        color: muted,
      });
      y -= 12;
      page.drawText(sale.customerName.trim().slice(0, 60), {
        x: 48,
        y,
        size: 11,
        font: sans,
        color: ink,
      });
      y -= 18;
    } else {
      y -= 6;
    }

    const cols = [
      { label: "No.", x: 48 },
      { label: "Medicine", x: 76 },
      { label: "Qty", x: 268 },
      { label: "Bonus", x: 302 },
      { label: "Unit Price", x: 348 },
      { label: "Total", x: 455 },
    ];
    page.drawRectangle({
      x: 48,
      y: y - 6,
      width: width - 96,
      height: 20,
      color: rgb(0.94, 0.96, 0.95),
    });
    for (const col of cols) {
      page.drawText(col.label, { x: col.x, y, size: 8, font: sansBold, color: muted });
    }
    y -= 22;

    sale.items?.forEach((item, index) => {
      if (y < 160) return;
      page.drawText(String(index + 1), { x: 48, y, size: 9, font: sans, color: ink });
      page.drawText(item.medicineName.slice(0, 36), { x: 76, y, size: 9, font: sans, color: ink });
      page.drawText(String(item.quantity), { x: 268, y, size: 9, font: sans, color: ink });
      page.drawText(String(item.bonus ?? 0), { x: 302, y, size: 9, font: sans, color: ink });
      const unit = formatCents(item.unitPriceCents, symbol);
      const total = formatCents(item.lineTotalCents, symbol);
      page.drawText(unit, {
        x: 428 - sans.widthOfTextAtSize(unit, 9),
        y,
        size: 9,
        font: sans,
        color: ink,
      });
      page.drawText(total, {
        x: width - 48 - sans.widthOfTextAtSize(total, 9),
        y,
        size: 9,
        font: sans,
        color: ink,
      });
      y -= 16;
      page.drawLine({
        start: { x: 48, y: y + 10 },
        end: { x: width - 48, y: y + 10 },
        thickness: 0.3,
        color: line,
      });
    });

    y -= 10;
    const summary = [
      ["Subtotal", formatCents(sale.subtotalCents, symbol)],
      ["Discount", formatCents(sale.discountCents, symbol)],
      ["Tax", formatCents(sale.taxCents, symbol)],
      ["Grand Total", formatCents(sale.grandTotalCents, symbol)],
      ["Paid", formatCents(sale.amountPaidCents, symbol)],
      ["Balance", formatCents(sale.balanceCents, symbol)],
    ];
    for (const [label, value] of summary) {
      const bold = label === "Grand Total";
      page.drawText(label, { x: 360, y, size: 9, font: bold ? sansBold : sans, color: ink });
      page.drawText(value, {
        x: width - 48 - (bold ? sansBold : sans).widthOfTextAtSize(value, 9),
        y,
        size: 9,
        font: bold ? sansBold : sans,
        color: ink,
      });
      y -= 14;
    }

    y -= 8;
    page.drawText(`Payment method: ${paymentMethodLabel(sale.paymentMethod as PaymentMethod)}`, {
      x: 48,
      y,
      size: 9,
      font: sans,
      color: muted,
    });
    if (settings.taxVatNumber) {
      y -= 12;
      page.drawText(`Tax / VAT: ${settings.taxVatNumber}`, {
        x: 48,
        y,
        size: 9,
        font: sans,
        color: muted,
      });
    }

    y = 72;
    page.drawLine({
      start: { x: 48, y: y + 18 },
      end: { x: width - 48, y: y + 18 },
      thickness: 0.6,
      color: line,
    });
    if (settings.invoiceFooter) {
      page.drawText(settings.invoiceFooter.slice(0, 110), {
        x: 48,
        y,
        size: 8,
        font: serifReg,
        color: muted,
      });
      y -= 12;
    }
    if (settings.termsAndConditions) {
      page.drawText(settings.termsAndConditions.slice(0, 120), {
        x: 48,
        y,
        size: 7,
        font: sans,
        color: muted,
      });
    }

    const bytes = await pdf.save();
    return {
      fileName: `${sale.invoiceNumber}.pdf`,
      base64: Buffer.from(bytes).toString("base64"),
    };
  });

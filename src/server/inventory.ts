import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { centsToDecimalString, parseMoneyToCents } from "@/lib/money";
import { withTransaction } from "@/lib/tx.server";
import { mapMedicine, mapMovement, writeAudit, type MedicineRow, type MovementRow } from "@/server/mappers";

const medicineInput = z.object({
  code: z.string().trim().min(1, "Medicine code is required").max(40),
  name: z.string().trim().min(1, "Medicine name is required").max(160),
  genericName: z.string().trim().max(160),
  category: z.string().trim().max(80),
  unit: z.string().trim().min(1, "Unit is required").max(40),
  purchasePrice: z.string().min(1, "Purchase price is required"),
  sellingPrice: z.string().min(1, "Selling price is required"),
  minStock: z.number().int().min(0, "Minimum stock cannot be negative"),
  initialStock: z.number().int().min(0, "Stock cannot be negative").optional(),
  status: z.enum(["active", "inactive"]),
});

export const listMedicines = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: unknown) =>
    z.object({
      search: z.string().optional(),
      status: z.enum(["all", "active", "inactive", "low"]).optional(),
      page: z.number().int().min(1).optional(),
      pageSize: z.number().int().min(5).max(100).optional(),
    }).parse(input ?? {}),
  )
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const search = (data.search ?? "").trim();
    const status = data.status ?? "all";
    const page = data.page ?? 1;
    const pageSize = data.pageSize ?? 25;
    const offset = (page - 1) * pageSize;
    const like = `%${search}%`;

    const rows = await sql.query<MedicineRow & { total_count: number }>(
      `select m.*, count(*) over()::int as total_count
       from medicines m
       where m.user_id = $1
         and ($2 = '' or m.name ilike $3 or m.code ilike $3 or m.generic_name ilike $3)
         and ($4 = 'all'
              or ($4 = 'low' and m.current_stock < m.min_stock and m.status = 'active')
              or m.status = $4)
       order by m.name asc
       limit $5 offset $6`,
      [context.userId, search, like, status, pageSize, offset],
    );

    const total = rows[0]?.total_count ?? 0;
    return {
      items: rows.map(mapMedicine),
      total,
      page,
      pageSize,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
    };
  });

export const listActiveMedicines = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const rows = await sql<MedicineRow>`
      select * from medicines
      where user_id = ${context.userId} and status = 'active'
      order by name asc`;
    return rows.map(mapMedicine);
  });

export const getMedicine = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: unknown) => z.object({ id: z.number().int() }).parse(input))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const rows = await sql<MedicineRow>`
      select * from medicines where id = ${data.id} and user_id = ${context.userId} limit 1`;
    if (!rows[0]) throw new Error("Medicine not found.");
    return mapMedicine(rows[0]);
  });

export const createMedicine = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => medicineInput.parse(input))
  .handler(async ({ context, data }) => {
    const purchase = parseMoneyToCents(data.purchasePrice);
    const selling = parseMoneyToCents(data.sellingPrice);
    if (purchase < 0 || selling < 0) throw new Error("Please enter a valid price.");
    if (selling === 0) throw new Error("Selling price must be greater than zero.");
    const stock = data.initialStock ?? 0;
    const sql = await getSql();
    const existing = await sql<{ id: number }>`
      select id from medicines where user_id = ${context.userId} and lower(code) = ${data.code.toLowerCase()} limit 1`;
    if (existing[0]) throw new Error("A medicine with this code already exists.");

    const rows = await sql<MedicineRow>`
      insert into medicines (
        user_id, code, name, generic_name, category, unit,
        purchase_price, selling_price, current_stock, min_stock, status
      ) values (
        ${context.userId}, ${data.code.toUpperCase()}, ${data.name}, ${data.genericName},
        ${data.category}, ${data.unit}, ${centsToDecimalString(purchase)},
        ${centsToDecimalString(selling)}, ${stock}, ${data.minStock}, ${data.status}
      ) returning *`;
    const created = mapMedicine(rows[0]);
    if (stock > 0) {
      await sql`insert into stock_movements (
        user_id, medicine_id, adjustment_type, quantity, previous_stock, new_stock, reason
      ) values (
        ${context.userId}, ${created.id}, ${"add"}, ${stock}, ${0}, ${stock}, ${"Initial stock"}
      )`;
    }
    await writeAudit(sql, context.userId, "Medicine created", "medicine", created.id, created.name);
    return created;
  });

export const updateMedicine = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => medicineInput.extend({ id: z.number().int() }).parse(input))
  .handler(async ({ context, data }) => {
    const purchase = parseMoneyToCents(data.purchasePrice);
    const selling = parseMoneyToCents(data.sellingPrice);
    if (purchase < 0 || selling < 0) throw new Error("Please enter a valid price.");
    if (selling === 0) throw new Error("Selling price must be greater than zero.");
    const sql = await getSql();
    const clash = await sql<{ id: number }>`
      select id from medicines
      where user_id = ${context.userId} and lower(code) = ${data.code.toLowerCase()} and id <> ${data.id}
      limit 1`;
    if (clash[0]) throw new Error("A medicine with this code already exists.");
    const rows = await sql<MedicineRow>`
      update medicines set
        code = ${data.code.toUpperCase()},
        name = ${data.name},
        generic_name = ${data.genericName},
        category = ${data.category},
        unit = ${data.unit},
        purchase_price = ${centsToDecimalString(purchase)},
        selling_price = ${centsToDecimalString(selling)},
        min_stock = ${data.minStock},
        status = ${data.status},
        updated_at = now()
      where id = ${data.id} and user_id = ${context.userId}
      returning *`;
    if (!rows[0]) throw new Error("Medicine not found.");
    await writeAudit(sql, context.userId, "Medicine updated", "medicine", data.id, data.name);
    return mapMedicine(rows[0]);
  });

export const setMedicineStatus = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) =>
    z.object({ id: z.number().int(), status: z.enum(["active", "inactive"]) }).parse(input),
  )
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const rows = await sql<MedicineRow>`
      update medicines set status = ${data.status}, updated_at = now()
      where id = ${data.id} and user_id = ${context.userId}
      returning *`;
    if (!rows[0]) throw new Error("Medicine not found.");
    const action = data.status === "inactive" ? "Medicine deactivated" : "Medicine updated";
    await writeAudit(sql, context.userId, action, "medicine", data.id, rows[0].name);
    return mapMedicine(rows[0]);
  });

export const deleteMedicine = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => z.object({ id: z.number().int() }).parse(input))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const refs = await sql<{ n: number }>`
      select count(*)::int as n from sale_items where medicine_id = ${data.id} and user_id = ${context.userId}`;
    if ((refs[0]?.n ?? 0) > 0) {
      throw new Error("This medicine is used on invoices, so it cannot be deleted. Deactivate it instead.");
    }
    const existing = await sql<{ name: string }>`
      select name from medicines where id = ${data.id} and user_id = ${context.userId}`;
    if (!existing[0]) throw new Error("Medicine not found.");
    await sql`delete from stock_movements where medicine_id = ${data.id} and user_id = ${context.userId}`;
    await sql`delete from medicines where id = ${data.id} and user_id = ${context.userId}`;
    await writeAudit(sql, context.userId, "Medicine deactivated", "medicine", data.id, existing[0].name);
    return { ok: true };
  });

export const adjustStock = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) =>
    z.object({
      medicineId: z.number().int(),
      type: z.enum(["add", "remove", "correction"]),
      quantity: z.number().int().positive("Please enter a valid quantity."),
      reason: z.string().trim().min(1, "Please enter a reason.").max(200),
    }).parse(input),
  )
  .handler(async ({ context, data }) => {
    return withTransaction(async (sql) => {
      const rows = await sql<MedicineRow>`
        select * from medicines
        where id = ${data.medicineId} and user_id = ${context.userId}
        for update`;
      if (!rows[0]) throw new Error("Medicine not found.");
      const previous = Number(rows[0].current_stock);
      let next = previous;
      if (data.type === "add") next = previous + data.quantity;
      else if (data.type === "remove") next = previous - data.quantity;
      else next = data.quantity;
      if (next < 0) throw new Error("Stock must never be negative.");
      const updated = await sql<MedicineRow>`
        update medicines set current_stock = ${next}, updated_at = now()
        where id = ${data.medicineId} and user_id = ${context.userId}
        returning *`;
      await sql`insert into stock_movements (
        user_id, medicine_id, adjustment_type, quantity, previous_stock, new_stock, reason
      ) values (
        ${context.userId}, ${data.medicineId}, ${data.type}, ${data.quantity},
        ${previous}, ${next}, ${data.reason}
      )`;
      await writeAudit(
        sql,
        context.userId,
        "Stock adjusted",
        "medicine",
        data.medicineId,
        `${rows[0].name}: ${previous} → ${next}`,
      );
      return mapMedicine(updated[0]);
    });
  });

export const listStockMovements = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: unknown) =>
    z.object({
      search: z.string().optional(),
      page: z.number().int().min(1).optional(),
      pageSize: z.number().int().min(5).max(100).optional(),
    }).parse(input ?? {}),
  )
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const search = (data.search ?? "").trim();
    const page = data.page ?? 1;
    const pageSize = data.pageSize ?? 25;
    const offset = (page - 1) * pageSize;
    const like = `%${search}%`;
    const rows = await sql.query<MovementRow & { total_count: number }>(
      `select sm.id, sm.medicine_id, m.code as medicine_code, m.name as medicine_name,
              sm.adjustment_type, sm.quantity, sm.previous_stock, sm.new_stock,
              sm.reason, sm.sale_id, sm.created_at,
              count(*) over()::int as total_count
       from stock_movements sm
       join medicines m on m.id = sm.medicine_id
       where sm.user_id = $1
         and ($2 = '' or m.name ilike $3 or m.code ilike $3 or sm.reason ilike $3)
       order by sm.created_at desc
       limit $4 offset $5`,
      [context.userId, search, like, pageSize, offset],
    );
    const total = rows[0]?.total_count ?? 0;
    return {
      items: rows.map(mapMovement),
      total,
      page,
      pageSize,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
    };
  });

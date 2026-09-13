import { numericToCents } from "@/lib/money";
import type { Medicine, Sale, SaleItem, StockMovement } from "@/lib/types";

export type MedicineRow = {
  id: number;
  code: string;
  name: string;
  generic_name: string;
  category: string;
  unit: string;
  purchase_price: string | number;
  selling_price: string | number;
  current_stock: number;
  min_stock: number;
  status: "active" | "inactive";
  created_at: string | Date;
  updated_at: string | Date;
};

export function iso(value: string | Date): string {
  return new Date(value).toISOString();
}

export function mapMedicine(row: MedicineRow): Medicine {
  const currentStock = Number(row.current_stock);
  const minStock = Number(row.min_stock);
  return {
    id: Number(row.id),
    code: row.code,
    name: row.name,
    genericName: row.generic_name,
    category: row.category,
    unit: row.unit,
    purchasePriceCents: numericToCents(row.purchase_price),
    sellingPriceCents: numericToCents(row.selling_price),
    currentStock,
    minStock,
    status: row.status,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    isLowStock: currentStock < minStock,
  };
}

export type SaleRow = {
  id: number;
  invoice_number: string;
  invoice_date: string;
  subtotal: string | number;
  discount: string | number;
  tax: string | number;
  grand_total: string | number;
  amount_paid: string | number;
  balance: string | number;
  payment_method: Sale["paymentMethod"];
  status: Sale["status"];
  notes: string;
  created_at: string | Date;
  item_count?: number | string;
};

export function mapSale(row: SaleRow, items?: SaleItem[]): Sale {
  return {
    id: Number(row.id),
    invoiceNumber: row.invoice_number,
    invoiceDate: String(row.invoice_date).slice(0, 10),
    subtotalCents: numericToCents(row.subtotal),
    discountCents: numericToCents(row.discount),
    taxCents: numericToCents(row.tax),
    grandTotalCents: numericToCents(row.grand_total),
    amountPaidCents: numericToCents(row.amount_paid),
    balanceCents: numericToCents(row.balance),
    paymentMethod: row.payment_method,
    status: row.status,
    notes: row.notes ?? "",
    itemCount: Number(row.item_count ?? items?.length ?? 0),
    createdAt: iso(row.created_at),
    items,
  };
}

export type SaleItemRow = {
  id: number;
  medicine_id: number;
  medicine_code: string;
  medicine_name: string;
  quantity: number;
  bonus?: number | null;
  unit_price: string | number;
  line_total: string | number;
};

export function mapSaleItem(row: SaleItemRow): SaleItem {
  return {
    id: Number(row.id),
    medicineId: Number(row.medicine_id),
    medicineCode: row.medicine_code,
    medicineName: row.medicine_name,
    quantity: Number(row.quantity),
    bonus: Number(row.bonus ?? 0),
    unitPriceCents: numericToCents(row.unit_price),
    lineTotalCents: numericToCents(row.line_total),
  };
}

export type MovementRow = {
  id: number;
  medicine_id: number;
  medicine_code: string;
  medicine_name: string;
  adjustment_type: StockMovement["adjustmentType"];
  quantity: number;
  previous_stock: number;
  new_stock: number;
  reason: string;
  sale_id: number | null;
  created_at: string | Date;
};

export function mapMovement(row: MovementRow): StockMovement {
  return {
    id: Number(row.id),
    medicineId: Number(row.medicine_id),
    medicineCode: row.medicine_code,
    medicineName: row.medicine_name,
    adjustmentType: row.adjustment_type,
    quantity: Number(row.quantity),
    previousStock: Number(row.previous_stock),
    newStock: Number(row.new_stock),
    reason: row.reason,
    saleId: row.sale_id === null || row.sale_id === undefined ? null : Number(row.sale_id),
    createdAt: iso(row.created_at),
  };
}

export async function writeAudit(
  sql: { query: <T>(text: string, params?: unknown[]) => Promise<T[]> } & ((
    strings: TemplateStringsArray,
    ...values: unknown[]
  ) => Promise<unknown[]>),
  userId: string,
  action: string,
  entity = "",
  entityId: string | number = "",
  details = "",
) {
  await sql`insert into audit_logs (user_id, action, entity, entity_id, details)
    values (${userId}, ${action}, ${entity}, ${String(entityId)}, ${details})`;
}

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useWorkspace } from "@/components/workspace-provider";
import { formatDisplayDate } from "@/lib/format";
import { centsToDecimalString, formatCents, parseMoneyToCents } from "@/lib/money";
import { PAYMENT_METHODS, type Medicine, type PaymentMethod } from "@/lib/types";
import { completeSale, previewNextInvoice } from "@/server/billing";
import { listActiveMedicines } from "@/server/inventory";

export const Route = createFileRoute("/_app/billing")({
  component: BillingPage,
});

type Line = {
  key: string;
  medicineId: number;
  code: string;
  name: string;
  quantity: number;
  bonus: number;
  unitPrice: string;
  maxStock: number;
};

function BillingPage() {
  const settings = useWorkspace();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const medicines = useQuery({
    queryKey: ["active-medicines"],
    queryFn: () => listActiveMedicines(),
  });
  const next = useQuery({
    queryKey: ["next-invoice"],
    queryFn: () => previewNextInvoice(),
  });

  const [selectedId, setSelectedId] = useState<string>("");
  const [qty, setQty] = useState("1");
  const [bonus, setBonus] = useState("0");
  const [unitPrice, setUnitPrice] = useState("");
  const [filter, setFilter] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [discount, setDiscount] = useState(
    settings.defaultDiscount ? String(settings.defaultDiscount) : "0.00",
  );
  const [tax, setTax] = useState("0.00");
  const [paid, setPaid] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [busy, setBusy] = useState(false);

  const selected = medicines.data?.find((m) => String(m.id) === selectedId);

  const filtered = (medicines.data ?? []).filter((m) => {
    if (!filter.trim()) return true;
    const q = filter.toLowerCase();
    return m.name.toLowerCase().includes(q) || m.code.toLowerCase().includes(q);
  });

  function chooseMedicine(m: Medicine) {
    setSelectedId(String(m.id));
    setUnitPrice(centsToDecimalString(m.sellingPriceCents));
    setFilter("");
    if (settings.defaultTaxPercent > 0) {
      /* tax is recomputed from lines below */
    }
  }

  function addItem() {
    if (!selected) {
      toast.error("Select a medicine.");
      return;
    }
    const quantity = Number(qty);
    const bonusQty = Number(bonus);
    if (!Number.isInteger(quantity) || quantity <= 0) {
      toast.error("Please enter a valid quantity.");
      return;
    }
    if (!Number.isInteger(bonusQty) || bonusQty < 0) {
      toast.error("Please enter a valid bonus (free units).");
      return;
    }
    let priceCents: number;
    try {
      priceCents = parseMoneyToCents(unitPrice);
    } catch {
      toast.error("Please enter a valid price.");
      return;
    }
    if (priceCents <= 0) {
      toast.error("Please enter a valid price.");
      return;
    }
    const already = lines
      .filter((l) => l.medicineId === selected.id)
      .reduce((s, l) => s + l.quantity + l.bonus, 0);
    const need = already + quantity + bonusQty;
    if (need > selected.currentStock) {
      toast.error(
        `Insufficient stock. Need ${need} (including bonus), available: ${selected.currentStock}.`,
      );
      return;
    }
    setLines((prev) => [
      ...prev,
      {
        key: `${selected.id}-${Date.now()}`,
        medicineId: selected.id,
        code: selected.code,
        name: selected.name,
        quantity,
        bonus: bonusQty,
        unitPrice: centsToDecimalString(priceCents),
        maxStock: selected.currentStock,
      },
    ]);
    setQty("1");
    setBonus("0");
  }

  const totals = useMemo(() => {
    const subtotal = lines.reduce((sum, line) => {
      try {
        return sum + parseMoneyToCents(line.unitPrice) * line.quantity;
      } catch {
        return sum;
      }
    }, 0);
    let discountCents = 0;
    let taxCents = 0;
    try {
      discountCents = parseMoneyToCents(discount || "0");
    } catch {
      discountCents = 0;
    }
    try {
      taxCents = parseMoneyToCents(tax || "0");
    } catch {
      taxCents = 0;
    }
    const grand = subtotal - discountCents + taxCents;
    let paidCents = 0;
    try {
      paidCents = parseMoneyToCents(paid || "0");
    } catch {
      paidCents = 0;
    }
    return { subtotal, discountCents, taxCents, grand, paidCents, balance: paidCents - grand };
  }, [lines, discount, tax, paid]);

  async function complete() {
    if (!lines.length) {
      toast.error("Add at least one item.");
      return;
    }
    setBusy(true);
    try {
      const sale = await completeSale({
        data: {
          items: lines.map((l) => ({
            medicineId: l.medicineId,
            quantity: l.quantity,
            bonus: l.bonus,
            unitPrice: l.unitPrice,
          })),
          discount: discount || "0",
          tax: tax || "0",
          amountPaid: paid || "0",
          paymentMethod: method,
        },
      });
      toast.success(`Invoice ${sale.invoiceNumber} completed`);
      await queryClient.invalidateQueries();
      await navigate({ to: "/invoices/$id", params: { id: String(sale.id) } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to complete the invoice.");
    } finally {
      setBusy(false);
    }
  }

  const symbol = settings.currencySymbol;

  return (
    <div className="pb-28 lg:pb-0">
      <PageHeader
        title="New invoice"
        description={`${settings.pharmacyName} · ${formatDisplayDate(new Date())}`}
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Invoice no.</p>
          <p className="font-mono font-medium">{next.data?.invoiceNumber ?? "—"}</p>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Date</p>
          <p>{formatDisplayDate(new Date())}</p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <section className="app-card p-4 sm:p-5">
          <h2 className="mb-4 font-display text-lg font-semibold">Add item</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="medicine-filter">Medicine</Label>
              <Input
                id="medicine-filter"
                placeholder="Type name or code"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
              <div className="max-h-44 overflow-auto rounded-lg border border-border">
                {(filter ? filtered : medicines.data ?? []).slice(0, 8).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => chooseMedicine(m)}
                    className={`flex w-full items-center justify-between px-3 py-2.5 text-left text-sm hover:bg-muted ${selectedId === String(m.id) ? "bg-primary/8" : ""}`}
                  >
                    <span>
                      <span className="font-medium">{m.name}</span>
                      <span className="ml-2 font-mono text-xs text-muted-foreground">{m.code}</span>
                    </span>
                    <span className="tabular text-xs text-muted-foreground">
                      {m.currentStock} in stock
                    </span>
                  </button>
                ))}
                {!medicines.data?.length ? (
                  <p className="px-3 py-3 text-sm text-muted-foreground">No active medicines.</p>
                ) : null}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="qty">Quantity</Label>
              <Input
                id="qty"
                type="number"
                min={1}
                value={qty}
                onChange={(e) => setQty(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bonus">Bonus (free)</Label>
              <Input
                id="bonus"
                type="number"
                min={0}
                value={bonus}
                onChange={(e) => setBonus(e.target.value)}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="price">Unit price</Label>
              <Input
                id="price"
                inputMode="decimal"
                value={unitPrice}
                onChange={(e) => setUnitPrice(e.target.value)}
              />
            </div>
          </div>
          <Button className="mt-4 w-full sm:w-auto" type="button" onClick={addItem}>
            <Plus className="h-4 w-4" />
            Add item
          </Button>

          <div className="mt-6 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-3">Medicine</th>
                  <th className="py-2 pr-3">Qty</th>
                  <th className="py-2 pr-3">Bonus</th>
                  <th className="py-2 pr-3">Price</th>
                  <th className="py-2 pr-3">Total</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {lines.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-muted-foreground">
                      No items yet.
                    </td>
                  </tr>
                ) : (
                  lines.map((line) => {
                    let lineTotal = 0;
                    try {
                      lineTotal = parseMoneyToCents(line.unitPrice) * line.quantity;
                    } catch {
                      lineTotal = 0;
                    }
                    return (
                      <tr key={line.key} className="border-b border-border">
                        <td className="py-2.5 pr-3">
                          <div className="font-medium">{line.name}</div>
                          <div className="font-mono text-xs text-muted-foreground">{line.code}</div>
                        </td>
                        <td className="tabular py-2.5 pr-3">{line.quantity}</td>
                        <td className="tabular py-2.5 pr-3">{line.bonus}</td>
                        <td className="tabular py-2.5 pr-3">
                          {formatCents(parseMoneyToCents(line.unitPrice), symbol)}
                        </td>
                        <td className="tabular py-2.5 pr-3">{formatCents(lineTotal, symbol)}</td>
                        <td className="py-2.5 text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Remove"
                            onClick={() => setLines((prev) => prev.filter((l) => l.key !== line.key))}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="app-card flex flex-col p-4 sm:p-5">
          <h2 className="mb-4 font-display text-lg font-semibold">Totals</h2>
          <dl className="space-y-2 text-sm">
            <Row label="Subtotal" value={formatCents(totals.subtotal, symbol)} />
            <div className="grid grid-cols-2 items-center gap-3">
              <Label htmlFor="discount">Discount</Label>
              <Input
                id="discount"
                className="text-right"
                inputMode="decimal"
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 items-center gap-3">
              <Label htmlFor="tax">Tax</Label>
              <Input
                id="tax"
                className="text-right"
                inputMode="decimal"
                value={tax}
                onChange={(e) => setTax(e.target.value)}
              />
            </div>
            <Row label="Grand total" value={formatCents(Math.max(totals.grand, 0), symbol)} strong />
          </dl>

          <div className="mt-5 space-y-3">
            <div className="space-y-1.5">
              <Label>Payment method</Label>
              <Select value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="paid">Amount paid</Label>
              <Input
                id="paid"
                inputMode="decimal"
                value={paid}
                onChange={(e) => setPaid(e.target.value)}
                placeholder={centsToDecimalString(Math.max(totals.grand, 0))}
              />
            </div>
            <Row
              label="Balance"
              value={formatCents(totals.balance, symbol)}
              strong
            />
          </div>

          <Button
            className="mt-6 hidden h-12 w-full text-base lg:inline-flex"
            onClick={complete}
            disabled={busy || lines.length === 0}
          >
            {busy ? "Creating invoice…" : "Complete sale"}
          </Button>
        </section>
      </div>

      <div className="no-print fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/95 p-3 backdrop-blur lg:hidden">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Total</span>
          <span className="font-semibold tabular">
            {formatCents(Math.max(totals.grand, 0), symbol)}
          </span>
        </div>
        <Button
          className="h-12 w-full text-base"
          onClick={complete}
          disabled={busy || lines.length === 0}
        >
          {busy ? "Creating invoice…" : "Complete sale"}
        </Button>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={`tabular ${strong ? "font-display text-lg font-semibold" : "font-medium"}`}>
        {value}
      </dd>
    </div>
  );
}

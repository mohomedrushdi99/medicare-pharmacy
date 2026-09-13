import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Package, Pencil, Plus, Trash2, Warehouse } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useWorkspace } from "@/components/workspace-provider";
import { formatDateTime, stockTypeLabel } from "@/lib/format";
import { formatCents } from "@/lib/money";
import type { Medicine } from "@/lib/types";
import {
  adjustStock,
  listMedicines,
  listStockMovements,
  setMedicineStatus,
} from "@/server/inventory";

export const Route = createFileRoute("/_app/inventory/")({
  component: InventoryPage,
});

function InventoryPage() {
  return (
    <div>
      <PageHeader
        title="Inventory"
        description="Medicines, stock levels and adjustment history."
        actions={
          <Button asChild>
            <Link to="/inventory/new">
              <Plus className="h-4 w-4" />
              Add medicine
            </Link>
          </Button>
        }
      />
      <Tabs defaultValue="medicines">
        <TabsList>
          <TabsTrigger value="medicines">Medicines</TabsTrigger>
          <TabsTrigger value="history">Stock history</TabsTrigger>
        </TabsList>
        <TabsContent value="medicines">
          <MedicineTable />
        </TabsContent>
        <TabsContent value="history">
          <StockHistory />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function MedicineTable() {
  const settings = useWorkspace();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "inactive" | "low">("all");
  const [page, setPage] = useState(1);
  const [adjusting, setAdjusting] = useState<Medicine | null>(null);

  const list = useQuery({
    queryKey: ["medicines", search, status, page],
    queryFn: () => listMedicines({ data: { search, status, page, pageSize: 25 } }),
  });

  const deactivate = useMutation({
    mutationFn: (id: number) => setMedicineStatus({ data: { id, status: "inactive" } }),
    onSuccess: async () => {
      toast.success("Medicine deactivated");
      await queryClient.invalidateQueries({ queryKey: ["medicines"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="app-card overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row">
        <Input
          placeholder="Search name or code"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="sm:max-w-xs"
        />
        <Select
          value={status}
          onValueChange={(v) => {
            setStatus(v as typeof status);
            setPage(1);
          }}
        >
          <SelectTrigger className="sm:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
            <SelectItem value="low">Low stock</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {list.isPending ? (
        <div className="space-y-2 p-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : !list.data?.items.length ? (
        <EmptyState
          icon={<Package className="h-5 w-5" />}
          title="No medicines found"
          description="Add a medicine to start tracking stock and billing."
          action={
            <Button asChild>
              <Link to="/inventory/new">Add medicine</Link>
            </Button>
          }
        />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Medicine code</TableHead>
                <TableHead>Medicine name</TableHead>
                <TableHead className="hidden md:table-cell">Category</TableHead>
                <TableHead className="hidden lg:table-cell">Purchase</TableHead>
                <TableHead>Selling</TableHead>
                <TableHead>Stock</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.data.items.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="font-mono text-xs">{m.code}</TableCell>
                  <TableCell>
                    <div className="font-medium">{m.name}</div>
                    {m.genericName ? (
                      <div className="text-xs text-muted-foreground">{m.genericName}</div>
                    ) : null}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">{m.category}</TableCell>
                  <TableCell className="hidden tabular lg:table-cell">
                    {formatCents(m.purchasePriceCents, settings.currencySymbol)}
                  </TableCell>
                  <TableCell className="tabular">
                    {formatCents(m.sellingPriceCents, settings.currencySymbol)}
                  </TableCell>
                  <TableCell className="tabular">{m.currentStock}</TableCell>
                  <TableCell>
                    {m.status === "inactive" ? (
                      <Badge variant="secondary">Inactive</Badge>
                    ) : m.isLowStock ? (
                      <Badge variant="warning">Low stock</Badge>
                    ) : (
                      <Badge variant="success">Active</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" asChild aria-label="Edit">
                        <Link to="/inventory/$id" params={{ id: String(m.id) }}>
                          <Pencil className="h-4 w-4" />
                        </Link>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Adjust stock"
                        onClick={() => setAdjusting(m)}
                      >
                        <Warehouse className="h-4 w-4" />
                      </Button>
                      {m.status === "active" ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Deactivate"
                          onClick={() => deactivate.mutate(m.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setMedicineStatus({ data: { id: m.id, status: "active" } }).then(
                              async () => {
                                toast.success("Medicine reactivated");
                                await queryClient.invalidateQueries({ queryKey: ["medicines"] });
                              },
                            )
                          }
                        >
                          Restore
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pager
            page={list.data.page}
            pageCount={list.data.pageCount}
            total={list.data.total}
            onPage={setPage}
          />
        </>
      )}

      <StockDialog
        medicine={adjusting}
        onClose={() => setAdjusting(null)}
        onSaved={async () => {
          setAdjusting(null);
          await queryClient.invalidateQueries({ queryKey: ["medicines"] });
          await queryClient.invalidateQueries({ queryKey: ["stock-history"] });
        }}
      />
    </div>
  );
}

function StockDialog({
  medicine,
  onClose,
  onSaved,
}: {
  medicine: Medicine | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [type, setType] = useState<"add" | "remove" | "correction">("add");
  const [quantity, setQuantity] = useState("1");
  const [reason, setReason] = useState("New stock received");
  const [busy, setBusy] = useState(false);

  const reasons = useMemo(() => {
    if (type === "add") return ["New stock received", "Returned stock", "Manual correction"];
    if (type === "remove") return ["Damaged stock", "Expired disposal", "Manual correction"];
    return ["Manual correction", "Stock count", "Opening balance"];
  }, [type]);

  async function submit() {
    if (!medicine) return;
    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty <= 0) {
      toast.error("Please enter a valid quantity.");
      return;
    }
    setBusy(true);
    try {
      await adjustStock({
        data: { medicineId: medicine.id, type, quantity: qty, reason },
      });
      toast.success("Stock updated");
      await onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to update stock.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={Boolean(medicine)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adjust stock</DialogTitle>
          <DialogDescription>
            {medicine ? `${medicine.name} · on hand ${medicine.currentStock}` : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="space-y-1.5">
            <Label>Adjustment type</Label>
            <Select value={type} onValueChange={(v) => setType(v as typeof type)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="add">Add stock</SelectItem>
                <SelectItem value="remove">Remove stock</SelectItem>
                <SelectItem value="correction">Set exact quantity</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="qty">Quantity</Label>
            <Input
              id="qty"
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Reason</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {reasons.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? "Updating stock…" : "Save adjustment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StockHistory() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const list = useQuery({
    queryKey: ["stock-history", search, page],
    queryFn: () => listStockMovements({ data: { search, page, pageSize: 25 } }),
  });

  return (
    <div className="app-card overflow-hidden">
      <div className="border-b border-border p-4">
        <Input
          placeholder="Search medicine or reason"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="sm:max-w-xs"
        />
      </div>
      {list.isPending ? (
        <div className="p-4">
          <Skeleton className="h-24 w-full" />
        </div>
      ) : !list.data?.items.length ? (
        <EmptyState
          icon={<Warehouse className="h-5 w-5" />}
          title="No stock movements"
          description="Adjustments and sales will appear here."
        />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Medicine</TableHead>
                <TableHead>Adjustment</TableHead>
                <TableHead>Qty</TableHead>
                <TableHead className="hidden md:table-cell">Previous</TableHead>
                <TableHead>New</TableHead>
                <TableHead className="hidden lg:table-cell">Reason</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.data.items.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="whitespace-nowrap text-xs">
                    {formatDateTime(m.createdAt)}
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{m.medicineName}</div>
                    <div className="font-mono text-xs text-muted-foreground">{m.medicineCode}</div>
                  </TableCell>
                  <TableCell>{stockTypeLabel(m.adjustmentType)}</TableCell>
                  <TableCell className="tabular">{m.quantity}</TableCell>
                  <TableCell className="hidden tabular md:table-cell">{m.previousStock}</TableCell>
                  <TableCell className="tabular">{m.newStock}</TableCell>
                  <TableCell className="hidden lg:table-cell">{m.reason}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pager
            page={list.data.page}
            pageCount={list.data.pageCount}
            total={list.data.total}
            onPage={setPage}
          />
        </>
      )}
    </div>
  );
}

function Pager({
  page,
  pageCount,
  total,
  onPage,
}: {
  page: number;
  pageCount: number;
  total: number;
  onPage: (n: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm text-muted-foreground">
      <span>
        {total} record{total === 1 ? "" : "s"}
      </span>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= pageCount}
          onClick={() => onPage(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

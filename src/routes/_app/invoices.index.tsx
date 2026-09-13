import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { FileText } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useWorkspace } from "@/components/workspace-provider";
import { downloadInvoicePdf } from "@/lib/download-pdf";
import { formatDisplayDate } from "@/lib/format";
import { formatCents } from "@/lib/money";
import { listInvoices } from "@/server/billing";

export const Route = createFileRoute("/_app/invoices/")({
  component: InvoicesPage,
});

function InvoicesPage() {
  const settings = useWorkspace();
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [downloading, setDownloading] = useState<number | null>(null);

  const list = useQuery({
    queryKey: ["invoices", search, from, to, page],
    queryFn: () => listInvoices({ data: { search, from, to, page, pageSize: 15 } }),
  });

  async function onPdf(id: number) {
    setDownloading(id);
    try {
      await downloadInvoicePdf(id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Invoice could not be generated.");
    } finally {
      setDownloading(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Invoices"
        description="Search, view, print and download completed sales."
        actions={
          <Button asChild>
            <Link to="/billing">New invoice</Link>
          </Button>
        }
      />
      <div className="app-card overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-border p-4 lg:flex-row">
          <Input
            placeholder="Search invoice number"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="lg:max-w-xs"
          />
          <Input
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(1);
            }}
            aria-label="From date"
          />
          <Input
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(1);
            }}
            aria-label="To date"
          />
        </div>

        {list.isPending ? (
          <div className="p-4">
            <Skeleton className="h-40 w-full" />
          </div>
        ) : !list.data?.items.length ? (
          <EmptyState
            icon={<FileText className="h-5 w-5" />}
            title="No invoices"
            description="Completed sales will appear in this list."
            action={
              <Button asChild>
                <Link to="/billing">Create an invoice</Link>
              </Button>
            }
          />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead className="hidden md:table-cell">Paid</TableHead>
                  <TableHead className="hidden lg:table-cell">Balance</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.data.items.map((sale) => (
                  <TableRow key={sale.id}>
                    <TableCell className="font-mono text-xs">{sale.invoiceNumber}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {formatDisplayDate(sale.invoiceDate)}
                    </TableCell>
                    <TableCell className="tabular">{sale.itemCount}</TableCell>
                    <TableCell className="tabular">
                      {formatCents(sale.grandTotalCents, settings.currencySymbol)}
                    </TableCell>
                    <TableCell className="hidden tabular md:table-cell">
                      {formatCents(sale.amountPaidCents, settings.currencySymbol)}
                    </TableCell>
                    <TableCell className="hidden tabular lg:table-cell">
                      {formatCents(sale.balanceCents, settings.currencySymbol)}
                    </TableCell>
                    <TableCell>
                      {sale.amountPaidCents >= sale.grandTotalCents ? (
                        <Badge variant="success">Paid</Badge>
                      ) : sale.amountPaidCents > 0 ? (
                        <Badge variant="warning">Partial</Badge>
                      ) : (
                        <Badge variant="secondary">Unpaid</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" asChild>
                          <Link to="/invoices/$id" params={{ id: String(sale.id) }}>
                            View
                          </Link>
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={downloading === sale.id}
                          onClick={() => onPdf(sale.id)}
                        >
                          {downloading === sale.id ? "Generating PDF…" : "PDF"}
                        </Button>
                        <Button variant="outline" size="sm" asChild>
                          <Link to="/invoices/$id" params={{ id: String(sale.id) }} search={{ print: true }}>
                            Print
                          </Link>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm text-muted-foreground">
              <span>{list.data.total} invoices</span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= list.data.pageCount}
                  onClick={() => setPage(page + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

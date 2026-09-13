import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { PharmacyMark } from "@/components/pharmacy-mark";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { downloadInvoicePdf } from "@/lib/download-pdf";
import { formatDisplayDate, paymentMethodLabel } from "@/lib/format";
import { formatCents } from "@/lib/money";
import { getInvoice } from "@/server/billing";

export const Route = createFileRoute("/_app/invoices/$id")({
  validateSearch: (search: Record<string, unknown>): { print?: boolean } => {
    if (search.print === true || search.print === "true") return { print: true };
    return {};
  },
  component: InvoiceDetailPage,
});

function InvoiceDetailPage() {
  const { id } = Route.useParams();
  const { print } = Route.useSearch();
  const invoiceId = useMemo(() => Number(id), [id]);
  const [downloading, setDownloading] = useState(false);

  const query = useQuery({
    queryKey: ["invoice", invoiceId],
    enabled: Number.isFinite(invoiceId) && invoiceId > 0,
    queryFn: () => getInvoice({ data: { id: invoiceId } }),
    retry: 1,
  });

  useEffect(() => {
    if (!print || !query.data) return;
    const timer = window.setTimeout(() => window.print(), 300);
    return () => window.clearTimeout(timer);
  }, [print, query.data]);

  async function onPdf() {
    setDownloading(true);
    try {
      await downloadInvoicePdf(invoiceId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Invoice could not be generated.");
    } finally {
      setDownloading(false);
    }
  }

  if (!Number.isFinite(invoiceId) || invoiceId <= 0) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">Invalid invoice link.</p>
        <Button variant="outline" asChild>
          <Link to="/invoices">Back to invoices</Link>
        </Button>
      </div>
    );
  }

  if (query.isPending) {
    return <Skeleton className="mx-auto h-[80vh] max-w-3xl rounded-xl" />;
  }

  if (query.isError || !query.data) {
    const message =
      query.error instanceof Error
        ? query.error.message
        : "Invoice not found or could not be loaded.";
    return (
      <div className="mx-auto max-w-lg space-y-4 rounded-xl border border-border bg-card p-6">
        <p className="font-display text-lg font-semibold">Unable to open invoice</p>
        <p className="text-sm text-muted-foreground">{message}</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link to="/invoices">Back to invoices</Link>
          </Button>
          <Button onClick={() => query.refetch()}>Try again</Button>
        </div>
      </div>
    );
  }

  const { sale, settings } = query.data;
  const symbol = settings?.currencySymbol ?? "Rs.";
  const contactLines = [
    settings?.address,
    settings?.phone ? `Contact: ${settings.phone}` : "",
    settings?.email ? `Email: ${settings.email}` : "",
    // Website intentionally omitted from invoice print/view
  ].filter(Boolean);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="no-print mb-4 flex flex-wrap items-center gap-2">
        <Button variant="outline" asChild>
          <Link to="/invoices">Back to invoices</Link>
        </Button>
        <Button onClick={onPdf} disabled={downloading}>
          {downloading ? "Generating PDF…" : "Download PDF"}
        </Button>
        <Button variant="secondary" onClick={() => window.print()}>
          Print
        </Button>
      </div>

      <article className="print-invoice app-card p-6 sm:p-10">
        <header className="flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            {settings?.logoData ? (
              <img src={settings.logoData} alt="" className="h-12 w-12 rounded-xl object-contain" />
            ) : (
              <span className="text-primary">
                <PharmacyMark />
              </span>
            )}
            <div>
              <h1 className="font-display text-2xl font-semibold tracking-tight">
                {settings?.pharmacyName ?? "Medicare Pharmacy"}
              </h1>
              {settings?.subtitle ? (
                <p className="text-sm text-muted-foreground">{settings.subtitle}</p>
              ) : null}
              <div className="mt-2 max-w-sm space-y-0.5 text-xs leading-relaxed text-muted-foreground">
                {contactLines.map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </div>
              {settings?.taxVatNumber ? (
                <p className="mt-1 text-xs text-muted-foreground">Tax / VAT: {settings.taxVatNumber}</p>
              ) : null}
            </div>
          </div>
          <div className="text-left sm:text-right">
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Invoice</p>
            <p className="mt-1 font-mono text-sm font-medium">{sale.invoiceNumber}</p>
            <p className="text-sm text-muted-foreground">{formatDisplayDate(sale.invoiceDate)}</p>
          </div>
        </header>

        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-2">No.</th>
                <th className="py-2 pr-2">Medicine</th>
                <th className="py-2 pr-2">Qty</th>
                <th className="py-2 pr-2">Bonus</th>
                <th className="py-2 pr-2">Unit price</th>
                <th className="py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {sale.items?.map((item, index) => (
                <tr key={item.id} className="border-b border-border">
                  <td className="py-2.5 pr-2 tabular">{index + 1}</td>
                  <td className="py-2.5 pr-2">
                    <div>{item.medicineName}</div>
                    <div className="font-mono text-xs text-muted-foreground">{item.medicineCode}</div>
                  </td>
                  <td className="py-2.5 pr-2 tabular">{item.quantity}</td>
                  <td className="py-2.5 pr-2 tabular">{item.bonus ?? 0}</td>
                  <td className="py-2.5 pr-2 tabular">
                    {formatCents(item.unitPriceCents, symbol)}
                  </td>
                  <td className="py-2.5 text-right tabular">
                    {formatCents(item.lineTotalCents, symbol)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <dl className="ml-auto mt-6 max-w-xs space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Subtotal</dt>
            <dd className="tabular">{formatCents(sale.subtotalCents, symbol)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Discount</dt>
            <dd className="tabular">{formatCents(sale.discountCents, symbol)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Tax</dt>
            <dd className="tabular">{formatCents(sale.taxCents, symbol)}</dd>
          </div>
          <div className="flex justify-between border-t border-border pt-2 font-display text-base font-semibold">
            <dt>Grand total</dt>
            <dd className="tabular">{formatCents(sale.grandTotalCents, symbol)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Paid</dt>
            <dd className="tabular">{formatCents(sale.amountPaidCents, symbol)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Balance</dt>
            <dd className="tabular">{formatCents(sale.balanceCents, symbol)}</dd>
          </div>
          <div className="flex justify-between pt-2">
            <dt className="text-muted-foreground">Payment</dt>
            <dd>{paymentMethodLabel(sale.paymentMethod)}</dd>
          </div>
        </dl>

        {(settings?.invoiceFooter || settings?.termsAndConditions) && (
          <footer className="mt-10 border-t border-border pt-4 text-xs leading-relaxed text-muted-foreground">
            {settings.invoiceFooter ? <p>{settings.invoiceFooter}</p> : null}
            {settings.termsAndConditions ? <p className="mt-2">{settings.termsAndConditions}</p> : null}
          </footer>
        )}
      </article>
    </div>
  );
}

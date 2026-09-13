import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { format, parseISO } from "date-fns";
import {
  Boxes,
  FileText,
  Package,
  Pill,
  ShoppingBag,
  TriangleAlert,
} from "lucide-react";
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useWorkspace } from "@/components/workspace-provider";
import { formatCents } from "@/lib/money";
import { getDashboard } from "@/server/billing";

export const Route = createFileRoute("/_app/")({ component: DashboardPage });

function DashboardPage() {
  const settings = useWorkspace();
  const stats = useQuery({ queryKey: ["dashboard"], queryFn: () => getDashboard() });
  const symbol = settings.currencySymbol;

  const cards = [
    {
      key: "medicines",
      show: settings.showTotalMedicines,
      label: "Total medicines",
      value: stats.data ? String(stats.data.totalMedicines) : "—",
      hint: "Active and inactive records",
      icon: Pill,
    },
    {
      key: "stock",
      show: settings.showTotalStock,
      label: "Total stock",
      value: stats.data ? stats.data.totalStock.toLocaleString() : "—",
      hint: "Units on hand",
      icon: Boxes,
    },
    {
      key: "low",
      show: settings.showLowStock,
      label: "Low stock",
      value: stats.data ? String(stats.data.lowStock) : "—",
      hint: "Below minimum level",
      icon: TriangleAlert,
      warn: (stats.data?.lowStock ?? 0) > 0,
    },
    {
      key: "sales",
      show: settings.showTodaySales,
      label: "Today's sales",
      value: stats.data ? formatCents(stats.data.todaySalesCents, symbol) : "—",
      hint: "Completed invoices today",
      icon: ShoppingBag,
    },
    {
      key: "invoices",
      show: settings.showTodayInvoices,
      label: "Today's invoices",
      value: stats.data ? String(stats.data.todayInvoices) : "—",
      hint: "Created today",
      icon: FileText,
    },
    {
      key: "value",
      show: settings.showStockValue,
      label: "Stock value",
      value: stats.data ? formatCents(stats.data.stockValueCents, symbol) : "—",
      hint: "At purchase price",
      icon: Package,
    },
  ].filter((c) => c.show);

  const chartData =
    stats.data?.dailySales.map((d) => ({
      label: format(parseISO(d.date), "dd MMM"),
      total: d.totalCents / 100,
    })) ?? [];

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description={`Good day. ${settings.pharmacyName} is ready for the counter.`}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to="/inventory">Inventory</Link>
            </Button>
            <Button asChild>
              <Link to="/billing">New invoice</Link>
            </Button>
          </>
        }
      />

      {stats.isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {cards.map((card) => {
            const Icon = card.icon;
            return (
              <article key={card.key} className="app-card p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm text-muted-foreground">{card.label}</p>
                    <p
                      className={`mt-2 font-display text-2xl font-semibold tabular tracking-tight ${card.warn ? "text-warning" : ""}`}
                    >
                      {card.value}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">{card.hint}</p>
                  </div>
                  <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
                    <Icon className="h-4.5 w-4.5" />
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {settings.showSalesChart ? (
        <section className="app-card mt-6 p-5">
          <div className="mb-4 flex items-end justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-semibold">Seven-day sales</h2>
              <p className="text-sm text-muted-foreground">Completed invoice totals</p>
            </div>
          </div>
          <div className="h-56">
            {stats.isPending ? (
              <Skeleton className="h-full w-full" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} barSize={28}>
                  <XAxis dataKey="label" axisLine={false} tickLine={false} fontSize={12} />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    fontSize={12}
                    width={48}
                    tickFormatter={(v) => `${v}`}
                  />
                  <Tooltip
                    cursor={{ fill: "var(--muted)" }}
                    formatter={(value: number) => [formatCents(Math.round(value * 100), symbol), "Sales"]}
                  />
                  <Bar dataKey="total" fill="var(--primary)" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}

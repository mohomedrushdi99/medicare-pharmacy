import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent, type ReactNode } from "react";
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
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useWorkspace } from "@/components/workspace-provider";
import { authClient } from "@/lib/auth/client";
import { ACCENT_PRESETS } from "@/lib/types";
import { contrastOn } from "@/lib/utils";
import { recordAudit, updateSettings } from "@/server/workspace";

export const Route = createFileRoute("/_app/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const settings = useWorkspace();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    pharmacyName: settings.pharmacyName,
    subtitle: settings.subtitle,
    address: settings.address,
    phone: settings.phone,
    email: settings.email,
    website: settings.website,
    taxVatNumber: settings.taxVatNumber,
    logoData: settings.logoData,
    invoicePrefix: settings.invoicePrefix,
    nextInvoiceNumber: settings.nextInvoiceNumber,
    currency: settings.currency,
    currencySymbol: settings.currencySymbol,
    defaultTaxPercent: settings.defaultTaxPercent,
    defaultDiscount: settings.defaultDiscount,
    invoiceFooter: settings.invoiceFooter,
    termsAndConditions: settings.termsAndConditions,
    accentColor: settings.accentColor,
    theme: settings.theme,
    sidebarAppearance: settings.sidebarAppearance,
    layoutDensity: settings.layoutDensity,
    appName: settings.appName,
    showTodaySales: settings.showTodaySales,
    showTodayInvoices: settings.showTodayInvoices,
    showTotalMedicines: settings.showTotalMedicines,
    showTotalStock: settings.showTotalStock,
    showLowStock: settings.showLowStock,
    showStockValue: settings.showStockValue,
    showSalesChart: settings.showSalesChart,
  });
  const [busy, setBusy] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function save() {
    setBusy(true);
    try {
      await updateSettings({
        data: {
          ...form,
          nextInvoiceNumber: Number(form.nextInvoiceNumber),
          defaultTaxPercent: Number(form.defaultTaxPercent),
          defaultDiscount: Number(form.defaultDiscount),
        },
      });
      await queryClient.invalidateQueries({ queryKey: ["workspace"] });
      toast.success("Settings saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to save settings.");
    } finally {
      setBusy(false);
    }
  }

  async function onLogo(file: File | undefined) {
    if (!file) return;
    if (file.size > 400_000) {
      toast.error("Please choose a logo smaller than 400KB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => set("logoData", String(reader.result ?? ""));
    reader.readAsDataURL(file);
  }

  async function changePassword(e: FormEvent) {
    e.preventDefault();
    setPasswordBusy(true);
    try {
      const { error } = await authClient.changePassword({
        currentPassword,
        newPassword,
      });
      if (error) throw new Error(error.message ?? "Unable to change password.");
      await recordAudit({ data: { action: "Password changed", entity: "user" } });
      setCurrentPassword("");
      setNewPassword("");
      toast.success("Password changed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to change password.");
    } finally {
      setPasswordBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Pharmacy details, invoices and appearance. Changes apply immediately after save."
        actions={
          <Button onClick={save} disabled={busy}>
            {busy ? "Saving…" : "Save settings"}
          </Button>
        }
      />

      <Tabs defaultValue="pharmacy">
        <TabsList className="h-auto w-full flex-wrap justify-start">
          <TabsTrigger value="pharmacy">Pharmacy</TabsTrigger>
          <TabsTrigger value="invoice">Invoices</TabsTrigger>
          <TabsTrigger value="appearance">Appearance</TabsTrigger>
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="account">Account</TabsTrigger>
        </TabsList>

        <TabsContent value="pharmacy">
          <section className="app-card grid max-w-3xl gap-4 p-5 sm:grid-cols-2">
            <Field label="Pharmacy name" className="sm:col-span-2">
              <Input value={form.pharmacyName} onChange={(e) => set("pharmacyName", e.target.value)} />
            </Field>
            <Field label="Subtitle" className="sm:col-span-2">
              <Input value={form.subtitle} onChange={(e) => set("subtitle", e.target.value)} />
            </Field>
            <Field label="Address" className="sm:col-span-2">
              <Textarea value={form.address} onChange={(e) => set("address", e.target.value)} />
            </Field>
            <Field label="Phone">
              <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} />
            </Field>
            <Field label="Email">
              <Input value={form.email} onChange={(e) => set("email", e.target.value)} />
            </Field>
            <Field label="Website">
              <Input value={form.website} onChange={(e) => set("website", e.target.value)} />
            </Field>
            <Field label="Tax / VAT number">
              <Input value={form.taxVatNumber} onChange={(e) => set("taxVatNumber", e.target.value)} />
            </Field>
            <Field label="Logo" className="sm:col-span-2">
              <Input
                type="file"
                accept="image/png,image/jpeg"
                onChange={(e) => onLogo(e.target.files?.[0])}
              />
              {form.logoData ? (
                <img src={form.logoData} alt="Pharmacy logo" className="mt-3 h-16 w-16 rounded-xl object-contain" />
              ) : null}
            </Field>
          </section>
        </TabsContent>

        <TabsContent value="invoice">
          <section className="app-card grid max-w-3xl gap-4 p-5 sm:grid-cols-2">
            <Field label="Invoice prefix">
              <Input value={form.invoicePrefix} onChange={(e) => set("invoicePrefix", e.target.value)} />
            </Field>
            <Field label="Next invoice number">
              <Input
                type="number"
                min={1}
                value={form.nextInvoiceNumber}
                onChange={(e) => set("nextInvoiceNumber", Number(e.target.value))}
              />
            </Field>
            <Field label="Currency">
              <Input value={form.currency} onChange={(e) => set("currency", e.target.value)} />
            </Field>
            <Field label="Currency symbol">
              <Input value={form.currencySymbol} onChange={(e) => set("currencySymbol", e.target.value)} />
            </Field>
            <Field label="Default tax %">
              <Input
                type="number"
                min={0}
                step="0.01"
                value={form.defaultTaxPercent}
                onChange={(e) => set("defaultTaxPercent", Number(e.target.value))}
              />
            </Field>
            <Field label="Default discount">
              <Input
                type="number"
                min={0}
                step="0.01"
                value={form.defaultDiscount}
                onChange={(e) => set("defaultDiscount", Number(e.target.value))}
              />
            </Field>
            <Field label="Invoice footer" className="sm:col-span-2">
              <Textarea
                value={form.invoiceFooter}
                onChange={(e) => set("invoiceFooter", e.target.value)}
              />
            </Field>
            <Field label="Terms and conditions" className="sm:col-span-2">
              <Textarea
                value={form.termsAndConditions}
                onChange={(e) => set("termsAndConditions", e.target.value)}
              />
            </Field>
          </section>
        </TabsContent>

        <TabsContent value="appearance">
          <section className="app-card grid max-w-3xl gap-4 p-5 sm:grid-cols-2">
            <Field label="Application name" className="sm:col-span-2">
              <Input value={form.appName} onChange={(e) => set("appName", e.target.value)} />
            </Field>
            <Field label="Theme">
              <Select value={form.theme} onValueChange={(v) => set("theme", v as typeof form.theme)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="system">System</SelectItem>
                  <SelectItem value="light">Light</SelectItem>
                  <SelectItem value="dark">Dark</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Sidebar">
              <Select
                value={form.sidebarAppearance}
                onValueChange={(v) => set("sidebarAppearance", v as typeof form.sidebarAppearance)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="expanded">Expanded</SelectItem>
                  <SelectItem value="compact">Compact</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Layout">
              <Select
                value={form.layoutDensity}
                onValueChange={(v) => set("layoutDensity", v as typeof form.layoutDensity)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="comfortable">Comfortable</SelectItem>
                  <SelectItem value="compact">Compact</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Accent colour" className="sm:col-span-2">
              <div className="flex flex-wrap gap-2">
                {ACCENT_PRESETS.map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    onClick={() => set("accentColor", preset.value)}
                    className="h-9 w-9 rounded-full border border-border"
                    style={{ background: preset.value }}
                    aria-label={preset.name}
                    title={preset.name}
                  />
                ))}
                <Input
                  type="color"
                  className="h-9 w-14 p-1"
                  value={form.accentColor}
                  onChange={(e) => set("accentColor", e.target.value.toUpperCase())}
                />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Preview uses {form.accentColor} with {contrastOn(form.accentColor)} text.
              </p>
            </Field>
          </section>
        </TabsContent>

        <TabsContent value="dashboard">
          <section className="app-card max-w-xl space-y-4 p-5">
            {(
              [
                ["showTodaySales", "Today's sales"],
                ["showTodayInvoices", "Today's invoices"],
                ["showTotalMedicines", "Total medicines"],
                ["showTotalStock", "Total stock"],
                ["showLowStock", "Low stock"],
                ["showStockValue", "Stock value"],
                ["showSalesChart", "Seven-day sales chart"],
              ] as const
            ).map(([key, label]) => (
              <div key={key} className="flex items-center justify-between gap-3">
                <Label htmlFor={key}>{label}</Label>
                <Switch
                  id={key}
                  checked={form[key]}
                  onCheckedChange={(checked) => set(key, checked)}
                />
              </div>
            ))}
          </section>
        </TabsContent>

        <TabsContent value="account">
          <form className="app-card max-w-md space-y-4 p-5" onSubmit={changePassword}>
            <p className="text-sm text-muted-foreground">
              Change the password for this operator account. Social sign-in accounts may not use a password.
            </p>
            <Field label="Current password">
              <Input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
              />
            </Field>
            <Field label="New password">
              <Input
                type="password"
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
              />
            </Field>
            <Button type="submit" disabled={passwordBusy}>
              {passwordBusy ? "Updating…" : "Change password"}
            </Button>
          </form>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <Label className="mb-1.5 block">{label}</Label>
      {children}
    </div>
  );
}

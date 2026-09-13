import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useNavigate } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { z } from "zod";
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
import { MEDICINE_CATEGORIES, MEDICINE_UNITS, type Medicine } from "@/lib/types";
import { centsToDecimalString } from "@/lib/money";
import { createMedicine, updateMedicine } from "@/server/inventory";

const schema = z.object({
  code: z.string().trim().min(1, "Medicine code is required"),
  name: z.string().trim().min(1, "Medicine name is required"),
  genericName: z.string().trim(),
  category: z.string().trim().min(1, "Category is required"),
  unit: z.string().trim().min(1, "Unit is required"),
  purchasePrice: z.string().min(1, "Purchase price is required"),
  sellingPrice: z.string().min(1, "Selling price is required"),
  minStock: z.string().min(1, "Minimum stock is required"),
  initialStock: z.string().min(1, "Initial stock is required"),
  status: z.enum(["active", "inactive"]),
});

type Values = z.infer<typeof schema>;

function parseCount(raw: string, label: string): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) throw new Error(`${label} cannot be negative.`);
  return n;
}

export function MedicineForm({ medicine }: { medicine?: Medicine }) {
  const navigate = useNavigate();
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: medicine
      ? {
          code: medicine.code,
          name: medicine.name,
          genericName: medicine.genericName,
          category: medicine.category || "Other",
          unit: medicine.unit,
          purchasePrice: centsToDecimalString(medicine.purchasePriceCents),
          sellingPrice: centsToDecimalString(medicine.sellingPriceCents),
          minStock: String(medicine.minStock),
          initialStock: String(medicine.currentStock),
          status: medicine.status,
        }
      : {
          code: "",
          name: "",
          genericName: "",
          category: "Antibiotic",
          unit: "Box",
          purchasePrice: "",
          sellingPrice: "",
          minStock: "10",
          initialStock: "0",
          status: "active",
        },
  });

  async function onSubmit(values: Values) {
    try {
      const minStock = parseCount(values.minStock, "Minimum stock");
      const initialStock = parseCount(values.initialStock, "Stock");
      if (medicine) {
        await updateMedicine({
          data: {
            id: medicine.id,
            code: values.code,
            name: values.name,
            genericName: values.genericName,
            category: values.category,
            unit: values.unit,
            purchasePrice: values.purchasePrice,
            sellingPrice: values.sellingPrice,
            minStock,
            status: values.status,
          },
        });
        toast.success("Medicine updated");
      } else {
        await createMedicine({
          data: {
            code: values.code,
            name: values.name,
            genericName: values.genericName,
            category: values.category,
            unit: values.unit,
            purchasePrice: values.purchasePrice,
            sellingPrice: values.sellingPrice,
            minStock,
            initialStock,
            status: values.status,
          },
        });
        toast.success("Medicine saved");
      }
      await navigate({ to: "/inventory" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to save medicine.");
    }
  }

  const busy = form.formState.isSubmitting;

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="app-card max-w-3xl p-5 sm:p-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Medicine code" required error={form.formState.errors.code?.message}>
          <Input id="code" {...form.register("code")} autoComplete="off" />
        </Field>
        <Field label="Medicine name" required error={form.formState.errors.name?.message}>
          <Input id="name" {...form.register("name")} />
        </Field>
        <Field label="Generic name" error={form.formState.errors.genericName?.message}>
          <Input id="genericName" {...form.register("genericName")} />
        </Field>
        <Field label="Category" required>
          <Select
            value={form.watch("category")}
            onValueChange={(v) => form.setValue("category", v, { shouldValidate: true })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select category" />
            </SelectTrigger>
            <SelectContent>
              {MEDICINE_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Unit" required>
          <Select
            value={form.watch("unit")}
            onValueChange={(v) => form.setValue("unit", v, { shouldValidate: true })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select unit" />
            </SelectTrigger>
            <SelectContent>
              {MEDICINE_UNITS.map((u) => (
                <SelectItem key={u} value={u}>
                  {u}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Purchase price" required error={form.formState.errors.purchasePrice?.message}>
          <Input id="purchasePrice" inputMode="decimal" {...form.register("purchasePrice")} />
        </Field>
        <Field label="Selling price" required error={form.formState.errors.sellingPrice?.message}>
          <Input id="sellingPrice" inputMode="decimal" {...form.register("sellingPrice")} />
        </Field>
        <Field label="Minimum stock level" required error={form.formState.errors.minStock?.message}>
          <Input id="minStock" type="number" min={0} {...form.register("minStock")} />
        </Field>
        {!medicine ? (
          <Field label="Initial stock" required error={form.formState.errors.initialStock?.message}>
            <Input id="initialStock" type="number" min={0} {...form.register("initialStock")} />
          </Field>
        ) : null}
        <Field label="Status" required>
          <Select
            value={form.watch("status")}
            onValueChange={(v) => form.setValue("status", v as "active" | "inactive")}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" asChild>
          <Link to="/inventory">Cancel</Link>
        </Button>
        <Button type="submit" disabled={busy}>
          {busy ? "Saving medicine…" : medicine ? "Save changes" : "Save medicine"}
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  required,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>
        {label}
        {required ? <span className="ml-0.5 text-destructive">*</span> : null}
      </Label>
      {children}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

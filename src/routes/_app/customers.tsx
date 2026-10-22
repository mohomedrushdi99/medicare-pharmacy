import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Pencil, UserRoundPlus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { createCustomer, listCustomers, updateCustomer } from "@/server/customers";

export const Route = createFileRoute("/_app/customers")({
  component: CustomersPage,
});

function CustomersPage() {
  const queryClient = useQueryClient();
  const customers = useQuery({
    queryKey: ["customers"],
    queryFn: () => listCustomers(),
  });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);

  function resetForm() {
    setEditingId(null);
    setName("");
    setPhone("");
    setAddress("");
  }

  function editCustomer(customer: NonNullable<typeof customers.data>[number]) {
    setEditingId(customer.id);
    setName(customer.name);
    setPhone(customer.phone);
    setAddress(customer.address);
  }

  async function saveCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      if (editingId === null) {
        await createCustomer({ data: { name, phone, address } });
        toast.success("Customer registered.");
      } else {
        await updateCustomer({ data: { id: editingId, name, phone, address } });
        toast.success("Customer updated.");
      }
      await queryClient.invalidateQueries({ queryKey: ["customers"] });
      resetForm();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Customer could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  const filteredCustomers = (customers.data ?? []).filter((customer) => {
    const term = search.trim().toLowerCase();
    return (
      !term ||
      customer.name.toLowerCase().includes(term) ||
      customer.phone.toLowerCase().includes(term) ||
      customer.address.toLowerCase().includes(term)
    );
  });

  return (
    <div>
      <PageHeader
        title="Customers"
        description="Register and manage customers. Select a saved customer while billing to fill in their details."
      />

      <form onSubmit={saveCustomer} className="app-card mb-6 space-y-4 p-4 sm:p-5">
        <h2 className="font-display text-lg font-semibold">
          {editingId === null ? "Register customer" : "Edit customer"}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="customer-registration-name">Name</Label>
            <Input
              id="customer-registration-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={200}
              autoComplete="name"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="customer-registration-phone">Phone</Label>
            <Input
              id="customer-registration-phone"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              maxLength={40}
              autoComplete="tel"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="customer-registration-address">Address</Label>
            <Input
              id="customer-registration-address"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              maxLength={500}
              autoComplete="street-address"
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={saving}>
            <UserRoundPlus className="h-4 w-4" />
            {saving ? "Saving…" : editingId === null ? "Register customer" : "Save changes"}
          </Button>
          {editingId !== null ? (
            <Button type="button" variant="outline" onClick={resetForm} disabled={saving}>
              Cancel
            </Button>
          ) : null}
        </div>
      </form>

      <div className="app-card overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="font-display text-lg font-semibold">Registered customers</h2>
          <Input
            className="sm:max-w-xs"
            placeholder="Search customers"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Search customers"
          />
        </div>

        {customers.isPending ? (
          <div className="p-4">
            <Skeleton className="h-40 w-full" />
          </div>
        ) : customers.isError ? (
          <div className="p-4 text-sm text-destructive">
            {customers.error instanceof Error
              ? customers.error.message
              : "Customers could not be loaded."}
          </div>
        ) : filteredCustomers.length === 0 ? (
          <EmptyState
            icon={<UserRoundPlus className="h-5 w-5" />}
            title={search ? "No matching customers" : "No customers yet"}
            description={
              search
                ? "Try another name, phone number, or address."
                : "Register a customer above to select them during billing."
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead className="hidden md:table-cell">Address</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredCustomers.map((customer) => (
                <TableRow key={customer.id}>
                  <TableCell className="font-medium">{customer.name}</TableCell>
                  <TableCell>{customer.phone || "—"}</TableCell>
                  <TableCell className="hidden max-w-sm truncate md:table-cell">
                    {customer.address || "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => editCustomer(customer)}
                    >
                      <Pencil className="h-4 w-4" />
                      Edit
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}

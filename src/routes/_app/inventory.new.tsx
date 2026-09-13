import { createFileRoute } from "@tanstack/react-router";
import { MedicineForm } from "@/components/medicine-form";
import { PageHeader } from "@/components/page-header";

export const Route = createFileRoute("/_app/inventory/new")({
  component: NewMedicinePage,
});

function NewMedicinePage() {
  return (
    <div>
      <PageHeader title="Add medicine" description="Create a new inventory record." />
      <MedicineForm />
    </div>
  );
}

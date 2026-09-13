import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { MedicineForm } from "@/components/medicine-form";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { getMedicine } from "@/server/inventory";

export const Route = createFileRoute("/_app/inventory/$id")({
  component: EditMedicinePage,
});

function EditMedicinePage() {
  const { id } = Route.useParams();
  const query = useQuery({
    queryKey: ["medicine", id],
    queryFn: () => getMedicine({ data: { id: Number(id) } }),
  });

  return (
    <div>
      <PageHeader title="Edit medicine" description="Update medicine details. Stock is changed from Adjust stock." />
      {query.isPending ? (
        <Skeleton className="h-96 max-w-3xl rounded-xl" />
      ) : query.data ? (
        <MedicineForm medicine={query.data} />
      ) : (
        <p className="text-sm text-muted-foreground">Medicine not found.</p>
      )}
    </div>
  );
}

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { RegionsTable } from "@/components/regions-table";
import { SyncStatusCard } from "@/components/sync-status-card";
import { getRegionsPageData } from "@/lib/db/read-models";

export const dynamic = "force-dynamic";

export default async function RegionsPage() {
  const data = await getRegionsPageData();

  return (
    <main className="min-h-screen px-6 py-10 sm:px-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-8">
        <PageHeader
          eyebrow="Regions"
          title="Pregled firmi po regijama"
          description="Region aggregate pogled sa firmama, ownership mixom i income tax kontekstom."
        />

        <SyncStatusCard
          currentSnapshotCompletedAt={data.currentSnapshot?.completedAt ?? null}
          latestRun={data.latestRun}
        />

        {!data.configured ? (
          <EmptyState
            title="Database nije konfiguriran"
            description="Dodaj DATABASE_URL i sinkaj Warera podatke prije nego sto otvoris regije."
          />
        ) : !data.currentSnapshot ? (
          <EmptyState
            title="Nema snapshota"
            description="Pokreni protected sync rutu da bi se izgradile region aggregate tablice."
          />
        ) : (
          <RegionsTable regions={data.regions} />
        )}
      </div>
    </main>
  );
}

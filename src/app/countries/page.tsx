import { CountriesTable } from "@/components/countries-table";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { SyncStatusCard } from "@/components/sync-status-card";
import { getCountriesPageData } from "@/lib/db/read-models";

export const revalidate = 600;

export default async function CountriesPage() {
  const data = await getCountriesPageData();

  return (
    <main className="min-h-screen px-6 py-10 sm:px-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-8">
        <PageHeader
          eyebrow="Countries"
          title="Porez i distribucija firmi po drzavama"
          description="Country aggregate pogled iz zadnjeg promoviranog snapshota."
        />

        <SyncStatusCard
          currentSnapshotCompletedAt={data.currentSnapshot?.completedAt ?? null}
          latestRun={data.latestRun}
        />

        {!data.configured ? (
          <EmptyState
            title="Database nije konfiguriran"
            description="Dodaj DATABASE_URL i syncaj podatke prije nego sto otvoris analytics tablice."
          />
        ) : !data.currentSnapshot ? (
          <EmptyState
            title="Nema snapshota"
            description="Pokreni protected sync rutu da bi se izgradile country aggregate tablice."
          />
        ) : (
          <CountriesTable countries={data.countries} />
        )}
      </div>
    </main>
  );
}

import { CountryTaxTool } from "@/components/country-tax-tool";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { SyncStatusCard } from "@/components/sync-status-card";
import { getCountryTaxToolPageData } from "@/lib/db/read-models";

export const revalidate = 600;

export default async function CountryTaxPage() {
  const data = await getCountryTaxToolPageData();

  return (
    <main className="min-h-screen px-6 py-10 sm:px-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-8">
        <PageHeader
          eyebrow="Tools"
          title="Country tax income"
          description="UTC hourly tool za analizu tax incomea po drzavi, itemu, owner originu i core statusu regije."
          backHref="/tools"
        />

        <SyncStatusCard
          currentSnapshotCompletedAt={data.currentSnapshot?.completedAt ?? null}
          latestRun={data.latestRun}
        />

        {!data.configured ? (
          <EmptyState
            title="Database nije konfiguriran"
            description="Dodaj DATABASE_URL prije koristenja tools stranica koje citaju tax history."
          />
        ) : data.availableCountries.length === 0 ||
          !data.earliestHour ||
          !data.latestHour ? (
          <EmptyState
            title="Tax history jos nije dostupna"
            description="Tool ce postati aktivan nakon prvog uspjesnog hourly synca koji upise country tax facts."
          />
        ) : (
          <CountryTaxTool
            countries={data.availableCountries}
            itemCodes={data.availableItemCodes}
            earliestHour={data.earliestHour}
            latestHour={data.latestHour}
          />
        )}
      </div>
    </main>
  );
}

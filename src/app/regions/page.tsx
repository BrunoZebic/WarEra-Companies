import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { SyncStatusCard } from "@/components/sync-status-card";
import { getRegionsPageData } from "@/lib/db/read-models";
import { formatDecimal, formatNumber, formatPercent } from "@/lib/formatters";

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
          <section className="overflow-hidden rounded-[1.75rem] border border-stone-200 bg-white/80">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-stone-50 text-stone-500">
                  <tr>
                    <th className="px-5 py-4 font-medium">Regija</th>
                    <th className="px-5 py-4 font-medium">Drzava</th>
                    <th className="px-5 py-4 font-medium">Income tax</th>
                    <th className="px-5 py-4 font-medium">Development</th>
                    <th className="px-5 py-4 font-medium">Firme</th>
                    <th className="px-5 py-4 font-medium">Domace</th>
                    <th className="px-5 py-4 font-medium">Strano</th>
                    <th className="px-5 py-4 font-medium">Unique owner countries</th>
                    <th className="px-5 py-4 font-medium">Top owner country</th>
                  </tr>
                </thead>
                <tbody>
                  {data.regions.map((region) => (
                    <tr key={region.regionId} className="border-t border-stone-100">
                      <td className="px-5 py-4">
                        <Link
                          href={`/regions/${region.regionCode}`}
                          className="font-medium text-stone-950 hover:text-emerald-900"
                        >
                          {region.regionName}
                        </Link>
                      </td>
                      <td className="px-5 py-4">{region.countryName}</td>
                      <td className="px-5 py-4">{formatPercent(region.incomeTax)}</td>
                      <td className="px-5 py-4">
                        {formatDecimal(region.development, 2)}
                      </td>
                      <td className="px-5 py-4">{formatNumber(region.companyCount)}</td>
                      <td className="px-5 py-4">
                        {formatNumber(region.domesticOwnedCount)}
                      </td>
                      <td className="px-5 py-4">
                        {formatNumber(region.foreignOwnedCount)}
                      </td>
                      <td className="px-5 py-4">
                        {formatNumber(region.uniqueOwnerCountries)}
                      </td>
                      <td className="px-5 py-4">
                        {region.topOwnerCountryName ?? "Nema podatka"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

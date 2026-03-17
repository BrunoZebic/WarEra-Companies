import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { SyncStatusCard } from "@/components/sync-status-card";
import { getCountriesPageData } from "@/lib/db/read-models";
import { formatNumber, formatPercent } from "@/lib/formatters";

export const dynamic = "force-dynamic";

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
          <section className="overflow-hidden rounded-[1.75rem] border border-stone-200 bg-white/80">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-stone-50 text-stone-500">
                  <tr>
                    <th className="px-5 py-4 font-medium">Drzava</th>
                    <th className="px-5 py-4 font-medium">Income tax</th>
                    <th className="px-5 py-4 font-medium">Market tax</th>
                    <th className="px-5 py-4 font-medium">Self work tax</th>
                    <th className="px-5 py-4 font-medium">Firme</th>
                    <th className="px-5 py-4 font-medium">Regije s firmama</th>
                    <th className="px-5 py-4 font-medium">Domace</th>
                    <th className="px-5 py-4 font-medium">Strano</th>
                    <th className="px-5 py-4 font-medium">Unique owner countries</th>
                    <th className="px-5 py-4 font-medium">Top owner country</th>
                  </tr>
                </thead>
                <tbody>
                  {data.countries.map((country) => (
                    <tr key={country.countryId} className="border-t border-stone-100">
                      <td className="px-5 py-4">
                        <Link
                          href={`/countries/${country.countryCode}`}
                          className="font-medium text-stone-950 hover:text-emerald-900"
                        >
                          {country.countryName}
                        </Link>
                      </td>
                      <td className="px-5 py-4">{formatPercent(country.incomeTax)}</td>
                      <td className="px-5 py-4">{formatPercent(country.marketTax)}</td>
                      <td className="px-5 py-4">{formatPercent(country.selfWorkTax)}</td>
                      <td className="px-5 py-4">{formatNumber(country.companyCount)}</td>
                      <td className="px-5 py-4">
                        {formatNumber(country.regionsWithCompanies)}
                      </td>
                      <td className="px-5 py-4">
                        {formatNumber(country.domesticOwnedCount)}
                      </td>
                      <td className="px-5 py-4">
                        {formatNumber(country.foreignOwnedCount)}
                      </td>
                      <td className="px-5 py-4">
                        {formatNumber(country.uniqueOwnerCountries)}
                      </td>
                      <td className="px-5 py-4">
                        {country.topOwnerCountryName ?? "Nema podatka"}
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

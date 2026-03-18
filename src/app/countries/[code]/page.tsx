import { notFound } from "next/navigation";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { SyncStatusCard } from "@/components/sync-status-card";
import { getCountryDetailData } from "@/lib/db/read-models";
import { formatNumber, formatPercent } from "@/lib/formatters";

export const dynamic = "force-dynamic";

type CountryDetailPageProps = {
  params: Promise<{
    code: string;
  }>;
};

export default async function CountryDetailPage({
  params,
}: CountryDetailPageProps) {
  const { code } = await params;
  const data = await getCountryDetailData(code);

  if (data.configured && data.currentSnapshot && !data.country) {
    notFound();
  }

  return (
    <main className="min-h-screen px-6 py-10 sm:px-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-8">
        <PageHeader
          eyebrow="Country detail"
          title={data.country?.countryName ?? code.toUpperCase()}
          description="Detaljni pregled poreza, ownership mixa i regija unutar odabrane drzave."
          backHref="/countries"
        />

        <SyncStatusCard
          currentSnapshotCompletedAt={data.currentSnapshot?.completedAt ?? null}
          latestRun={data.latestRun}
        />

        {!data.configured ? (
          <EmptyState
            title="Database nije konfiguriran"
            description="Dodaj DATABASE_URL prije otvaranja country detail stranica."
          />
        ) : !data.currentSnapshot || !data.country ? (
          <EmptyState
            title="Nema podataka za prikaz"
            description="Za ovu drzavu jos nema promoviranih snapshot podataka."
          />
        ) : (
          <>
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="Income tax"
                value={formatPercent(data.country.incomeTax)}
              />
              <StatCard
                label="Market tax"
                value={formatPercent(data.country.marketTax)}
              />
              <StatCard
                label="Ukupno firmi"
                value={formatNumber(data.country.companyCount)}
              />
              <StatCard
                label="Ownership mix"
                value={`${formatNumber(data.country.domesticOwnedCount)} / ${formatNumber(data.country.foreignOwnedCount)}`}
                hint="Domace / strano"
              />
            </section>

            <section className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
              <article className="rounded-[1.75rem] border border-blue-800/30 bg-blue-950/40 p-6">
                <h2 className="text-xl font-semibold text-white">Sazetak</h2>
                <dl className="mt-5 space-y-3 text-sm">
                  <div className="flex items-center justify-between gap-4 border-b border-blue-900/40 pb-3">
                    <dt className="text-slate-400">Regije s firmama</dt>
                    <dd className="font-medium text-blue-100">
                      {formatNumber(data.country.regionsWithCompanies)}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-4 border-b border-blue-900/40 pb-3">
                    <dt className="text-slate-400">Unique owner countries</dt>
                    <dd className="font-medium text-blue-100">
                      {formatNumber(data.country.uniqueOwnerCountries)}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <dt className="text-slate-400">Top owner country</dt>
                    <dd className="font-medium text-blue-100">
                      {data.country.topOwnerCountryName ?? "Nema podatka"}
                    </dd>
                  </div>
                </dl>
              </article>

              <article className="overflow-hidden rounded-[1.75rem] border border-blue-800/30 bg-blue-950/40">
                <div className="border-b border-blue-900/40 px-6 py-5">
                  <h2 className="text-xl font-semibold text-white">
                    Regije u ovoj drzavi
                  </h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-blue-950/60 text-slate-500">
                      <tr>
                        <th className="px-5 py-4 font-medium">Regija</th>
                        <th className="px-5 py-4 font-medium">Firme</th>
                        <th className="px-5 py-4 font-medium">Domace</th>
                        <th className="px-5 py-4 font-medium">Strano</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.regions.map((region) => (
                        <tr key={region.regionId} className="border-t border-blue-900/30">
                          <td className="px-5 py-4 font-medium text-blue-100">
                            {region.regionName}
                          </td>
                          <td className="px-5 py-4 text-slate-300">{formatNumber(region.companyCount)}</td>
                          <td className="px-5 py-4 text-slate-300">
                            {formatNumber(region.domesticOwnedCount)}
                          </td>
                          <td className="px-5 py-4 text-slate-300">
                            {formatNumber(region.foreignOwnedCount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>
            </section>

            <section className="overflow-hidden rounded-[1.75rem] border border-blue-800/30 bg-blue-950/40">
              <div className="border-b border-blue-900/40 px-6 py-5">
                <h2 className="text-xl font-semibold text-white">
                  Primjer firmi iz drzave
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-blue-950/60 text-slate-500">
                    <tr>
                      <th className="px-5 py-4 font-medium">Firma</th>
                      <th className="px-5 py-4 font-medium">Regija</th>
                      <th className="px-5 py-4 font-medium">Item</th>
                      <th className="px-5 py-4 font-medium">Vlasnik</th>
                      <th className="px-5 py-4 font-medium">Owner country</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.companies.map((company) => (
                      <tr key={company.companyId} className="border-t border-blue-900/30">
                        <td className="px-5 py-4 font-medium text-blue-100">
                          {company.companyName}
                        </td>
                        <td className="px-5 py-4 text-slate-300">{company.regionName}</td>
                        <td className="px-5 py-4 text-slate-300">{company.itemCode ?? "-"}</td>
                        <td className="px-5 py-4 text-slate-300">{company.ownerUsername ?? "-"}</td>
                        <td className="px-5 py-4 text-slate-300">
                          {company.ownerCountryName ?? "Nema podatka"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}

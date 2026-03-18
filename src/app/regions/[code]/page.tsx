import { notFound } from "next/navigation";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { SyncStatusCard } from "@/components/sync-status-card";
import { getRegionDetailData } from "@/lib/db/read-models";
import { formatDecimal, formatNumber, formatPercent } from "@/lib/formatters";

export const revalidate = 600;

type RegionDetailPageProps = {
  params: Promise<{
    code: string;
  }>;
};

export default async function RegionDetailPage({
  params,
}: RegionDetailPageProps) {
  const { code } = await params;
  const data = await getRegionDetailData(code);

  if (data.configured && data.currentSnapshot && !data.region) {
    notFound();
  }

  return (
    <main className="min-h-screen px-6 py-10 sm:px-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-8">
        <PageHeader
          eyebrow="Region detail"
          title={data.region?.regionName ?? code}
          description="Detaljan pregled ownership mixa i underlying company rows za odabranu regiju."
          backHref="/regions"
        />

        <SyncStatusCard
          currentSnapshotCompletedAt={data.currentSnapshot?.completedAt ?? null}
          latestRun={data.latestRun}
        />

        {!data.configured ? (
          <EmptyState
            title="Database nije konfiguriran"
            description="Dodaj DATABASE_URL prije otvaranja region detail stranica."
          />
        ) : !data.currentSnapshot || !data.region ? (
          <EmptyState
            title="Nema podataka za prikaz"
            description="Za ovu regiju jos nema promoviranih snapshot podataka."
          />
        ) : (
          <>
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <StatCard label="Drzava" value={data.region.countryName} />
              <StatCard
                label="Income tax"
                value={formatPercent(data.region.incomeTax)}
              />
              <StatCard
                label="Development"
                value={formatDecimal(data.region.development, 2)}
              />
              <StatCard
                label="Ukupno firmi"
                value={formatNumber(data.region.companyCount)}
                hint={`${formatNumber(data.region.domesticOwnedCount)} domace / ${formatNumber(data.region.foreignOwnedCount)} strano`}
              />
            </section>

            <section className="grid gap-5 lg:grid-cols-[0.75fr_1.25fr]">
              <article className="rounded-[1.75rem] border border-blue-800/30 bg-blue-950/40 p-6">
                <h2 className="text-xl font-semibold text-white">
                  Ownership sazetak
                </h2>
                <dl className="mt-5 space-y-3 text-sm">
                  <div className="flex items-center justify-between gap-4 border-b border-blue-900/40 pb-3">
                    <dt className="text-slate-400">Domace vlasnistvo</dt>
                    <dd className="font-medium text-blue-100">
                      {formatNumber(data.region.domesticOwnedCount)}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-4 border-b border-blue-900/40 pb-3">
                    <dt className="text-slate-400">Strano vlasnistvo</dt>
                    <dd className="font-medium text-blue-100">
                      {formatNumber(data.region.foreignOwnedCount)}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-4 border-b border-blue-900/40 pb-3">
                    <dt className="text-slate-400">Unique owner countries</dt>
                    <dd className="font-medium text-blue-100">
                      {formatNumber(data.region.uniqueOwnerCountries)}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <dt className="text-slate-400">Top owner country</dt>
                    <dd className="font-medium text-blue-100">
                      {data.region.topOwnerCountryName ?? "Nema podatka"}
                    </dd>
                  </div>
                </dl>
              </article>

              <article className="overflow-hidden rounded-[1.75rem] border border-blue-800/30 bg-blue-950/40">
                <div className="border-b border-blue-900/40 px-6 py-5">
                  <h2 className="text-xl font-semibold text-white">
                    Firme u regiji
                  </h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-blue-950/60 text-slate-500">
                      <tr>
                        <th className="px-5 py-4 font-medium">Firma</th>
                        <th className="px-5 py-4 font-medium">Item</th>
                        <th className="px-5 py-4 font-medium">Vlasnik</th>
                        <th className="px-5 py-4 font-medium">Owner country</th>
                        <th className="px-5 py-4 font-medium">Workers</th>
                        <th className="px-5 py-4 font-medium">Est. value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.companies.map((company) => (
                        <tr key={company.companyId} className="border-t border-blue-900/30">
                          <td className="px-5 py-4 font-medium text-blue-100">
                            {company.companyName}
                          </td>
                          <td className="px-5 py-4 text-slate-300">{company.itemCode ?? "-"}</td>
                          <td className="px-5 py-4 text-slate-300">{company.ownerUsername ?? "-"}</td>
                          <td className="px-5 py-4 text-slate-300">
                            {company.ownerCountryName ?? "Nema podatka"}
                          </td>
                          <td className="px-5 py-4 text-slate-300">
                            {formatNumber(company.workerCount)}
                          </td>
                          <td className="px-5 py-4 text-slate-300">
                            {formatNumber(Math.round(company.estimatedValue ?? 0))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>
            </section>
          </>
        )}
      </div>
    </main>
  );
}

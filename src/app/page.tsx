import Link from "next/link";
import { ArrowRight, Building2, Flag, Globe2 } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { StatCard } from "@/components/stat-card";
import { SyncStatusCard } from "@/components/sync-status-card";
import { getDashboardData } from "@/lib/db/read-models";
import { formatNumber, formatPercent } from "@/lib/formatters";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const data = await getDashboardData();

  return (
    <main className="min-h-screen px-6 py-10 sm:px-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-8">
        <section className="rounded-[2rem] border border-black/10 bg-white/80 p-8 shadow-[0_20px_80px_rgba(15,23,42,0.08)] backdrop-blur">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl space-y-4">
              <p className="inline-flex items-center gap-2 rounded-full border border-emerald-700/20 bg-emerald-700/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-emerald-900">
                <Globe2 className="h-3.5 w-3.5" />
                Warera analytics
              </p>
              <h1 className="text-4xl font-semibold tracking-tight text-stone-950 sm:text-5xl">
                Pregled firmi, vlasnistva i poreza u Wareri.
              </h1>
              <p className="max-w-2xl text-base leading-7 text-stone-700 sm:text-lg">
                Dashboard cita zadnji promovirani snapshot iz baze i prikazuje
                broj firmi po drzavama i regijama, plus vlasnicku strukturu po
                trenutnoj Warera drzavi vlasnika.
              </p>
            </div>

            <div className="grid gap-3 rounded-3xl border border-stone-200 bg-stone-950 p-5 text-stone-50 sm:min-w-80">
              <div className="flex items-center gap-3 text-sm text-stone-300">
                <Building2 className="h-4 w-4 text-emerald-300" />
                Snapshot pipeline koristi Postgres + Warera SDK
              </div>
              <div className="flex items-center gap-3 text-sm text-stone-300">
                <Flag className="h-4 w-4 text-amber-300" />
                Sync je spreman za vanjski scheduler svakih 6 sati
              </div>
              <div className="flex gap-3 pt-2">
                <Link
                  href="/regions"
                  className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-medium text-stone-950 transition hover:bg-stone-100"
                >
                  Regije
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/countries"
                  className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/10"
                >
                  Drzave
                </Link>
              </div>
            </div>
          </div>
        </section>

        <SyncStatusCard
          currentSnapshotCompletedAt={data.currentSnapshot?.completedAt ?? null}
          latestRun={data.latestRun}
        />

        {!data.configured ? (
          <EmptyState
            title="Database jos nije konfiguriran"
            description="Postavi DATABASE_URL i pokreni sync rutu da bi dashboard mogao citati promovirani snapshot."
          />
        ) : !data.currentSnapshot || !data.metrics ? (
          <EmptyState
            title="Nema promoviranog snapshota"
            description="Aplikacija je spremna, ali jos nema sinkanih Warera podataka u bazi. Pokreni /api/internal/sync s CRON_SECRET headerom."
          />
        ) : (
          <>
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="Ukupno firmi"
                value={formatNumber(data.metrics.totalCompanies)}
              />
              <StatCard
                label="Drzave s firmama"
                value={formatNumber(data.metrics.countriesWithCompanies)}
              />
              <StatCard
                label="Regije s firmama"
                value={formatNumber(data.metrics.regionsWithCompanies)}
              />
              <StatCard
                label="Vlasnicke drzave"
                value={formatNumber(data.metrics.uniqueOwnerCountries)}
                hint={`Domace ${formatNumber(data.metrics.domesticOwnedTotal)} / Strano ${formatNumber(data.metrics.foreignOwnedTotal)}`}
              />
            </section>

            <section className="grid gap-5 lg:grid-cols-2">
              <article className="rounded-[1.75rem] border border-stone-200 bg-white/80 p-6">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-semibold text-stone-950">
                      Top drzave po broju firmi
                    </h2>
                    <p className="mt-1 text-sm text-stone-600">
                      Usporedba company counta i income taxa.
                    </p>
                  </div>
                  <Link
                    href="/countries"
                    className="text-sm font-medium text-emerald-900"
                  >
                    Sve drzave
                  </Link>
                </div>

                <div className="mt-5 overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="text-stone-500">
                      <tr>
                        <th className="pb-3 pr-4 font-medium">Drzava</th>
                        <th className="pb-3 pr-4 font-medium">Firme</th>
                        <th className="pb-3 pr-4 font-medium">Income tax</th>
                        <th className="pb-3 font-medium">Top owner country</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.topCountries.map((country) => (
                        <tr key={country.countryId} className="border-t border-stone-100">
                          <td className="py-3 pr-4">
                            <Link
                              href={`/countries/${country.countryCode}`}
                              className="font-medium text-stone-950 hover:text-emerald-900"
                            >
                              {country.countryName}
                            </Link>
                          </td>
                          <td className="py-3 pr-4">{formatNumber(country.companyCount)}</td>
                          <td className="py-3 pr-4">{formatPercent(country.incomeTax)}</td>
                          <td className="py-3">
                            {country.topOwnerCountryName ?? "Nema podatka"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>

              <article className="rounded-[1.75rem] border border-stone-200 bg-white/80 p-6">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-semibold text-stone-950">
                      Top regije po broju firmi
                    </h2>
                    <p className="mt-1 text-sm text-stone-600">
                      Najjace regije iz aktivnog snapshota.
                    </p>
                  </div>
                  <Link href="/regions" className="text-sm font-medium text-emerald-900">
                    Sve regije
                  </Link>
                </div>

                <div className="mt-5 overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="text-stone-500">
                      <tr>
                        <th className="pb-3 pr-4 font-medium">Regija</th>
                        <th className="pb-3 pr-4 font-medium">Drzava</th>
                        <th className="pb-3 pr-4 font-medium">Firme</th>
                        <th className="pb-3 font-medium">Income tax</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.topRegions.map((region) => (
                        <tr key={region.regionId} className="border-t border-stone-100">
                          <td className="py-3 pr-4">
                            <Link
                              href={`/regions/${region.regionCode}`}
                              className="font-medium text-stone-950 hover:text-emerald-900"
                            >
                              {region.regionName}
                            </Link>
                          </td>
                          <td className="py-3 pr-4">{region.countryName}</td>
                          <td className="py-3 pr-4">{formatNumber(region.companyCount)}</td>
                          <td className="py-3">{formatPercent(region.incomeTax)}</td>
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

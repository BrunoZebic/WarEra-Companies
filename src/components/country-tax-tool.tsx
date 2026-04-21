"use client";

import { useState } from "react";

import {
  addUtcHours,
  buildCountryTaxItemBreakdown,
  buildCountryTaxOwnerBreakdown,
  buildCountryTaxOwnerOptions,
  buildCountryTaxSummary,
  filterCountryTaxEntries,
  formatUtcHourInput,
  parseUtcHourInput,
  sortCountryTaxDetailedEntries,
  type CountryTaxApiResponse,
} from "@/lib/country-tax";
import {
  formatDecimal,
  formatNumber,
  formatPercent,
  formatUtcDateTime,
} from "@/lib/formatters";
import { formatItemCodeLabel } from "@/lib/products";

import { EmptyState } from "./empty-state";
import { StatCard } from "./stat-card";

type CountryTaxToolProps = {
  countries: Array<{
    code: string;
    name: string;
  }>;
  itemCodes: string[];
  earliestHour: string;
  latestHour: string;
};

type CountryTaxRouteResponse =
  | {
      ok: true;
      data: CountryTaxApiResponse;
    }
  | {
      ok: false;
      message: string;
    };

function getOwnerCountryLabel(input: {
  ownerCountryName: string | null;
  ownerCountryCode: string | null;
}) {
  return input.ownerCountryName ?? input.ownerCountryCode?.toUpperCase() ?? "Unknown country";
}

export function CountryTaxTool({
  countries,
  itemCodes,
  earliestHour,
  latestHour,
}: CountryTaxToolProps) {
  const [countryCode, setCountryCode] = useState("");
  const [fromHour, setFromHour] = useState(earliestHour);
  const [toHour, setToHour] = useState(formatUtcHourInput(addUtcHours(latestHour, 1)));
  const [itemCode, setItemCode] = useState("");
  const [coreFilter, setCoreFilter] = useState<"all" | "core">("all");
  const [ownerCountryId, setOwnerCountryId] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [hasFetched, setHasFetched] = useState(false);
  const [result, setResult] = useState<CountryTaxApiResponse | null>(null);

  const ownerOptions = result ? buildCountryTaxOwnerOptions(result.entries) : [];
  const filteredEntries = result
    ? filterCountryTaxEntries(result.entries, {
        coreFilter,
        ownerCountryId: ownerCountryId || null,
      })
    : [];
  const summary = result ? buildCountryTaxSummary(filteredEntries) : null;
  const itemBreakdown = result ? buildCountryTaxItemBreakdown(filteredEntries) : [];
  const ownerBreakdown = result ? buildCountryTaxOwnerBreakdown(filteredEntries) : [];
  const detailedEntries = result ? sortCountryTaxDetailedEntries(filteredEntries) : [];

  async function handleFetch() {
    if (!countryCode) {
      setError("Odaberi drzavu prije fetchanja podataka.");
      return;
    }

    const parsedFromHour = parseUtcHourInput(fromHour);
    const parsedToHour = parseUtcHourInput(toHour);

    if (!parsedFromHour || !parsedToHour) {
      setError("From i To moraju biti puni UTC satovi u formatu YYYY-MM-DDTHH:00.");
      return;
    }

    if (parsedFromHour >= parsedToHour) {
      setError('"From" mora biti prije "To" sata.');
      return;
    }

    setIsLoading(true);
    setError("");
    setHasFetched(true);
    setCoreFilter("all");
    setOwnerCountryId("");

    try {
      const searchParams = new URLSearchParams({
        countryCode,
        fromHour,
        toHour,
      });

      if (itemCode) {
        searchParams.set("itemCode", itemCode);
      }

      const response = await fetch(`/api/country-tax?${searchParams.toString()}`, {
        cache: "no-store",
      });
      const payload = (await response.json()) as CountryTaxRouteResponse;

      if (!response.ok || !payload.ok) {
        setResult(null);
        setError(payload.ok ? "Fetch nije uspio." : payload.message);
        return;
      }

      setResult(payload.data);
    } catch {
      setResult(null);
      setError("Fetch nije uspio. Pokusaj ponovno za nekoliko sekundi.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="rounded-[1.75rem] border border-blue-800/30 bg-blue-950/40 p-6">
        <div className="space-y-3">
          <h2 className="text-2xl font-semibold text-white">Country Tax Income</h2>
          <p className="max-w-3xl text-sm leading-6 text-slate-400">
            Hourly wage-based tax history, aggregated by item, owner country, and
            core vs non-core regions. The only raw country tax rates remain income,
            market, and self-work tax; this tool specifically uses income tax.
          </p>
          <p className="text-sm text-blue-200">
            Podaci su dostupni od {formatUtcDateTime(parseUtcHourInput(earliestHour))} UTC.
            Svaki zapis pokriva jedan jednosatni UTC bucket.
          </p>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-[1.2fr_1fr_1fr_1fr_auto]">
          <div className="space-y-2">
            <label htmlFor="country-tax-country" className="text-sm font-medium text-blue-100">
              Country
            </label>
            <select
              id="country-tax-country"
              value={countryCode}
              onChange={(event) => setCountryCode(event.target.value)}
              className="w-full rounded-2xl border border-blue-800/40 bg-blue-950/80 px-4 py-3 text-sm text-white outline-none transition focus:border-blue-400"
            >
              <option value="">-- Select a country --</option>
              {countries.map((country) => (
                <option key={country.code} value={country.code}>
                  {country.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label htmlFor="country-tax-from" className="text-sm font-medium text-blue-100">
              From (UTC)
            </label>
            <input
              id="country-tax-from"
              type="datetime-local"
              step={3600}
              min={earliestHour}
              max={formatUtcHourInput(addUtcHours(latestHour, 1))}
              value={fromHour}
              onChange={(event) => setFromHour(event.target.value)}
              className="w-full rounded-2xl border border-blue-800/40 bg-blue-950/80 px-4 py-3 text-sm text-white outline-none transition focus:border-blue-400"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="country-tax-to" className="text-sm font-medium text-blue-100">
              To (UTC)
            </label>
            <input
              id="country-tax-to"
              type="datetime-local"
              step={3600}
              min={earliestHour}
              max={formatUtcHourInput(addUtcHours(latestHour, 1))}
              value={toHour}
              onChange={(event) => setToHour(event.target.value)}
              className="w-full rounded-2xl border border-blue-800/40 bg-blue-950/80 px-4 py-3 text-sm text-white outline-none transition focus:border-blue-400"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="country-tax-item" className="text-sm font-medium text-blue-100">
              Item (optional)
            </label>
            <select
              id="country-tax-item"
              value={itemCode}
              onChange={(event) => setItemCode(event.target.value)}
              className="w-full rounded-2xl border border-blue-800/40 bg-blue-950/80 px-4 py-3 text-sm text-white outline-none transition focus:border-blue-400"
            >
              <option value="">All items</option>
              {itemCodes.map((code) => (
                <option key={code} value={code}>
                  {formatItemCodeLabel(code)}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-end">
            <button
              type="button"
              onClick={() => void handleFetch()}
              disabled={isLoading || !countryCode}
              className="inline-flex min-h-12 items-center justify-center rounded-full border border-blue-500/30 bg-blue-500/15 px-5 py-3 text-sm font-medium text-blue-100 transition hover:bg-blue-500/25 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLoading ? "Loading..." : "Fetch Tax Data"}
            </button>
          </div>
        </div>

        {error ? <p className="mt-4 text-sm text-rose-300">{error}</p> : null}
      </section>

      {result ? (
        filteredEntries.length > 0 ? (
          <>
            <section className="rounded-[1.75rem] border border-blue-800/30 bg-blue-950/40 p-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-white">
                    {result.countryName ?? countryCode.toUpperCase()}
                  </h2>
                  <p className="mt-2 text-sm text-slate-400">
                    Raspon: {formatUtcDateTime(parseUtcHourInput(result.fromHour))} UTC do{" "}
                    {formatUtcDateTime(parseUtcHourInput(result.toHour))} UTC
                  </p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label
                      htmlFor="country-tax-core-filter"
                      className="text-sm font-medium text-blue-100"
                    >
                      Core Region
                    </label>
                    <select
                      id="country-tax-core-filter"
                      value={coreFilter}
                      onChange={(event) => setCoreFilter(event.target.value as "all" | "core")}
                      className="w-full rounded-2xl border border-blue-800/40 bg-blue-950/80 px-4 py-3 text-sm text-white outline-none transition focus:border-blue-400"
                    >
                      <option value="all">All regions</option>
                      <option value="core">Core only</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label
                      htmlFor="country-tax-owner-filter"
                      className="text-sm font-medium text-blue-100"
                    >
                      Owner Country
                    </label>
                    <select
                      id="country-tax-owner-filter"
                      value={ownerCountryId}
                      onChange={(event) => setOwnerCountryId(event.target.value)}
                      className="w-full rounded-2xl border border-blue-800/40 bg-blue-950/80 px-4 py-3 text-sm text-white outline-none transition focus:border-blue-400"
                    >
                      <option value="">All countries</option>
                      {ownerOptions.map((owner) => (
                        <option key={owner.id ?? owner.code ?? "unknown"} value={owner.id ?? ""}>
                          {owner.name ?? owner.code?.toUpperCase() ?? "Unknown country"}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </section>

            {summary ? (
              <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <StatCard label="Total tax income" value={formatDecimal(summary.totalTaxIncome, 2)} />
                <StatCard label="Total wages paid" value={formatDecimal(summary.totalWagesPaid, 2)} />
                <StatCard
                  label="Companies"
                  value={formatNumber(summary.totalCompanyObservations)}
                  hint="Hourly company observations"
                />
                <StatCard label="Items produced" value={formatNumber(summary.uniqueItems)} />
                <StatCard label="Core region tax" value={formatDecimal(summary.coreTaxIncome, 2)} />
                <StatCard
                  label="Non-core region tax"
                  value={formatDecimal(summary.nonCoreTaxIncome, 2)}
                />
              </section>
            ) : null}

            {!itemCode ? (
              <section className="overflow-hidden rounded-[1.75rem] border border-blue-800/30 bg-blue-950/40">
                <div className="border-b border-blue-900/40 px-6 py-5">
                  <h2 className="text-xl font-semibold text-white">Tax Income by Item</h2>
                  <p className="mt-1 text-sm text-slate-400">
                    Breakdown of taxes collected per produced item.
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-blue-950/60 text-slate-500">
                      <tr>
                        <th className="px-5 py-4 font-medium">Item</th>
                        <th className="px-5 py-4 font-medium">Tax income</th>
                        <th className="px-5 py-4 font-medium">Wages paid</th>
                        <th className="px-5 py-4 font-medium">Avg tax rate</th>
                        <th className="px-5 py-4 font-medium">Companies</th>
                        <th className="px-5 py-4 font-medium">Share</th>
                      </tr>
                    </thead>
                    <tbody>
                      {itemBreakdown.map((entry) => (
                        <tr
                          key={entry.itemCode}
                          className="border-t border-blue-900/30"
                        >
                          <td className="px-5 py-4 font-medium text-blue-100">
                            {formatItemCodeLabel(entry.itemCode)}
                          </td>
                          <td className="px-5 py-4 text-slate-300">
                            {formatDecimal(entry.taxIncome, 2)}
                          </td>
                          <td className="px-5 py-4 text-slate-300">
                            {formatDecimal(entry.wagesPaid, 2)}
                          </td>
                          <td className="px-5 py-4 text-slate-300">
                            {formatPercent(entry.taxRate)}
                          </td>
                          <td className="px-5 py-4 text-slate-300">
                            {formatNumber(entry.companyObservations)}
                          </td>
                          <td className="px-5 py-4 text-slate-300">
                            {formatPercent(entry.share)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ) : null}

            {!ownerCountryId ? (
              <section className="overflow-hidden rounded-[1.75rem] border border-blue-800/30 bg-blue-950/40">
                <div className="border-b border-blue-900/40 px-6 py-5">
                  <h2 className="text-xl font-semibold text-white">
                    Tax Income by Company Owner Origin
                  </h2>
                  <p className="mt-1 text-sm text-slate-400">
                    How much tax income comes from companies owned by each country.
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-blue-950/60 text-slate-500">
                      <tr>
                        <th className="px-5 py-4 font-medium">Owner country</th>
                        <th className="px-5 py-4 font-medium">Tax income</th>
                        <th className="px-5 py-4 font-medium">Wages paid</th>
                        <th className="px-5 py-4 font-medium">Companies</th>
                        <th className="px-5 py-4 font-medium">Share</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ownerBreakdown.map((entry) => (
                        <tr
                          key={entry.ownerCountryId ?? entry.ownerCountryCode ?? "unknown"}
                          className="border-t border-blue-900/30"
                        >
                          <td className="px-5 py-4 font-medium text-blue-100">
                            {getOwnerCountryLabel(entry)}
                          </td>
                          <td className="px-5 py-4 text-slate-300">
                            {formatDecimal(entry.taxIncome, 2)}
                          </td>
                          <td className="px-5 py-4 text-slate-300">
                            {formatDecimal(entry.wagesPaid, 2)}
                          </td>
                          <td className="px-5 py-4 text-slate-300">
                            {formatNumber(entry.companyObservations)}
                          </td>
                          <td className="px-5 py-4 text-slate-300">
                            {formatPercent(entry.share)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ) : null}

            <section className="overflow-hidden rounded-[1.75rem] border border-blue-800/30 bg-blue-950/40">
              <div className="border-b border-blue-900/40 px-6 py-5">
                <h2 className="text-xl font-semibold text-white">Detailed Entries</h2>
                <p className="mt-1 text-sm text-slate-400">
                  Full breakdown by region, item, owner country, and core status.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-blue-950/60 text-slate-500">
                    <tr>
                      <th className="px-5 py-4 font-medium">Item</th>
                      <th className="px-5 py-4 font-medium">Region</th>
                      <th className="px-5 py-4 font-medium">Core</th>
                      <th className="px-5 py-4 font-medium">Owner country</th>
                      <th className="px-5 py-4 font-medium">Tax income</th>
                      <th className="px-5 py-4 font-medium">Wages paid</th>
                      <th className="px-5 py-4 font-medium">Tax rate</th>
                      <th className="px-5 py-4 font-medium">Companies</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailedEntries.map((entry) => (
                      <tr
                        key={[
                          entry.regionId,
                          entry.itemCode,
                          entry.ownerCountryId ?? entry.ownerCountryCode ?? "unknown",
                          entry.core ? "core" : "non-core",
                        ].join(":")}
                        className="border-t border-blue-900/30"
                      >
                        <td className="px-5 py-4 font-medium text-blue-100">
                          {formatItemCodeLabel(entry.itemCode)}
                        </td>
                        <td className="px-5 py-4 text-slate-300">{entry.regionName}</td>
                        <td className="px-5 py-4 text-slate-300">
                          <span
                            className={
                              entry.core
                                ? "rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-200"
                                : "rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-200"
                            }
                          >
                            {entry.core ? "Core" : "Non-core"}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-slate-300">
                          {getOwnerCountryLabel(entry)}
                        </td>
                        <td className="px-5 py-4 text-slate-300">
                          {formatDecimal(entry.taxIncome, 2)}
                        </td>
                        <td className="px-5 py-4 text-slate-300">
                          {formatDecimal(entry.wagesPaid, 2)}
                        </td>
                        <td className="px-5 py-4 text-slate-300">
                          {formatPercent(entry.taxRate)}
                        </td>
                        <td className="px-5 py-4 text-slate-300">
                          {formatNumber(entry.companyObservations)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        ) : (
          <EmptyState
            title="No data for current filters"
            description="Odabrani UTC raspon ili refine filteri trenutno ne vracaju nijedan tax row."
          />
        )
      ) : hasFetched && !isLoading && !error ? (
        <EmptyState
          title="No tax data found"
          description="Za odabrani period jos nema dostupnih hourly tax podataka."
        />
      ) : null}
    </div>
  );
}

"use client";

import Link from "next/link";
import { useState } from "react";

import { type RegionAggregateRow } from "@/lib/db/schema";
import { formatDecimal, formatNumber, formatPercent } from "@/lib/formatters";

import { TableSortButton } from "./table-sort-button";

type RegionsTableProps = {
  regions: RegionAggregateRow[];
};

type RegionsSortKey =
  | "regionName"
  | "countryName"
  | "incomeTax"
  | "development"
  | "companyCount"
  | "domesticOwnedCount"
  | "foreignOwnedCount"
  | "uniqueOwnerCountries"
  | "topOwnerCountryName";

const SORT_LABELS: Record<RegionsSortKey, string> = {
  regionName: "regija",
  countryName: "drzava",
  incomeTax: "income tax",
  development: "development",
  companyCount: "broj firmi",
  domesticOwnedCount: "domace vlasnistvo",
  foreignOwnedCount: "strano vlasnistvo",
  uniqueOwnerCountries: "broj owner drzava",
  topOwnerCountryName: "top owner country",
};

function defaultDirection(key: RegionsSortKey) {
  switch (key) {
    case "regionName":
    case "countryName":
    case "topOwnerCountryName":
      return "asc" as const;
    default:
      return "desc" as const;
  }
}

function compareRegions(
  a: RegionAggregateRow,
  b: RegionAggregateRow,
  key: RegionsSortKey,
  direction: "asc" | "desc",
) {
  const multiplier = direction === "asc" ? 1 : -1;
  const collator = new Intl.Collator("hr-HR", {
    sensitivity: "base",
    numeric: true,
  });

  switch (key) {
    case "regionName":
      return multiplier * collator.compare(a.regionName, b.regionName);
    case "countryName":
      return multiplier * collator.compare(a.countryName, b.countryName);
    case "topOwnerCountryName":
      return multiplier * collator.compare(a.topOwnerCountryName ?? "", b.topOwnerCountryName ?? "");
    default: {
      const result = (a[key] ?? 0) - (b[key] ?? 0);
      if (result !== 0) {
        return result * multiplier;
      }

      return collator.compare(a.regionName, b.regionName);
    }
  }
}

export function RegionsTable({ regions }: RegionsTableProps) {
  const [sortKey, setSortKey] = useState<RegionsSortKey>("companyCount");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [countryFilter, setCountryFilter] = useState("all");

  function handleSort(nextKey: RegionsSortKey) {
    if (nextKey === sortKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(nextKey);
    setSortDirection(defaultDirection(nextKey));
  }

  const availableCountries = [...regions]
    .sort((a, b) => a.countryName.localeCompare(b.countryName, "hr-HR"))
    .filter(
      (region, index, items) =>
        index === items.findIndex((item) => item.countryCode === region.countryCode),
    )
    .map((region) => ({
      code: region.countryCode,
      name: region.countryName,
    }));

  const filteredRegions =
    countryFilter === "all"
      ? regions
      : regions.filter((region) => region.countryCode === countryFilter);

  const sortedRegions = [...filteredRegions].sort((a, b) =>
    compareRegions(a, b, sortKey, sortDirection),
  );

  return (
    <section className="overflow-hidden rounded-[1.75rem] border border-stone-200 bg-white/80">
      <div className="flex flex-col gap-4 border-b border-stone-100 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1">
          <p className="text-sm text-stone-600">
            Sortirano po{" "}
            <span className="font-medium text-stone-950">{SORT_LABELS[sortKey]}</span>{" "}
            ({sortDirection === "asc" ? "uzlazno" : "silazno"})
          </p>
          <p className="text-sm text-stone-500">
            Prikazano regija:{" "}
            <span className="font-medium text-stone-950">{sortedRegions.length}</span>
          </p>
        </div>

        <label className="flex items-center gap-3 text-sm text-stone-600">
          <span className="font-medium text-stone-950">Filtriraj po drzavi</span>
          <select
            value={countryFilter}
            onChange={(event) => setCountryFilter(event.target.value)}
            className="rounded-full border border-stone-200 bg-white px-4 py-2 text-sm text-stone-950 outline-none transition focus:border-emerald-600"
          >
            <option value="all">Sve drzave</option>
            {availableCountries.map((country) => (
              <option key={country.code} value={country.code}>
                {country.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-stone-50 text-stone-500">
            <tr>
              <th className="px-5 py-4">
                <TableSortButton
                  active={sortKey === "regionName"}
                  direction={sortDirection}
                  label="Regija"
                  onClick={() => handleSort("regionName")}
                />
              </th>
              <th className="px-5 py-4">
                <TableSortButton
                  active={sortKey === "countryName"}
                  direction={sortDirection}
                  label="Drzava"
                  onClick={() => handleSort("countryName")}
                />
              </th>
              <th className="px-5 py-4">
                <TableSortButton
                  active={sortKey === "incomeTax"}
                  direction={sortDirection}
                  label="Income tax"
                  onClick={() => handleSort("incomeTax")}
                />
              </th>
              <th className="px-5 py-4">
                <TableSortButton
                  active={sortKey === "development"}
                  direction={sortDirection}
                  label="Development"
                  onClick={() => handleSort("development")}
                />
              </th>
              <th className="px-5 py-4">
                <TableSortButton
                  active={sortKey === "companyCount"}
                  direction={sortDirection}
                  label="Firme"
                  onClick={() => handleSort("companyCount")}
                />
              </th>
              <th className="px-5 py-4">
                <TableSortButton
                  active={sortKey === "domesticOwnedCount"}
                  direction={sortDirection}
                  label="Domace"
                  onClick={() => handleSort("domesticOwnedCount")}
                />
              </th>
              <th className="px-5 py-4">
                <TableSortButton
                  active={sortKey === "foreignOwnedCount"}
                  direction={sortDirection}
                  label="Strano"
                  onClick={() => handleSort("foreignOwnedCount")}
                />
              </th>
              <th className="px-5 py-4">
                <TableSortButton
                  active={sortKey === "uniqueOwnerCountries"}
                  direction={sortDirection}
                  label="Unique owner countries"
                  onClick={() => handleSort("uniqueOwnerCountries")}
                />
              </th>
              <th className="px-5 py-4">
                <TableSortButton
                  active={sortKey === "topOwnerCountryName"}
                  direction={sortDirection}
                  label="Top owner country"
                  onClick={() => handleSort("topOwnerCountryName")}
                />
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedRegions.map((region) => (
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
                <td className="px-5 py-4">{formatDecimal(region.development, 2)}</td>
                <td className="px-5 py-4">{formatNumber(region.companyCount)}</td>
                <td className="px-5 py-4">{formatNumber(region.domesticOwnedCount)}</td>
                <td className="px-5 py-4">{formatNumber(region.foreignOwnedCount)}</td>
                <td className="px-5 py-4">{formatNumber(region.uniqueOwnerCountries)}</td>
                <td className="px-5 py-4">
                  {region.topOwnerCountryName ?? "Nema podatka"}
                </td>
              </tr>
            ))}
            {sortedRegions.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-5 py-8 text-center text-stone-500">
                  Nema regija za odabranu drzavu.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

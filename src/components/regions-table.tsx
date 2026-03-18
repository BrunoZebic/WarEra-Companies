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

  function handleSort(nextKey: RegionsSortKey) {
    if (nextKey === sortKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(nextKey);
    setSortDirection(defaultDirection(nextKey));
  }

  const sortedRegions = [...regions].sort((a, b) =>
    compareRegions(a, b, sortKey, sortDirection),
  );

  return (
    <section className="overflow-hidden rounded-[1.75rem] border border-blue-800/30 bg-blue-950/40">
      <div className="flex items-center justify-between gap-4 border-b border-blue-900/40 px-5 py-4">
        <p className="text-sm text-slate-400">
          Sortirano po{" "}
          <span className="font-medium text-blue-200">{SORT_LABELS[sortKey]}</span>{" "}
          ({sortDirection === "asc" ? "uzlazno" : "silazno"})
        </p>
        <p className="text-sm text-slate-500">
          Prikazano regija:{" "}
          <span className="font-medium text-blue-200">{sortedRegions.length}</span>
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-blue-950/60 text-slate-500">
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
              <tr key={region.regionId} className="border-t border-blue-900/30">
                <td className="px-5 py-4">
                  <Link
                    href={`/regions/${region.regionCode}`}
                    className="font-medium text-blue-100 hover:text-blue-400"
                  >
                    {region.regionName}
                  </Link>
                </td>
                <td className="px-5 py-4 text-slate-300">{region.countryName}</td>
                <td className="px-5 py-4 text-slate-300">{formatPercent(region.incomeTax)}</td>
                <td className="px-5 py-4 text-slate-300">{formatDecimal(region.development, 2)}</td>
                <td className="px-5 py-4 text-slate-300">{formatNumber(region.companyCount)}</td>
                <td className="px-5 py-4 text-slate-300">{formatNumber(region.domesticOwnedCount)}</td>
                <td className="px-5 py-4 text-slate-300">{formatNumber(region.foreignOwnedCount)}</td>
                <td className="px-5 py-4 text-slate-300">{formatNumber(region.uniqueOwnerCountries)}</td>
                <td className="px-5 py-4 text-slate-300">
                  {region.topOwnerCountryName ?? "Nema podatka"}
                </td>
              </tr>
            ))}
            {sortedRegions.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-5 py-8 text-center text-slate-500">
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

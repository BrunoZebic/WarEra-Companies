"use client";

import Link from "next/link";
import { useState } from "react";

import { type CountryAggregateRow } from "@/lib/db/schema";
import { formatNumber, formatPercent } from "@/lib/formatters";

import { TableSortButton } from "./table-sort-button";

type CountriesTableProps = {
  countries: CountryAggregateRow[];
};

type CountriesSortKey =
  | "countryName"
  | "incomeTax"
  | "marketTax"
  | "selfWorkTax"
  | "companyCount"
  | "regionsWithCompanies"
  | "domesticOwnedCount"
  | "foreignOwnedCount"
  | "uniqueOwnerCountries"
  | "topOwnerCountryName";

const SORT_LABELS: Record<CountriesSortKey, string> = {
  countryName: "drzava",
  incomeTax: "income tax",
  marketTax: "market tax",
  selfWorkTax: "self work tax",
  companyCount: "broj firmi",
  regionsWithCompanies: "regije s firmama",
  domesticOwnedCount: "domace vlasnistvo",
  foreignOwnedCount: "strano vlasnistvo",
  uniqueOwnerCountries: "broj owner drzava",
  topOwnerCountryName: "top owner country",
};

function defaultDirection(key: CountriesSortKey) {
  switch (key) {
    case "countryName":
    case "topOwnerCountryName":
      return "asc" as const;
    default:
      return "desc" as const;
  }
}

function compareCountries(
  a: CountryAggregateRow,
  b: CountryAggregateRow,
  key: CountriesSortKey,
  direction: "asc" | "desc",
) {
  const multiplier = direction === "asc" ? 1 : -1;
  const collator = new Intl.Collator("hr-HR", {
    sensitivity: "base",
    numeric: true,
  });

  switch (key) {
    case "countryName":
      return multiplier * collator.compare(a.countryName, b.countryName);
    case "topOwnerCountryName":
      return multiplier * collator.compare(a.topOwnerCountryName ?? "", b.topOwnerCountryName ?? "");
    default: {
      const result = (a[key] ?? 0) - (b[key] ?? 0);
      if (result !== 0) {
        return result * multiplier;
      }

      return collator.compare(a.countryName, b.countryName);
    }
  }
}

export function CountriesTable({ countries }: CountriesTableProps) {
  const [sortKey, setSortKey] = useState<CountriesSortKey>("companyCount");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  function handleSort(nextKey: CountriesSortKey) {
    if (nextKey === sortKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(nextKey);
    setSortDirection(defaultDirection(nextKey));
  }

  const sortedCountries = [...countries].sort((a, b) =>
    compareCountries(a, b, sortKey, sortDirection),
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
          Ukupno drzava: <span className="font-medium text-blue-200">{countries.length}</span>
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-blue-950/60 text-slate-500">
            <tr>
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
                  active={sortKey === "marketTax"}
                  direction={sortDirection}
                  label="Market tax"
                  onClick={() => handleSort("marketTax")}
                />
              </th>
              <th className="px-5 py-4">
                <TableSortButton
                  active={sortKey === "selfWorkTax"}
                  direction={sortDirection}
                  label="Self work tax"
                  onClick={() => handleSort("selfWorkTax")}
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
                  active={sortKey === "regionsWithCompanies"}
                  direction={sortDirection}
                  label="Regije s firmama"
                  onClick={() => handleSort("regionsWithCompanies")}
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
            {sortedCountries.map((country) => (
              <tr key={country.countryId} className="border-t border-blue-900/30">
                <td className="px-5 py-4">
                  <Link
                    href={`/countries/${country.countryCode}`}
                    className="font-medium text-blue-100 hover:text-blue-400"
                  >
                    {country.countryName}
                  </Link>
                </td>
                <td className="px-5 py-4 text-slate-300">{formatPercent(country.incomeTax)}</td>
                <td className="px-5 py-4 text-slate-300">{formatPercent(country.marketTax)}</td>
                <td className="px-5 py-4 text-slate-300">{formatPercent(country.selfWorkTax)}</td>
                <td className="px-5 py-4 text-slate-300">{formatNumber(country.companyCount)}</td>
                <td className="px-5 py-4 text-slate-300">{formatNumber(country.regionsWithCompanies)}</td>
                <td className="px-5 py-4 text-slate-300">{formatNumber(country.domesticOwnedCount)}</td>
                <td className="px-5 py-4 text-slate-300">{formatNumber(country.foreignOwnedCount)}</td>
                <td className="px-5 py-4 text-slate-300">{formatNumber(country.uniqueOwnerCountries)}</td>
                <td className="px-5 py-4 text-slate-300">
                  {country.topOwnerCountryName ?? "Nema podatka"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

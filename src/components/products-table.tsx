"use client";

import { useDeferredValue, useState } from "react";

import { type ProductAnalyticsRow } from "@/lib/products";
import {
  formatDecimal,
  formatNumber,
  formatSignedDecimal,
  formatSignedNumber,
} from "@/lib/formatters";
import { cn } from "@/lib/utils";

import { TableSortButton } from "./table-sort-button";

type ProductsTableProps = {
  products: ProductAnalyticsRow[];
};

type ProductsSortKey =
  | "displayLabel"
  | "companyCount"
  | "totalWorkers"
  | "totalProduction"
  | "companyCountDelta"
  | "workersDelta"
  | "productionDelta";

const SORT_LABELS: Record<ProductsSortKey, string> = {
  displayLabel: "proizvodu",
  companyCount: "broju firmi",
  totalWorkers: "broju workersa",
  totalProduction: "productionu",
  companyCountDelta: "promjeni firmi",
  workersDelta: "promjeni workersa",
  productionDelta: "promjeni productiona",
};

function defaultDirection(key: ProductsSortKey) {
  switch (key) {
    case "displayLabel":
      return "asc" as const;
    default:
      return "desc" as const;
  }
}

function compareNullableNumber(
  left: number | null,
  right: number | null,
  direction: "asc" | "desc",
) {
  if (left === null && right === null) {
    return 0;
  }

  if (left === null) {
    return 1;
  }

  if (right === null) {
    return -1;
  }

  return direction === "asc" ? left - right : right - left;
}

function compareProducts(
  left: ProductAnalyticsRow,
  right: ProductAnalyticsRow,
  key: ProductsSortKey,
  direction: "asc" | "desc",
) {
  const collator = new Intl.Collator("hr-HR", {
    sensitivity: "base",
    numeric: true,
  });

  if (key === "displayLabel") {
    return direction === "asc"
      ? collator.compare(left.displayLabel, right.displayLabel)
      : collator.compare(right.displayLabel, left.displayLabel);
  }

  const result = compareNullableNumber(left[key], right[key], direction);

  if (result !== 0) {
    return result;
  }

  return collator.compare(left.displayLabel, right.displayLabel);
}

function getDeltaTone(value: number | null) {
  if (value === null) {
    return "text-slate-500";
  }

  if (value > 0) {
    return "text-emerald-300";
  }

  if (value < 0) {
    return "text-rose-300";
  }

  return "text-slate-300";
}

function getOutlookTone(label: ProductAnalyticsRow["outlookLabel"]) {
  switch (label) {
    case "Likely up":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
    case "Likely down":
      return "border-rose-500/30 bg-rose-500/10 text-rose-200";
    case "Flat":
      return "border-slate-500/30 bg-slate-500/10 text-slate-200";
    default:
      return "border-blue-700/30 bg-blue-950/40 text-slate-400";
  }
}

export function ProductsTable({ products }: ProductsTableProps) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<ProductsSortKey>("companyCount");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const deferredQuery = useDeferredValue(query);

  function handleSort(nextKey: ProductsSortKey) {
    if (nextKey === sortKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(nextKey);
    setSortDirection(defaultDirection(nextKey));
  }

  const normalizedQuery = deferredQuery.trim().toLocaleLowerCase("hr-HR");
  const filteredProducts = products.filter((product) => {
    if (!normalizedQuery) {
      return true;
    }

    return (
      product.displayLabel.toLocaleLowerCase("hr-HR").includes(normalizedQuery) ||
      product.itemCode.toLocaleLowerCase("hr-HR").includes(normalizedQuery)
    );
  });
  const sortedProducts = [...filteredProducts].sort((left, right) =>
    compareProducts(left, right, sortKey, sortDirection),
  );

  return (
    <section className="overflow-hidden rounded-[1.75rem] border border-blue-800/30 bg-blue-950/40">
      <div className="flex flex-col gap-4 border-b border-blue-900/40 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1">
          <p className="text-sm text-slate-400">
            Sortirano po{" "}
            <span className="font-medium text-blue-200">{SORT_LABELS[sortKey]}</span>{" "}
            ({sortDirection === "asc" ? "uzlazno" : "silazno"})
          </p>
          <p className="text-sm text-slate-500">
            Prikazano proizvoda:{" "}
            <span className="font-medium text-blue-200">{filteredProducts.length}</span>
          </p>
        </div>

        <label className="flex items-center gap-3 rounded-full border border-blue-800/50 bg-blue-950/60 px-4 py-2 text-sm text-slate-400">
          <span>Pretraga</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="bread, grain, ammo..."
            className="min-w-40 bg-transparent text-blue-100 outline-none placeholder:text-slate-500"
          />
        </label>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-blue-950/60 text-slate-500">
            <tr>
              <th className="px-5 py-4">
                <TableSortButton
                  active={sortKey === "displayLabel"}
                  direction={sortDirection}
                  label="Proizvod"
                  onClick={() => handleSort("displayLabel")}
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
                  active={sortKey === "totalWorkers"}
                  direction={sortDirection}
                  label="Workers"
                  onClick={() => handleSort("totalWorkers")}
                />
              </th>
              <th className="px-5 py-4">
                <TableSortButton
                  active={sortKey === "totalProduction"}
                  direction={sortDirection}
                  label="Production"
                  onClick={() => handleSort("totalProduction")}
                />
              </th>
              <th className="px-5 py-4">
                <TableSortButton
                  active={sortKey === "companyCountDelta"}
                  direction={sortDirection}
                  label="Delta firmi"
                  onClick={() => handleSort("companyCountDelta")}
                />
              </th>
              <th className="px-5 py-4">
                <TableSortButton
                  active={sortKey === "workersDelta"}
                  direction={sortDirection}
                  label="Delta workersa"
                  onClick={() => handleSort("workersDelta")}
                />
              </th>
              <th className="px-5 py-4">
                <TableSortButton
                  active={sortKey === "productionDelta"}
                  direction={sortDirection}
                  label="Delta productiona"
                  onClick={() => handleSort("productionDelta")}
                />
              </th>
              <th className="px-5 py-4 font-medium">Outlook</th>
            </tr>
          </thead>
          <tbody>
            {sortedProducts.map((product) => (
              <tr key={product.itemCode} className="border-t border-blue-900/30 align-top">
                <td className="px-5 py-4">
                  <div className="font-medium text-blue-100">{product.displayLabel}</div>
                  <div className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">
                    {product.itemCode}
                  </div>
                </td>
                <td className="px-5 py-4 text-slate-300">{formatNumber(product.companyCount)}</td>
                <td className="px-5 py-4 text-slate-300">{formatNumber(product.totalWorkers)}</td>
                <td className="px-5 py-4 text-slate-300">{formatDecimal(product.totalProduction, 2)}</td>
                <td className={cn("px-5 py-4", getDeltaTone(product.companyCountDelta))}>
                  {product.companyCountDelta === null
                    ? "Nema podatka"
                    : formatSignedNumber(product.companyCountDelta)}
                </td>
                <td className={cn("px-5 py-4", getDeltaTone(product.workersDelta))}>
                  {product.workersDelta === null
                    ? "Nema podatka"
                    : formatSignedNumber(product.workersDelta)}
                </td>
                <td className={cn("px-5 py-4", getDeltaTone(product.productionDelta))}>
                  {product.productionDelta === null
                    ? "Nema podatka"
                    : formatSignedDecimal(product.productionDelta, 2)}
                </td>
                <td className="px-5 py-4">
                  {product.outlookLabel ? (
                    <div className="space-y-2">
                      <span
                        className={cn(
                          "inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em]",
                          getOutlookTone(product.outlookLabel),
                        )}
                      >
                        {product.outlookLabel}
                        {product.outlookConfidence
                          ? ` · ${product.outlookConfidence}`
                          : ""}
                      </span>
                      <p className="max-w-xs text-xs leading-5 text-slate-400">
                        {product.outlookSummary}
                      </p>
                    </div>
                  ) : (
                    <span className="text-slate-500">Nema outlooka</span>
                  )}
                </td>
              </tr>
            ))}
            {sortedProducts.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-5 py-8 text-center text-slate-500">
                  Nema proizvoda za zadani filter.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

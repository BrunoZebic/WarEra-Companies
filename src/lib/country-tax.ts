export type CountryTaxEntry = {
  regionId: string;
  regionName: string;
  ownerCountryId: string | null;
  ownerCountryCode: string | null;
  ownerCountryName: string | null;
  itemCode: string;
  core: boolean;
  wagesPaid: number;
  taxIncome: number;
  taxRate: number;
  companyObservations: number;
};

export type CountryTaxApiResponse = {
  countryCode: string;
  countryName: string | null;
  fromHour: string;
  toHour: string;
  entries: CountryTaxEntry[];
};

export type CountryTaxCoreFilter = "all" | "core";

export type CountryTaxRefineFilters = {
  coreFilter: CountryTaxCoreFilter;
  ownerCountryId: string | null;
};

export type CountryTaxSummary = {
  totalTaxIncome: number;
  totalWagesPaid: number;
  totalCompanyObservations: number;
  uniqueItems: number;
  coreTaxIncome: number;
  nonCoreTaxIncome: number;
};

export type CountryTaxItemBreakdown = {
  itemCode: string;
  taxIncome: number;
  wagesPaid: number;
  taxRate: number;
  companyObservations: number;
  share: number;
};

export type CountryTaxOwnerBreakdown = {
  ownerCountryId: string | null;
  ownerCountryCode: string | null;
  ownerCountryName: string | null;
  taxIncome: number;
  wagesPaid: number;
  companyObservations: number;
  share: number;
};

function getOwnerGroupKey(entry: Pick<
  CountryTaxEntry,
  "ownerCountryId" | "ownerCountryCode" | "ownerCountryName"
>) {
  return entry.ownerCountryId ?? entry.ownerCountryCode ?? entry.ownerCountryName ?? "__unknown__";
}

function resolveUtcHourDate(value: Date | string) {
  if (value instanceof Date) {
    return value;
  }

  return parseUtcHourInput(value) ?? new Date(value);
}

export function parseUtcHourInput(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);

  if (!match) {
    return null;
  }

  const [, year, month, day, hour, minute] = match;

  if (minute !== "00") {
    return null;
  }

  const parsed = new Date(Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    0,
    0,
    0,
  ));

  if (
    parsed.getUTCFullYear() !== Number(year) ||
    parsed.getUTCMonth() !== Number(month) - 1 ||
    parsed.getUTCDate() !== Number(day) ||
    parsed.getUTCHours() !== Number(hour)
  ) {
    return null;
  }

  return parsed;
}

export function formatUtcHourInput(value: Date | string) {
  const date = resolveUtcHourDate(value);

  const year = date.getUTCFullYear().toString().padStart(4, "0");
  const month = `${date.getUTCMonth() + 1}`.padStart(2, "0");
  const day = `${date.getUTCDate()}`.padStart(2, "0");
  const hour = `${date.getUTCHours()}`.padStart(2, "0");

  return `${year}-${month}-${day}T${hour}:00`;
}

export function addUtcHours(value: Date | string, hours: number) {
  const date = resolveUtcHourDate(value);

  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

export function filterCountryTaxEntries(
  entries: CountryTaxEntry[],
  filters: CountryTaxRefineFilters,
) {
  return entries.filter((entry) => {
    if (filters.coreFilter === "core" && !entry.core) {
      return false;
    }

    if (filters.ownerCountryId && entry.ownerCountryId !== filters.ownerCountryId) {
      return false;
    }

    return true;
  });
}

export function buildCountryTaxSummary(entries: CountryTaxEntry[]): CountryTaxSummary {
  const totalTaxIncome = entries.reduce((sum, entry) => sum + entry.taxIncome, 0);
  const totalWagesPaid = entries.reduce((sum, entry) => sum + entry.wagesPaid, 0);
  const totalCompanyObservations = entries.reduce(
    (sum, entry) => sum + entry.companyObservations,
    0,
  );
  const uniqueItems = new Set(entries.map((entry) => entry.itemCode)).size;
  const coreTaxIncome = entries
    .filter((entry) => entry.core)
    .reduce((sum, entry) => sum + entry.taxIncome, 0);
  const nonCoreTaxIncome = entries
    .filter((entry) => !entry.core)
    .reduce((sum, entry) => sum + entry.taxIncome, 0);

  return {
    totalTaxIncome,
    totalWagesPaid,
    totalCompanyObservations,
    uniqueItems,
    coreTaxIncome,
    nonCoreTaxIncome,
  };
}

export function buildCountryTaxItemBreakdown(entries: CountryTaxEntry[]) {
  const grouped = new Map<string, Omit<CountryTaxItemBreakdown, "share">>();
  const summary = buildCountryTaxSummary(entries);

  for (const entry of entries) {
    const existing = grouped.get(entry.itemCode);

    if (existing) {
      existing.taxIncome += entry.taxIncome;
      existing.wagesPaid += entry.wagesPaid;
      existing.companyObservations += entry.companyObservations;
      existing.taxRate =
        existing.wagesPaid > 0 ? (existing.taxIncome / existing.wagesPaid) * 100 : existing.taxRate;
      continue;
    }

    grouped.set(entry.itemCode, {
      itemCode: entry.itemCode,
      taxIncome: entry.taxIncome,
      wagesPaid: entry.wagesPaid,
      taxRate: entry.wagesPaid > 0 ? (entry.taxIncome / entry.wagesPaid) * 100 : entry.taxRate,
      companyObservations: entry.companyObservations,
    });
  }

  return [...grouped.values()]
    .map((entry) => ({
      ...entry,
      share: summary.totalTaxIncome > 0 ? (entry.taxIncome / summary.totalTaxIncome) * 100 : 0,
    }))
    .sort((left, right) => right.taxIncome - left.taxIncome || left.itemCode.localeCompare(right.itemCode));
}

export function buildCountryTaxOwnerBreakdown(entries: CountryTaxEntry[]) {
  const grouped = new Map<string, Omit<CountryTaxOwnerBreakdown, "share">>();
  const summary = buildCountryTaxSummary(entries);

  for (const entry of entries) {
    const key = getOwnerGroupKey(entry);
    const existing = grouped.get(key);

    if (existing) {
      existing.taxIncome += entry.taxIncome;
      existing.wagesPaid += entry.wagesPaid;
      existing.companyObservations += entry.companyObservations;
      continue;
    }

    grouped.set(key, {
      ownerCountryId: entry.ownerCountryId,
      ownerCountryCode: entry.ownerCountryCode,
      ownerCountryName: entry.ownerCountryName,
      taxIncome: entry.taxIncome,
      wagesPaid: entry.wagesPaid,
      companyObservations: entry.companyObservations,
    });
  }

  return [...grouped.values()]
    .map((entry) => ({
      ...entry,
      share: summary.totalTaxIncome > 0 ? (entry.taxIncome / summary.totalTaxIncome) * 100 : 0,
    }))
    .sort((left, right) => {
      if (right.taxIncome !== left.taxIncome) {
        return right.taxIncome - left.taxIncome;
      }

      return (left.ownerCountryName ?? "Unknown country").localeCompare(
        right.ownerCountryName ?? "Unknown country",
      );
    });
}

export function buildCountryTaxOwnerOptions(entries: CountryTaxEntry[]) {
  const grouped = new Map<
    string,
    {
      id: string | null;
      code: string | null;
      name: string | null;
    }
  >();

  for (const entry of entries) {
    const key = getOwnerGroupKey(entry);

    if (!grouped.has(key)) {
      grouped.set(key, {
        id: entry.ownerCountryId,
        code: entry.ownerCountryCode,
        name: entry.ownerCountryName,
      });
    }
  }

  return [...grouped.values()].sort((left, right) =>
    (left.name ?? "Unknown country").localeCompare(right.name ?? "Unknown country"),
  );
}

export function sortCountryTaxDetailedEntries(entries: CountryTaxEntry[]) {
  return [...entries].sort((left, right) => {
    if (right.taxIncome !== left.taxIncome) {
      return right.taxIncome - left.taxIncome;
    }

    if (left.regionName !== right.regionName) {
      return left.regionName.localeCompare(right.regionName);
    }

    if (left.itemCode !== right.itemCode) {
      return left.itemCode.localeCompare(right.itemCode);
    }

    return (left.ownerCountryName ?? "Unknown country").localeCompare(
      right.ownerCountryName ?? "Unknown country",
    );
  });
}

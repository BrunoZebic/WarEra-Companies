import { describe, expect, it } from "vitest";

import {
  addUtcHours,
  buildCountryTaxItemBreakdown,
  buildCountryTaxOwnerBreakdown,
  buildCountryTaxOwnerOptions,
  buildCountryTaxSummary,
  filterCountryTaxEntries,
  formatUtcHourInput,
  parseUtcHourInput,
} from "./country-tax";

const entries = [
  {
    regionId: "region-1",
    regionName: "Alpha",
    ownerCountryId: "country-1",
    ownerCountryCode: "hr",
    ownerCountryName: "Croatia",
    itemCode: "ammo",
    core: true,
    wagesPaid: 100,
    taxIncome: 10,
    taxRate: 10,
    companyObservations: 2,
  },
  {
    regionId: "region-2",
    regionName: "Beta",
    ownerCountryId: "country-2",
    ownerCountryCode: "pl",
    ownerCountryName: "Poland",
    itemCode: "ammo",
    core: false,
    wagesPaid: 50,
    taxIncome: 5,
    taxRate: 10,
    companyObservations: 1,
  },
  {
    regionId: "region-3",
    regionName: "Gamma",
    ownerCountryId: null,
    ownerCountryCode: null,
    ownerCountryName: null,
    itemCode: "steel",
    core: true,
    wagesPaid: 25,
    taxIncome: 2.5,
    taxRate: 10,
    companyObservations: 1,
  },
] as const;

describe("country tax helpers", () => {
  it("parses and formats UTC hour inputs", () => {
    const parsed = parseUtcHourInput("2026-04-21T18:00");

    expect(parsed?.toISOString()).toBe("2026-04-21T18:00:00.000Z");
    expect(formatUtcHourInput(parsed!)).toBe("2026-04-21T18:00");
    expect(formatUtcHourInput(addUtcHours(parsed!, 1))).toBe("2026-04-21T19:00");
    expect(parseUtcHourInput("2026-04-21T18:30")).toBeNull();
  });

  it("filters entries by core-only and owner country", () => {
    const coreOnly = filterCountryTaxEntries(entries.slice(), {
      coreFilter: "core",
      ownerCountryId: null,
    });
    const ownerOnly = filterCountryTaxEntries(entries.slice(), {
      coreFilter: "all",
      ownerCountryId: "country-1",
    });

    expect(coreOnly).toHaveLength(2);
    expect(ownerOnly).toHaveLength(1);
    expect(ownerOnly[0]?.ownerCountryCode).toBe("hr");
  });

  it("builds summary, item breakdowns, and owner breakdowns", () => {
    const summary = buildCountryTaxSummary(entries.slice());
    const items = buildCountryTaxItemBreakdown(entries.slice());
    const owners = buildCountryTaxOwnerBreakdown(entries.slice());
    const ownerOptions = buildCountryTaxOwnerOptions(entries.slice());

    expect(summary).toMatchObject({
      totalTaxIncome: 17.5,
      totalWagesPaid: 175,
      totalCompanyObservations: 4,
      uniqueItems: 2,
      coreTaxIncome: 12.5,
      nonCoreTaxIncome: 5,
    });

    expect(items[0]).toMatchObject({
      itemCode: "ammo",
      taxIncome: 15,
      wagesPaid: 150,
      taxRate: 10,
      companyObservations: 3,
    });
    expect(items[0]?.share).toBeCloseTo(85.714285, 5);

    expect(owners[0]).toMatchObject({
      ownerCountryId: "country-1",
      ownerCountryCode: "hr",
      ownerCountryName: "Croatia",
      taxIncome: 10,
      wagesPaid: 100,
      companyObservations: 2,
    });

    expect(ownerOptions).toEqual([
      { id: "country-1", code: "hr", name: "Croatia" },
      { id: "country-2", code: "pl", name: "Poland" },
      { id: null, code: null, name: null },
    ]);
  });
});

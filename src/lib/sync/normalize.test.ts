import { describe, expect, it } from "vitest";

import {
  normalizeCompanySnapshotRow,
  normalizeCountries,
  normalizeOwnerSnapshot,
  normalizeRegions,
} from "./normalize";

describe("normalize helpers", () => {
  it("normalizes countries and regions into reference rows", () => {
    const countries = [
      {
        _id: "country-1",
        name: "Croatia",
        code: "hr",
        taxes: {
          income: 10,
          market: 3,
          selfWork: 4,
        },
      },
    ] as unknown as Parameters<typeof normalizeCountries>[1];

    const countryRows = normalizeCountries("snapshot-1", countries);
    const countryById = new Map(countryRows.map((country) => [country.countryId, country]));

    const regions = {
      "region-1": {
        _id: "region-1",
        code: "hr-zagreb",
        name: "Zagreb",
        country: "country-1",
        development: 12.5,
        mainCity: "Zagreb",
        position: [15.98, 45.81],
      },
    } as unknown as Parameters<typeof normalizeRegions>[1];

    const regionRows = normalizeRegions("snapshot-1", regions, countryById);

    expect(countryRows[0]).toMatchObject({
      countryCode: "hr",
      incomeTax: 10,
    });
    expect(regionRows[0]).toMatchObject({
      regionCode: "hr-zagreb",
      countryCode: "hr",
      latitude: 45.81,
      longitude: 15.98,
    });
  });

  it("builds owner and company rows with owner-country joins", () => {
    const countryMap = new Map([
      [
        "country-1",
        {
          snapshotId: "snapshot-1",
          countryId: "country-1",
          countryCode: "hr",
          countryName: "Croatia",
          incomeTax: 10,
          marketTax: 3,
          selfWorkTax: 4,
        },
      ],
    ]);

    const regionById = new Map([
      [
        "region-1",
        {
          snapshotId: "snapshot-1",
          regionId: "region-1",
          regionCode: "hr-zagreb",
          regionName: "Zagreb",
          countryId: "country-1",
          countryCode: "hr",
          countryName: "Croatia",
          development: 12.5,
          mainCity: "Zagreb",
          latitude: 45.81,
          longitude: 15.98,
        },
      ],
    ]);

    const owner = normalizeOwnerSnapshot(
      {
        _id: "user-1",
        username: "kocunar",
        country: "country-1",
      } as unknown as Parameters<typeof normalizeOwnerSnapshot>[0],
      countryMap,
    );

    const row = normalizeCompanySnapshotRow({
      snapshotId: "snapshot-1",
      company: {
        _id: "company-1",
        name: "Ammo Works",
        itemCode: "ammo",
        user: "user-1",
        region: "region-1",
        workerCount: 5,
        estimatedValue: 1234.56,
        production: 9.5,
        isFull: false,
        updatedAt: "2026-03-17T19:00:00.000Z",
      } as unknown as Parameters<typeof normalizeCompanySnapshotRow>[0]["company"],
      regionById,
      owner,
    });

    expect(owner).toMatchObject({
      ownerCountryCode: "hr",
      ownerCountryName: "Croatia",
    });

    expect(row).toMatchObject({
      companyId: "company-1",
      countryCode: "hr",
      regionCode: "hr-zagreb",
      ownerCountryCode: "hr",
    });
    expect(row.wareraUpdatedAt?.toISOString()).toBe("2026-03-17T19:00:00.000Z");
  });
});

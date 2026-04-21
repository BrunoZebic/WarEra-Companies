import { describe, expect, it } from "vitest";

import { buildCompanyHourlyWagesMap, getUtcHourBucketStart } from "./tax-helpers";

describe("tax sync helpers", () => {
  it("builds hourly wage totals per company", () => {
    const map = buildCompanyHourlyWagesMap([
      {
        type: "user",
        workersPerCompany: [
          {
            company: {
              _id: "company-1",
              name: "Alpha",
              itemCode: "ammo",
            },
            workers: [
              { wage: 0.5 },
              { wage: 1.25 },
            ],
          },
          {
            company: {
              _id: "company-2",
              name: "Beta",
              itemCode: "steel",
            },
            workers: [
              { wage: 2 },
            ],
          },
        ],
      },
    ] as never);

    expect(map.get("company-1")).toBeCloseTo(1.75, 5);
    expect(map.get("company-2")).toBeCloseTo(2, 5);
  });

  it("rounds timestamps down to the start of the UTC hour", () => {
    expect(
      getUtcHourBucketStart("2026-04-21T21:47:31.999Z").toISOString(),
    ).toBe("2026-04-21T21:00:00.000Z");
  });
});

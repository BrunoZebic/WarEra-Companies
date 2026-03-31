import { describe, expect, it } from "vitest";

import { buildProductOutlook, formatItemCodeLabel } from "./products";

describe("product helpers", () => {
  it("formats item codes into display labels", () => {
    expect(formatItemCodeLabel("cookedFish")).toBe("Cooked Fish");
    expect(formatItemCodeLabel("heavyAmmo")).toBe("Heavy Ammo");
    expect(formatItemCodeLabel("bread")).toBe("Bread");
  });

  it("marks strong positive momentum as likely up with high confidence", () => {
    expect(
      buildProductOutlook([
        { companyCountDelta: 2, workersDelta: 12, productionDelta: 3.4 },
        { companyCountDelta: 1, workersDelta: 10, productionDelta: 2.1 },
        { companyCountDelta: 3, workersDelta: 8, productionDelta: 1.8 },
      ]),
    ).toMatchObject({
      label: "Likely up",
      confidence: "High",
    });
  });

  it("marks mixed but positive production momentum as likely up with medium confidence", () => {
    expect(
      buildProductOutlook([
        { companyCountDelta: -1, workersDelta: 9, productionDelta: 2.4 },
        { companyCountDelta: 0, workersDelta: 4, productionDelta: 1.1 },
        { companyCountDelta: 1, workersDelta: -2, productionDelta: 0.8 },
      ]),
    ).toMatchObject({
      label: "Likely up",
      confidence: "Medium",
    });
  });

  it("marks negative momentum as likely down", () => {
    expect(
      buildProductOutlook([
        { companyCountDelta: 1, workersDelta: -6, productionDelta: -1.4 },
        { companyCountDelta: 0, workersDelta: -4, productionDelta: -2.2 },
        { companyCountDelta: 0, workersDelta: -1, productionDelta: -0.5 },
      ]),
    ).toMatchObject({
      label: "Likely down",
      confidence: "Medium",
    });
  });

  it("marks conflicting signals as flat", () => {
    expect(
      buildProductOutlook([
        { companyCountDelta: -2, workersDelta: -10, productionDelta: 0.1 },
        { companyCountDelta: -1, workersDelta: -2, productionDelta: 0.2 },
        { companyCountDelta: 0, workersDelta: 0, productionDelta: 0.1 },
      ]),
    ).toMatchObject({
      label: "Flat",
      confidence: null,
    });
  });
});

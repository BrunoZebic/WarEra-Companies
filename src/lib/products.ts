export type ProductOutlookLabel = "Likely up" | "Likely down" | "Flat";
export type ProductOutlookConfidence = "High" | "Medium" | null;

export type ProductDeltaPoint = {
  companyCountDelta: number;
  workersDelta: number;
  productionDelta: number;
};

export type ProductOutlook = {
  label: ProductOutlookLabel;
  confidence: ProductOutlookConfidence;
  averageCompanyCountDelta: number;
  averageWorkersDelta: number;
  averageProductionDelta: number;
};

export type ProductAnalyticsRow = {
  itemCode: string;
  displayLabel: string;
  companyCount: number;
  totalWorkers: number;
  totalProduction: number;
  companyCountDelta: number | null;
  workersDelta: number | null;
  productionDelta: number | null;
  outlookLabel: ProductOutlookLabel | null;
  outlookConfidence: ProductOutlookConfidence;
  outlookSummary: string | null;
};

function average(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function formatItemCodeLabel(itemCode: string) {
  return itemCode
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (segment) => segment.toUpperCase());
}

export function buildProductOutlook(deltas: ProductDeltaPoint[]): ProductOutlook {
  const averageCompanyCountDelta = average(
    deltas.map((delta) => delta.companyCountDelta),
  );
  const averageWorkersDelta = average(deltas.map((delta) => delta.workersDelta));
  const averageProductionDelta = average(deltas.map((delta) => delta.productionDelta));

  const hasUpSignal =
    averageProductionDelta > 0 &&
    (averageWorkersDelta > 0 || averageCompanyCountDelta > 0);
  const hasDownSignal =
    averageProductionDelta < 0 &&
    (averageWorkersDelta < 0 || averageCompanyCountDelta < 0);

  if (!hasUpSignal && !hasDownSignal) {
    return {
      label: "Flat",
      confidence: null,
      averageCompanyCountDelta,
      averageWorkersDelta,
      averageProductionDelta,
    };
  }

  if (hasUpSignal) {
    return {
      label: "Likely up",
      confidence:
        averageCompanyCountDelta > 0 &&
        averageWorkersDelta > 0 &&
        averageProductionDelta > 0
          ? "High"
          : "Medium",
      averageCompanyCountDelta,
      averageWorkersDelta,
      averageProductionDelta,
    };
  }

  return {
    label: "Likely down",
    confidence:
      averageCompanyCountDelta < 0 &&
      averageWorkersDelta < 0 &&
      averageProductionDelta < 0
        ? "High"
        : "Medium",
    averageCompanyCountDelta,
    averageWorkersDelta,
    averageProductionDelta,
  };
}

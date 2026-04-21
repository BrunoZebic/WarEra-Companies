import type { WorkerGetWorkersResponse } from "@wareraprojects/api";

function readWorkerWage(worker: unknown) {
  if (!worker || typeof worker !== "object") {
    return 0;
  }

  const candidate = worker as { wage?: unknown };
  return typeof candidate.wage === "number" ? candidate.wage : 0;
}

export function buildCompanyHourlyWagesMap(workerResponses: WorkerGetWorkersResponse[]) {
  const wagesByCompanyId = new Map<string, number>();

  for (const response of workerResponses) {
    const groups =
      "workersPerCompany" in response && Array.isArray(response.workersPerCompany)
        ? response.workersPerCompany
        : [];

    for (const group of groups) {
      const companyId = group.company?._id;

      if (!companyId) {
        continue;
      }

      const totalWages: number = Array.isArray(group.workers)
        ? group.workers.reduce<number>((sum, worker) => sum + readWorkerWage(worker), 0)
        : 0;

      wagesByCompanyId.set(companyId, (wagesByCompanyId.get(companyId) ?? 0) + totalWages);
    }
  }

  return wagesByCompanyId;
}

export function getUtcHourBucketStart(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);

  return new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    date.getUTCHours(),
    0,
    0,
    0,
  ));
}

import { describe, expect, it } from "vitest";

import {
  buildArchivePrefix,
  findOldestMissingComparisonPair,
  getHotSuccessfulSnapshotIds,
} from "./history";

describe("history helpers", () => {
  const successfulSnapshots = [
    {
      id: "snapshot-1",
      completedAt: new Date("2026-03-17T00:00:00.000Z"),
    },
    {
      id: "snapshot-2",
      completedAt: new Date("2026-03-17T06:00:00.000Z"),
    },
    {
      id: "snapshot-3",
      completedAt: new Date("2026-03-17T12:00:00.000Z"),
    },
    {
      id: "snapshot-4",
      completedAt: new Date("2026-03-17T18:00:00.000Z"),
    },
  ];

  it("finds the oldest missing consecutive snapshot pair", () => {
    const pair = findOldestMissingComparisonPair({
      successfulSnapshots,
      existingPairs: [
        {
          fromSnapshotId: "snapshot-2",
          toSnapshotId: "snapshot-3",
        },
        {
          fromSnapshotId: "snapshot-3",
          toSnapshotId: "snapshot-4",
        },
      ],
    });

    expect(pair).toEqual({
      fromSnapshotId: "snapshot-1",
      toSnapshotId: "snapshot-2",
    });
  });

  it("returns the newest hot snapshot ids", () => {
    expect(getHotSuccessfulSnapshotIds(successfulSnapshots, 2)).toEqual([
      "snapshot-3",
      "snapshot-4",
    ]);
  });

  it("builds the archive prefix from the snapshot completion date", () => {
    expect(
      buildArchivePrefix({
        archivePrefix: "warera-raw-snapshots",
        snapshotId: "snapshot-4",
        completedAt: new Date("2026-03-17T18:00:00.000Z"),
      }),
    ).toBe("warera-raw-snapshots/2026/03/17/snapshot-4");
  });
});

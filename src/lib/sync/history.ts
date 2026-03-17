export type CompletedSnapshot = {
  id: string;
  completedAt: Date | null;
};

export type SnapshotPair = {
  fromSnapshotId: string;
  toSnapshotId: string;
};

function getCompletedAtTime(snapshot: CompletedSnapshot) {
  return snapshot.completedAt?.getTime() ?? 0;
}

export function sortSnapshotsChronologically<T extends CompletedSnapshot>(snapshots: T[]) {
  return [...snapshots].sort((left, right) => {
    const timeDelta = getCompletedAtTime(left) - getCompletedAtTime(right);

    if (timeDelta !== 0) {
      return timeDelta;
    }

    return left.id.localeCompare(right.id);
  });
}

export function getConsecutiveSnapshotPairs(
  snapshots: CompletedSnapshot[],
): SnapshotPair[] {
  const orderedSnapshots = sortSnapshotsChronologically(snapshots);
  const pairs: SnapshotPair[] = [];

  for (let index = 0; index < orderedSnapshots.length - 1; index += 1) {
    pairs.push({
      fromSnapshotId: orderedSnapshots[index]!.id,
      toSnapshotId: orderedSnapshots[index + 1]!.id,
    });
  }

  return pairs;
}

export function buildSnapshotPairKey(pair: SnapshotPair) {
  return `${pair.fromSnapshotId}:${pair.toSnapshotId}`;
}

export function findOldestMissingComparisonPair(input: {
  successfulSnapshots: CompletedSnapshot[];
  existingPairs: SnapshotPair[];
}) {
  const existingPairKeys = new Set(input.existingPairs.map(buildSnapshotPairKey));

  for (const pair of getConsecutiveSnapshotPairs(input.successfulSnapshots)) {
    if (!existingPairKeys.has(buildSnapshotPairKey(pair))) {
      return pair;
    }
  }

  return null;
}

export function getHotSuccessfulSnapshotIds(
  successfulSnapshots: CompletedSnapshot[],
  hotCount = 2,
) {
  return sortSnapshotsChronologically(successfulSnapshots)
    .slice(-hotCount)
    .map((snapshot) => snapshot.id);
}

export function getOldestSuccessfulSnapshotOutsideHot<T extends CompletedSnapshot>(
  successfulSnapshots: T[],
  hotCount = 2,
) {
  const orderedSnapshots = sortSnapshotsChronologically(successfulSnapshots);
  const hotSnapshotIds = new Set(getHotSuccessfulSnapshotIds(orderedSnapshots, hotCount));

  return orderedSnapshots.find((snapshot) => !hotSnapshotIds.has(snapshot.id)) ?? null;
}

export function buildArchivePrefix(input: {
  archivePrefix: string;
  snapshotId: string;
  completedAt: Date;
}) {
  const year = input.completedAt.getUTCFullYear().toString().padStart(4, "0");
  const month = `${input.completedAt.getUTCMonth() + 1}`.padStart(2, "0");
  const day = `${input.completedAt.getUTCDate()}`.padStart(2, "0");

  return `${input.archivePrefix}/${year}/${month}/${day}/${input.snapshotId}`;
}

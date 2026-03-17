import { NextResponse } from "next/server";

import { getSnapshotMeta } from "@/lib/db/read-models";
import { hasValidCronSecret } from "@/lib/sync/auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!hasValidCronSecret(request)) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }

  try {
    const snapshotMeta = await getSnapshotMeta();

    return NextResponse.json({
      ok: true,
      configured: snapshotMeta.configured,
      currentSnapshot: snapshotMeta.currentSnapshot,
      latestRun: snapshotMeta.latestRun,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Unable to load sync status.",
      },
      { status: 500 },
    );
  }
}

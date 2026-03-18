import { NextResponse } from "next/server";

import { hasDatabaseUrl } from "@/lib/db/client";
import { hasValidCronSecret } from "@/lib/sync/auth";
import { runSyncPass } from "@/lib/sync/service";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) {
  if (!hasValidCronSecret(request)) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }

  if (!hasDatabaseUrl()) {
    return NextResponse.json(
      {
        ok: false,
        message: "DATABASE_URL is not configured.",
      },
      { status: 500 },
    );
  }

  try {
    const result = await runSyncPass("scheduled");

    if (!result.ok) {
      return NextResponse.json(
        {
          ok: true,
          status: "running",
          reason: result.reason,
          message: "A sync pass is already running.",
        },
        { status: 202 },
      );
    }

    return NextResponse.json({
      ok: true,
      status: result.status,
      summary: result.summary,
    }, { status: result.status === "completed" ? 200 : 202 });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Sync failed.",
      },
      { status: 500 },
    );
  }
}

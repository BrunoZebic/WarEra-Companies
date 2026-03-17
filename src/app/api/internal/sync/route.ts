import { NextResponse } from "next/server";

import { hasDatabaseUrl } from "@/lib/db/client";
import { hasValidCronSecret } from "@/lib/sync/auth";
import { runFullSync } from "@/lib/sync/service";

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
    const result = await runFullSync("scheduled");

    if (!result.ok) {
      return NextResponse.json(
        {
          ok: false,
          message: "A sync is already running.",
        },
        { status: 409 },
      );
    }

    return NextResponse.json({
      ok: true,
      summary: result.summary,
    });
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

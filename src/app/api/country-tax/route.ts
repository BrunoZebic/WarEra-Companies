import { NextResponse } from "next/server";

import { parseUtcHourInput } from "@/lib/country-tax";
import { hasDatabaseUrl } from "@/lib/db/client";
import { getCountryTaxRangeData } from "@/lib/db/read-models";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!hasDatabaseUrl()) {
    return NextResponse.json(
      {
        ok: false,
        message: "DATABASE_URL is not configured.",
      },
      { status: 500 },
    );
  }

  const { searchParams } = new URL(request.url);
  const countryCode = searchParams.get("countryCode")?.trim().toLowerCase() ?? "";
  const fromHourRaw = searchParams.get("fromHour")?.trim() ?? "";
  const toHourRaw = searchParams.get("toHour")?.trim() ?? "";
  const itemCode = searchParams.get("itemCode")?.trim() || null;

  if (!countryCode) {
    return NextResponse.json(
      {
        ok: false,
        message: "countryCode is required.",
      },
      { status: 400 },
    );
  }

  const fromHour = parseUtcHourInput(fromHourRaw);
  const toHour = parseUtcHourInput(toHourRaw);

  if (!fromHour || !toHour) {
    return NextResponse.json(
      {
        ok: false,
        message: "fromHour and toHour must be UTC hour strings like 2026-04-21T18:00.",
      },
      { status: 400 },
    );
  }

  if (fromHour >= toHour) {
    return NextResponse.json(
      {
        ok: false,
        message: 'The "from" hour must be before the "to" hour.',
      },
      { status: 400 },
    );
  }

  try {
    const data = await getCountryTaxRangeData({
      countryCode,
      fromHour,
      toHour,
      itemCode,
    });

    return NextResponse.json({
      ok: true,
      data,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error ? error.message : "Failed to load country tax data.",
      },
      { status: 500 },
    );
  }
}

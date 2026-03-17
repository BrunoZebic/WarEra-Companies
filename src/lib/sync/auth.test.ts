import { afterEach, describe, expect, it } from "vitest";

import { hasValidCronSecret } from "./auth";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("sync auth", () => {
  it("accepts a matching bearer token", () => {
    process.env.CRON_SECRET = "top-secret";

    const request = new Request("https://example.com/api/internal/sync", {
      headers: {
        Authorization: "Bearer top-secret",
      },
    });

    expect(hasValidCronSecret(request)).toBe(true);
  });

  it("rejects missing or mismatched tokens", () => {
    process.env.CRON_SECRET = "top-secret";

    const request = new Request("https://example.com/api/internal/sync", {
      headers: {
        Authorization: "Bearer wrong-secret",
      },
    });

    expect(hasValidCronSecret(request)).toBe(false);
    expect(
      hasValidCronSecret(new Request("https://example.com/api/internal/sync")),
    ).toBe(false);
  });
});

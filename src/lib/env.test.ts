import { afterEach, describe, expect, it } from "vitest";

import {
  getWareraApiBaseUrl,
  getWareraApiKey,
  getWareraClientConfig,
} from "./env";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("env helpers", () => {
  it("prefers WARERA_API_KEY over WARERA_API_TOKEN", () => {
    process.env.WARERA_API_KEY = "key-value";
    process.env.WARERA_API_TOKEN = "token-value";

    expect(getWareraApiKey()).toBe("key-value");
  });

  it("falls back to WARERA_API_TOKEN when primary key is missing", () => {
    delete process.env.WARERA_API_KEY;
    process.env.WARERA_API_TOKEN = "token-value";

    expect(getWareraApiKey()).toBe("token-value");
  });

  it("builds the SDK config with the explicit 450 rpm limit", () => {
    process.env.WARERA_API_KEY = "key-value";
    process.env.WARERA_API_BASE_URL = "https://api2.warera.io/trpc";

    expect(getWareraApiBaseUrl()).toBe("https://api2.warera.io/trpc");
    expect(getWareraClientConfig()).toMatchObject({
      apiKey: "key-value",
      rateLimit: 450,
      url: "https://api2.warera.io/trpc",
    });
  });
});

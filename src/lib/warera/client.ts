import "server-only";

import { createAPIClient, type APIClient } from "@wareraprojects/api";

import { getWareraClientConfig, hasWareraApiKey } from "@/lib/env";

let wareraClient: APIClient | null = null;

export function createWareraClient() {
  const config = getWareraClientConfig();

  if (!config.apiKey) {
    throw new Error("WARERA_API_KEY or WARERA_API_TOKEN must be set.");
  }

  return createAPIClient(config);
}

export function getWareraClient() {
  if (!hasWareraApiKey()) {
    throw new Error("WARERA_API_KEY or WARERA_API_TOKEN must be set.");
  }

  if (!wareraClient) {
    wareraClient = createWareraClient();
  }

  return wareraClient;
}

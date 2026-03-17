import {
  WARERA_API_DEFAULT_BASE_URL,
  WARERA_API_RATE_LIMIT,
} from "@/lib/sync/constants";

export function getWareraApiKey() {
  return process.env.WARERA_API_KEY?.trim() || process.env.WARERA_API_TOKEN?.trim() || "";
}

export function hasWareraApiKey() {
  return getWareraApiKey().length > 0;
}

export function getWareraApiBaseUrl() {
  return process.env.WARERA_API_BASE_URL?.trim() || WARERA_API_DEFAULT_BASE_URL;
}

export function getWareraClientConfig() {
  return {
    url: getWareraApiBaseUrl(),
    apiKey: getWareraApiKey(),
    rateLimit: WARERA_API_RATE_LIMIT,
    logBatches:
      process.env.NODE_ENV === "development" && process.env.WARERA_LOG_BATCHES === "1",
  };
}

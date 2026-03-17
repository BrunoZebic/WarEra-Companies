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

function getRequiredEnvValue(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is not set.`);
  }

  return value;
}

export function hasR2ArchiveConfig() {
  return Boolean(
    process.env.R2_ACCOUNT_ID?.trim() &&
      process.env.R2_BUCKET_NAME?.trim() &&
      process.env.R2_ACCESS_KEY_ID?.trim() &&
      process.env.R2_SECRET_ACCESS_KEY?.trim(),
  );
}

export function getR2ArchiveConfig() {
  return {
    accountId: getRequiredEnvValue("R2_ACCOUNT_ID"),
    bucketName: getRequiredEnvValue("R2_BUCKET_NAME"),
    accessKeyId: getRequiredEnvValue("R2_ACCESS_KEY_ID"),
    secretAccessKey: getRequiredEnvValue("R2_SECRET_ACCESS_KEY"),
    archivePrefix:
      process.env.R2_ARCHIVE_PREFIX?.trim() || "warera-raw-snapshots",
  };
}

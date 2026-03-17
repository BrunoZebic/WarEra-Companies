import "server-only";

import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";

import * as schema from "@/lib/db/schema";
import { SYNC_ADVISORY_LOCK_ID } from "@/lib/sync/constants";

if (!neonConfig.webSocketConstructor && typeof WebSocket !== "undefined") {
  neonConfig.webSocketConstructor = WebSocket;
}

let poolInstance: Pool | null = null;
let dbInstance: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function hasDatabaseUrl() {
  return Boolean(process.env.DATABASE_URL?.trim());
}

function getPool() {
  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set.");
  }

  if (!poolInstance) {
    poolInstance = new Pool({ connectionString: databaseUrl });
  }

  return poolInstance;
}

export function getDb() {
  if (!dbInstance) {
    dbInstance = drizzle(getPool(), { schema });
  }

  return dbInstance;
}

export async function withSyncAdvisoryLock<T>(
  callback: () => Promise<T>,
): Promise<{ acquired: false } | { acquired: true; value: T }> {
  const client = await getPool().connect();

  try {
    const result = await client.query<{ locked: boolean }>(
      "select pg_try_advisory_lock($1) as locked",
      [SYNC_ADVISORY_LOCK_ID],
    );

    if (!result.rows[0]?.locked) {
      return { acquired: false };
    }

    try {
      const value = await callback();
      return { acquired: true, value };
    } finally {
      await client.query("select pg_advisory_unlock($1)", [SYNC_ADVISORY_LOCK_ID]);
    }
  } finally {
    client.release();
  }
}

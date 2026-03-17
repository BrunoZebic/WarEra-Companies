import "server-only";

import { Pool, neon, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

import * as schema from "@/lib/db/schema";
import { SYNC_ADVISORY_LOCK_ID } from "@/lib/sync/constants";

if (!neonConfig.webSocketConstructor && typeof WebSocket !== "undefined") {
  neonConfig.webSocketConstructor = WebSocket;
}

let dbInstance: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function hasDatabaseUrl() {
  return Boolean(process.env.DATABASE_URL?.trim());
}

export function getDb() {
  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set.");
  }

  if (!dbInstance) {
    dbInstance = drizzle(neon(databaseUrl), { schema });
  }

  return dbInstance;
}

export async function withSyncAdvisoryLock<T>(
  callback: () => Promise<T>,
): Promise<{ acquired: false } | { acquired: true; value: T }> {
  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set.");
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const client = await pool.connect();

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
    await pool.end();
  }
}

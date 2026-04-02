import "server-only";

import { randomUUID } from "node:crypto";

import { Pool, neonConfig } from "@neondatabase/serverless";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-serverless";

import * as schema from "@/lib/db/schema";
import {
  SYNC_LOCK_HEARTBEAT_MS,
  SYNC_LOCK_TTL_MS,
} from "@/lib/sync/constants";

if (!neonConfig.webSocketConstructor && typeof WebSocket !== "undefined") {
  neonConfig.webSocketConstructor = WebSocket;
}

let poolInstance: Pool | null = null;
let dbInstance: ReturnType<typeof drizzle<typeof schema>> | null = null;
const SYNC_LOCK_NAME = "sync";

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

export class SyncLockLostError extends Error {
  constructor() {
    super("Sync lock lost to another holder.");
    this.name = "SyncLockLostError";
  }
}

export async function withSyncLock<T>(
  callback: (ctx: {
    holderId: string;
    ensureLockHeld: () => void;
    checkLockOwnership: () => Promise<boolean>;
  }) => Promise<T>,
): Promise<{ acquired: false } | { acquired: true; value: T }> {
  const db = getDb();
  const holderId = randomUUID();
  let lockLost = false;

  const result = await db.execute(sql<{ lockName: string }>`
    insert into sync_locks (lock_name, holder_id, acquired_at, expires_at)
    values (
      ${SYNC_LOCK_NAME},
      ${holderId},
      now(),
      now() + ${SYNC_LOCK_TTL_MS} * interval '1 millisecond'
    )
    on conflict (lock_name) do update
      set
        holder_id = ${holderId},
        acquired_at = now(),
        expires_at = now() + ${SYNC_LOCK_TTL_MS} * interval '1 millisecond'
    where sync_locks.expires_at < now()
    returning lock_name as "lockName"
  `);

  if (result.rows.length === 0) {
    return { acquired: false };
  }

  const ensureLockHeld = () => {
    if (lockLost) {
      throw new SyncLockLostError();
    }
  };

  const checkLockOwnership = async () => {
    const ownership = await db.execute(sql<{ owned: number }>`
      select 1 as owned
      from sync_locks
      where
        lock_name = ${SYNC_LOCK_NAME}
        and holder_id = ${holderId}
        and expires_at >= now()
    `);

    return ownership.rows.length > 0;
  };

  const refreshLock = async () => {
    try {
      const heartbeat = await db.execute(sql<{ lockName: string }>`
        update sync_locks
        set expires_at = now() + ${SYNC_LOCK_TTL_MS} * interval '1 millisecond'
        where lock_name = ${SYNC_LOCK_NAME} and holder_id = ${holderId}
        returning lock_name as "lockName"
      `);

      if (heartbeat.rows.length === 0) {
        lockLost = true;
      }
    } catch {
      lockLost = true;
    }
  };

  const heartbeatTimer = setInterval(() => {
    void refreshLock();
  }, SYNC_LOCK_HEARTBEAT_MS);

  try {
    const value = await callback({
      holderId,
      ensureLockHeld,
      checkLockOwnership,
    });
    return { acquired: true, value };
  } finally {
    clearInterval(heartbeatTimer);
    await db
      .execute(sql`
        delete from sync_locks
        where lock_name = ${SYNC_LOCK_NAME} and holder_id = ${holderId}
      `)
      .catch(() => undefined);
  }
}

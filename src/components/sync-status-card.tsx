import { formatDateTime } from "@/lib/formatters";

type SyncStatusCardProps = {
  currentSnapshotCompletedAt?: Date | string | null;
  latestRun:
    | {
        status: string;
        phase: string;
        companyPagesProcessed: number;
        companyRowsWritten: number;
        uniqueUsersFetched: number;
        updatedAt: Date | string;
      }
    | null
    | undefined;
};

export function SyncStatusCard({
  currentSnapshotCompletedAt,
  latestRun,
}: SyncStatusCardProps) {
  return (
    <section className="rounded-[1.5rem] border border-stone-200 bg-stone-950 p-5 text-stone-50">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-400">
        Snapshot i sync status
      </p>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div>
          <p className="text-sm text-stone-400">Zadnji promovirani snapshot</p>
          <p className="mt-2 text-lg font-semibold">
            {formatDateTime(currentSnapshotCompletedAt)}
          </p>
        </div>
        <div>
          <p className="text-sm text-stone-400">Zadnji sync run</p>
          {latestRun ? (
            <div className="mt-2 space-y-1 text-sm text-stone-200">
              <p>
                Status: <span className="font-semibold">{latestRun.status}</span>
              </p>
              <p>Faza: {latestRun.phase}</p>
              <p>Pageova: {latestRun.companyPagesProcessed}</p>
              <p>Firmi zapisano: {latestRun.companyRowsWritten}</p>
              <p>Vlasnika dohvaceno: {latestRun.uniqueUsersFetched}</p>
              <p>Zadnji update: {formatDateTime(latestRun.updatedAt)}</p>
            </div>
          ) : (
            <p className="mt-2 text-sm text-stone-300">Sync jos nije pokrenut.</p>
          )}
        </div>
      </div>
    </section>
  );
}

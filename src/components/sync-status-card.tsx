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
    <section className="rounded-[1.5rem] border border-blue-700/40 bg-blue-950/80 p-5 text-blue-50">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-500">
        Snapshot i sync status
      </p>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div>
          <p className="text-sm text-slate-500">Zadnji promovirani snapshot</p>
          <p className="mt-2 text-lg font-semibold text-white">
            {formatDateTime(currentSnapshotCompletedAt)}
          </p>
        </div>
        <div>
          <p className="text-sm text-slate-500">Zadnji sync run</p>
          {latestRun ? (
            <div className="mt-2 space-y-1 text-sm text-blue-200">
              <p>
                Status: <span className="font-semibold text-blue-100">{latestRun.status}</span>
              </p>
              <p>Faza: {latestRun.phase}</p>
              <p>Pageova: {latestRun.companyPagesProcessed}</p>
              <p>Firmi zapisano: {latestRun.companyRowsWritten}</p>
              <p>Vlasnika dohvaceno: {latestRun.uniqueUsersFetched}</p>
              <p>Zadnji update: {formatDateTime(latestRun.updatedAt)}</p>
            </div>
          ) : (
            <p className="mt-2 text-sm text-slate-400">Sync jos nije pokrenut.</p>
          )}
        </div>
      </div>
    </section>
  );
}

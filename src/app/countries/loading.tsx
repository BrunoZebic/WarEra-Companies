export default function Loading() {
  return (
    <main className="min-h-screen px-6 py-10 sm:px-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-8">
        {/* PageHeader */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <div className="h-3 w-20 animate-pulse rounded bg-blue-900/50" />
            <div className="h-10 w-80 animate-pulse rounded-xl bg-blue-900/50" />
            <div className="h-4 w-96 animate-pulse rounded bg-blue-900/40" />
          </div>
          <div className="h-9 w-24 animate-pulse rounded-full bg-blue-900/50" />
        </div>

        {/* Sync status card */}
        <div className="rounded-[1.5rem] border border-blue-700/40 bg-blue-950/80 p-5">
          <div className="h-3 w-40 animate-pulse rounded bg-blue-900/50" />
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="h-14 w-full animate-pulse rounded-lg bg-blue-900/40" />
            <div className="h-14 w-full animate-pulse rounded-lg bg-blue-900/40" />
          </div>
        </div>

        {/* Table */}
        <div className="overflow-hidden rounded-[1.75rem] border border-blue-800/30 bg-blue-950/40">
          <div className="flex items-center justify-between border-b border-blue-900/40 px-5 py-4">
            <div className="h-4 w-48 animate-pulse rounded bg-blue-900/50" />
            <div className="h-4 w-32 animate-pulse rounded bg-blue-900/50" />
          </div>
          <div className="space-y-px p-2">
            {[...Array(12)].map((_, i) => (
              <div key={i} className="h-12 w-full animate-pulse rounded-lg bg-blue-900/30" />
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}

export default function Loading() {
  return (
    <main className="min-h-screen px-6 py-10 sm:px-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-8">
        {/* Hero section */}
        <div className="rounded-[2rem] border border-blue-800/30 bg-blue-950/40 p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl space-y-4">
              <div className="h-6 w-36 animate-pulse rounded-full bg-blue-900/50" />
              <div className="h-12 w-3/4 animate-pulse rounded-xl bg-blue-900/50" />
              <div className="h-4 w-full animate-pulse rounded bg-blue-900/40" />
              <div className="h-4 w-5/6 animate-pulse rounded bg-blue-900/40" />
            </div>
            <div className="space-y-3 rounded-3xl border border-blue-700/30 bg-blue-950/80 p-5 sm:min-w-80">
              <div className="h-4 w-full animate-pulse rounded bg-blue-900/50" />
              <div className="h-4 w-5/6 animate-pulse rounded bg-blue-900/50" />
              <div className="flex gap-3 pt-2">
                <div className="h-9 w-24 animate-pulse rounded-full bg-blue-900/50" />
                <div className="h-9 w-24 animate-pulse rounded-full bg-blue-900/50" />
              </div>
            </div>
          </div>
        </div>

        {/* Sync status card */}
        <div className="rounded-[1.5rem] border border-blue-700/40 bg-blue-950/80 p-5">
          <div className="h-3 w-40 animate-pulse rounded bg-blue-900/50" />
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <div className="h-3 w-32 animate-pulse rounded bg-blue-900/40" />
              <div className="h-5 w-48 animate-pulse rounded bg-blue-900/50" />
            </div>
            <div className="space-y-2">
              <div className="h-3 w-24 animate-pulse rounded bg-blue-900/40" />
              <div className="h-4 w-full animate-pulse rounded bg-blue-900/40" />
              <div className="h-4 w-4/5 animate-pulse rounded bg-blue-900/40" />
            </div>
          </div>
        </div>

        {/* Stat cards */}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="rounded-[1.5rem] border border-blue-800/30 bg-blue-950/40 p-5">
              <div className="h-3 w-24 animate-pulse rounded bg-blue-900/50" />
              <div className="mt-3 h-8 w-20 animate-pulse rounded-lg bg-blue-900/50" />
            </div>
          ))}
        </div>

        {/* Table cards */}
        <div className="grid gap-5 lg:grid-cols-2">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="rounded-[1.75rem] border border-blue-800/30 bg-blue-950/40 p-6">
              <div className="h-6 w-48 animate-pulse rounded-lg bg-blue-900/50" />
              <div className="mt-2 h-4 w-56 animate-pulse rounded bg-blue-900/40" />
              <div className="mt-5 space-y-2">
                {[...Array(6)].map((_, j) => (
                  <div key={j} className="h-10 w-full animate-pulse rounded-lg bg-blue-900/30" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}

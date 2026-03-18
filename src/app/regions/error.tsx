"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="min-h-screen px-6 py-10 sm:px-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-8">
        <div className="rounded-[1.75rem] border border-red-800/30 bg-red-950/20 p-10 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-red-400">Greska</p>
          <h2 className="mt-3 text-2xl font-semibold text-white">Greska pri ucitavanju regija</h2>
          <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-slate-400">
            {error.message || "Nije moguce dohvatiti region aggregate podatke."}
          </p>
          <button
            onClick={reset}
            className="mt-6 inline-flex items-center rounded-full border border-blue-700/40 bg-blue-900/30 px-5 py-2 text-sm font-medium text-blue-200 transition hover:bg-blue-800/40"
          >
            Pokusaj ponovo
          </button>
        </div>
      </div>
    </main>
  );
}

type StatCardProps = {
  label: string;
  value: string;
  hint?: string;
};

export function StatCard({ label, value, hint }: StatCardProps) {
  return (
    <article className="rounded-[1.5rem] border border-stone-200 bg-white/80 p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">
        {label}
      </p>
      <p className="mt-3 text-3xl font-semibold text-stone-950">{value}</p>
      {hint ? <p className="mt-2 text-sm text-stone-600">{hint}</p> : null}
    </article>
  );
}

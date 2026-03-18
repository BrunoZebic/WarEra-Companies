type EmptyStateProps = {
  title: string;
  description: string;
};

export function EmptyState({ title, description }: EmptyStateProps) {
  return (
    <section className="rounded-[1.75rem] border border-dashed border-blue-800/50 bg-blue-950/30 p-8 text-center">
      <h2 className="text-2xl font-semibold text-white">{title}</h2>
      <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-slate-400">
        {description}
      </p>
    </section>
  );
}

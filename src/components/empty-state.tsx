type EmptyStateProps = {
  title: string;
  description: string;
};

export function EmptyState({ title, description }: EmptyStateProps) {
  return (
    <section className="rounded-[1.75rem] border border-dashed border-stone-300 bg-white/70 p-8 text-center">
      <h2 className="text-2xl font-semibold text-stone-950">{title}</h2>
      <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-stone-600">
        {description}
      </p>
    </section>
  );
}

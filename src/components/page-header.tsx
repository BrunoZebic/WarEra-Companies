import Link from "next/link";
import { ArrowLeft } from "lucide-react";

type PageHeaderProps = {
  eyebrow: string;
  title: string;
  description?: string;
  backHref?: string;
};

export function PageHeader({
  eyebrow,
  title,
  description,
  backHref = "/",
}: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="max-w-3xl">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-blue-500">
          {eyebrow}
        </p>
        <h1 className="mt-2 text-4xl font-semibold text-white">{title}</h1>
        {description ? (
          <p className="mt-3 text-sm leading-6 text-slate-400">{description}</p>
        ) : null}
      </div>

      <Link
        href={backHref}
        className="inline-flex items-center gap-2 rounded-full border border-blue-800/50 bg-blue-950/50 px-4 py-2 text-sm font-medium text-blue-200 transition hover:bg-blue-900/50"
      >
        <ArrowLeft className="h-4 w-4" />
        Natrag
      </Link>
    </div>
  );
}

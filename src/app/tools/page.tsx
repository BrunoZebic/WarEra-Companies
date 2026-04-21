import Link from "next/link";
import { Calculator, ArrowRight } from "lucide-react";

import { PageHeader } from "@/components/page-header";

export const revalidate = 600;

export default function ToolsPage() {
  return (
    <main className="min-h-screen px-6 py-10 sm:px-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-8">
        <PageHeader
          eyebrow="Tools"
          title="Warera tools"
          description="Specijalizirani alati iznad postojeceg snapshot analytics sloja."
        />

        <section className="grid gap-5 lg:grid-cols-2">
          <Link
            href="/tools/country-tax"
            className="group rounded-[1.75rem] border border-blue-800/30 bg-blue-950/40 p-6 transition hover:border-blue-500/40 hover:bg-blue-950/55"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-3">
                <p className="inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-blue-400">
                  <Calculator className="h-3.5 w-3.5" />
                  Country tool
                </p>
                <h2 className="text-2xl font-semibold text-white">Country tax income</h2>
                <p className="max-w-xl text-sm leading-6 text-slate-400">
                  Hourly tax explorer with UTC range filters, item breakdowns, owner
                  origin analysis, and core vs non-core region splits.
                </p>
              </div>
              <ArrowRight className="mt-1 h-5 w-5 text-blue-400 transition group-hover:translate-x-1" />
            </div>
          </Link>
        </section>
      </div>
    </main>
  );
}

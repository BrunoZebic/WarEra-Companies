import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { ProductsTable } from "@/components/products-table";
import { StatCard } from "@/components/stat-card";
import { SyncStatusCard } from "@/components/sync-status-card";
import { getProductsPageData } from "@/lib/db/read-models";
import { formatDecimal, formatNumber } from "@/lib/formatters";

export const revalidate = 600;

export default async function ProductsPage() {
  const data = await getProductsPageData();
  const totalWorkers = data.products.reduce((sum, product) => sum + product.totalWorkers, 0);
  const totalProduction = data.products.reduce(
    (sum, product) => sum + product.totalProduction,
    0,
  );

  return (
    <main className="min-h-screen px-6 py-10 sm:px-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-8">
        <PageHeader
          eyebrow="Products"
          title="Proizvodi, ponuda i outlook"
          description="Pregled aktivnih Warera proizvoda po broju firmi, workersima, productionu i zadnjem snapshot trendu."
          backHref="/"
        />

        <SyncStatusCard
          currentSnapshotCompletedAt={data.currentSnapshot?.completedAt ?? null}
          latestRun={data.latestRun}
        />

        {!data.configured ? (
          <EmptyState
            title="Database nije konfiguriran"
            description="Dodaj DATABASE_URL i syncaj podatke prije otvaranja product analytics pogleda."
          />
        ) : !data.currentSnapshot ? (
          <EmptyState
            title="Nema promoviranog snapshota"
            description="Pokreni protected sync rutu da bi se izgradili product aggregate podaci."
          />
        ) : (
          <>
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="Tracked products"
                value={formatNumber(data.products.length)}
              />
              <StatCard
                label="Uncoded companies"
                value={formatNumber(data.uncodedCompaniesCount)}
                hint="Firma bez itemCode"
              />
              <StatCard
                label="Ukupno workersa"
                value={formatNumber(totalWorkers)}
              />
              <StatCard
                label="Ukupni production"
                value={formatDecimal(totalProduction, 2)}
              />
            </section>

            <section
              className={`rounded-[1.5rem] border p-5 ${
                data.outlookState.status === "available"
                  ? "border-blue-700/40 bg-blue-950/80"
                  : "border-amber-700/30 bg-amber-950/20"
              }`}
            >
              <p
                className={`text-xs font-semibold uppercase tracking-[0.2em] ${
                  data.outlookState.status === "available"
                    ? "text-blue-400"
                    : "text-amber-400"
                }`}
              >
                Outlook status
              </p>
              <p className="mt-3 text-sm leading-6 text-slate-300">
                {data.outlookState.message}
              </p>
            </section>

            {data.products.length > 0 ? (
              <ProductsTable products={data.products} />
            ) : (
              <EmptyState
                title="Nema product podataka"
                description="Aktivni snapshot trenutno nema firmi s popunjenim itemCode poljem."
              />
            )}
          </>
        )}
      </div>
    </main>
  );
}

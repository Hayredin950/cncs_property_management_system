import { Building2, PackageSearch, ScanLine } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "../../components/Button";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState, OfflineState } from "../../components/ErrorState";
import { ItemCard } from "../../components/ItemCard";
import { SearchBar } from "../../components/SearchBar";
import { SkeletonCard } from "../../components/Skeleton";
import { useItems } from "../../hooks/useItems";
import { NetworkError } from "../../types/api";

/**
 * `/` — the front door (F4.2). Zero-training: scan or search, nothing else to
 * learn (SRS §4 usability). Reuses `ItemCard`/`useItems` from the `/items`
 * browse page so "recently added" and the full browse grid never look or
 * behave differently.
 */
export function LandingPage() {
  const navigate = useNavigate();
  const recentQuery = useItems({ page: 1, limit: 8 });

  function handleSearch(value: string) {
    if (value.trim()) {
      navigate(`/items?search=${encodeURIComponent(value.trim())}`);
    }
  }

  return (
    <div className="flex flex-col gap-12">
      <section className="flex flex-col items-center gap-5 py-6 text-center sm:py-10">
        <h1 className="text-3xl font-bold text-slate-900 sm:text-4xl">Find a campus asset</h1>
        <p className="max-w-md text-slate-500">
          Scan the QR tag on any CNCS property item, or search by name or tag ID below.
        </p>

        <div className="flex w-full max-w-md flex-col gap-3">
          <Link to="/scan">
            {/* Was overridden to the teal `accent-600`; the accent token now
                carries AAU's red, and a red primary CTA would be the one button
                on this page the official site has no equivalent for. AAU's own
                CTAs are all `blue-600`, so this is the default primary variant
                — and dropping the override also stops the class from silently
                doing nothing, which it did: `bg-brand-600` from the variant and
                `bg-accent-600` here have equal specificity, and Tailwind emits
                `brand-600` last, so the button has rendered blue regardless. */}
            <Button size="lg" fullWidth leftIcon={<ScanLine className="h-5 w-5" />}>
              Scan a tag
            </Button>
          </Link>

          <div className="flex items-center gap-3 text-xs font-medium uppercase tracking-wide text-slate-400">
            <span className="h-px flex-1 bg-slate-200" aria-hidden="true" />
            or search
            <span className="h-px flex-1 bg-slate-200" aria-hidden="true" />
          </div>

          <SearchBar value="" onChange={handleSearch} debounceMs={500} />

          {/*
            Two full-weight buttons, not bare text links. These are the page's
            other two primary ways in, so they get the same button treatment the
            rest of the app uses rather than depending on the visitor noticing a
            line of underlined text below the search box.
          */}
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link to="/items" className="sm:flex-1">
              <Button
                variant="outline"
                fullWidth
                leftIcon={<PackageSearch className="h-4 w-4" />}
              >
                Browse all items
              </Button>
            </Link>
            <Link to="/map" className="sm:flex-1">
              <Button
                variant="outline"
                fullWidth
                leftIcon={<Building2 className="h-4 w-4" />}
              >
                Browse by building
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold text-slate-900">Recently added</h2>

        {recentQuery.isPending ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <SkeletonCard key={index} />
            ))}
          </div>
        ) : recentQuery.isError ? (
          recentQuery.error instanceof NetworkError ? (
            <OfflineState />
          ) : (
            <ErrorState heading="Couldn't load recent items" />
          )
        ) : recentQuery.data.data.length === 0 ? (
          <EmptyState icon={<PackageSearch className="h-8 w-8" />} heading="No items registered yet" />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {recentQuery.data.data.map((item) => (
              <ItemCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

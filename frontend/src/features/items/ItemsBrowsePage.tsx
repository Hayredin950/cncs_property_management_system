import { PackageSearch, X } from "lucide-react";
import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "../../components/Button";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState, OfflineState } from "../../components/ErrorState";
import { ItemActions } from "../../components/ItemActions";
import { ItemCard } from "../../components/ItemCard";
import { Pagination } from "../../components/Pagination";
import { SearchBar } from "../../components/SearchBar";
import { Select } from "../../components/Select";
import { SkeletonCard } from "../../components/Skeleton";
import { useCategories } from "../../hooks/useCategories";
import { useItems } from "../../hooks/useItems";
import { DEPARTMENT_OPTIONS } from "../../lib/departments";
import { NetworkError } from "../../types/api";

/**
 * `GET /items?page=&limit=&search=&categoryId=&department=` (frontend-plan.md
 * §7). Search/filters/page live in the URL, so a filtered list is shareable and
 * the browser's Back button restores the exact state left behind — deliberately
 * no "show disposed" toggle, since disposed items never appear here no matter
 * what the query string says (server-enforced, F7.2).
 */
export function ItemsBrowsePage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const page = Number(searchParams.get("page") ?? "1") || 1;
  const search = searchParams.get("search") ?? "";
  const categoryId = searchParams.get("categoryId") ?? "";
  const department = searchParams.get("department") ?? "";
  const hasFilters = Boolean(search || categoryId || department);

  const categoriesQuery = useCategories();
  const itemsQuery = useItems({
    page,
    limit: 20,
    ...(search ? { search } : {}),
    ...(categoryId ? { categoryId } : {}),
    ...(department ? { department } : {}),
  });

  function updateParam(key: string, value: string) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) next.set(key, value);
      else next.delete(key);
      next.delete("page");
      return next;
    });
  }

  function setPage(nextPage: number) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("page", String(nextPage));
      return next;
    });
  }

  function clearFilters() {
    setSearchParams({});
  }

  const categoryOptions = useMemo(
    () => (categoriesQuery.data ?? []).map((category) => ({ value: category.id, label: category.name })),
    [categoriesQuery.data],
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Browse items</h1>
        <p className="mt-1 text-sm text-slate-500">
          Search the active inventory by name, tag ID, category, or department.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <SearchBar value={search} onChange={(value) => updateParam("search", value)} className="sm:flex-1" />
        <Select
          label="Category"
          options={categoryOptions}
          placeholder="All categories"
          value={categoryId}
          onChange={(event) => updateParam("categoryId", event.target.value)}
          className="sm:w-48"
        />
        {/*
          A `Select`, not the free-text input this used to be: the department
          vocabulary is fixed (lib/departments.ts), so filtering by a name that
          matches nothing is not possible by accident.
        */}
        <Select
          label="Department"
          options={DEPARTMENT_OPTIONS}
          placeholder="All departments"
          value={department}
          onChange={(event) => updateParam("department", event.target.value)}
          className="sm:w-56"
        />
        {hasFilters && (
          <Button variant="ghost" size="md" leftIcon={<X className="h-4 w-4" />} onClick={clearFilters}>
            Clear
          </Button>
        )}
      </div>

      {itemsQuery.isPending ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <SkeletonCard key={index} />
          ))}
        </div>
      ) : itemsQuery.isError ? (
        itemsQuery.error instanceof NetworkError ? (
          <OfflineState />
        ) : (
          <ErrorState
            heading="Couldn't load items"
            {...(itemsQuery.error instanceof Error && itemsQuery.error.message
              ? { body: itemsQuery.error.message }
              : {})}
            action={
              <Button size="sm" onClick={() => itemsQuery.refetch()}>
                Try again
              </Button>
            }
          />
        )
      ) : itemsQuery.data.data.length === 0 ? (
        hasFilters ? (
          <EmptyState
            icon={<PackageSearch className="h-8 w-8" />}
            heading="No items match these filters"
            body="Try a different search, or clear your filters."
            action={
              <Button size="sm" onClick={clearFilters}>
                Clear filters
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={<PackageSearch className="h-8 w-8" />}
            heading="No items registered yet"
            body="Registered items will show up here."
          />
        )
      ) : (
        <>
          <div
            className={[
              "grid grid-cols-1 gap-4 transition-opacity sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
              itemsQuery.isFetching ? "opacity-60" : "",
            ].join(" ")}
          >
            {itemsQuery.data.data.map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                actions={<ItemActions item={item} variant="icons" />}
              />
            ))}
          </div>
          <Pagination
            page={itemsQuery.data.pagination.page}
            totalPages={itemsQuery.data.pagination.totalPages}
            onPageChange={setPage}
          />
        </>
      )}
    </div>
  );
}

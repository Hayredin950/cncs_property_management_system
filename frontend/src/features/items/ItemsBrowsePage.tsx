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
import { useAuth } from "../../app/AuthContext";
import { useCategories } from "../../hooks/useCategories";
import { useItems } from "../../hooks/useItems";
import { DEPARTMENT_OPTIONS } from "../../lib/departments";
import { seesAllItems } from "../../lib/permissions";
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
  const { user } = useAuth();

  /**
   * Whether this viewer's `/items` is the whole register or a scoped list.
   *
   * The server decides that, not this flag (`services/itemScope.ts`): a Property
   * Officer and an Auditor get the college, a Department Head gets their unit plus
   * their own holdings, and a Staff member gets only what they hold. This reads the
   * same capability the sidebar does, so the two screens cannot disagree, and it
   * exists because they did — see `isScoped` below.
   */
  const isScoped = !seesAllItems(user?.role);

  const page = Number(searchParams.get("page") ?? "1") || 1;
  const search = searchParams.get("search") ?? "";
  const categoryId = searchParams.get("categoryId") ?? "";
  const department = searchParams.get("department") ?? "";
  const mine = searchParams.get("mine") === "true";
  const hasFilters = Boolean(search || categoryId || department);

  const categoriesQuery = useCategories();
  const itemsQuery = useItems({
    page,
    limit: 20,
    ...(search ? { search } : {}),
    ...(categoryId ? { categoryId } : {}),
    ...(department ? { department } : {}),
    ...(mine ? { mine: true } : {}),
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
      {/*
        One URL, two honest readings.

        `/items` is reachable by every role — the header links it as "All items"
        and the QR scanner lands here — but the server scopes it, so a Staff
        member browsing `/items` sees only their own holdings. The page used to
        say "Browse items · search the active inventory" regardless, and its empty
        state said "No items registered yet" — which told a Staff member that the
        register was empty while the same URL with `?mine=true` (or the
        department's own list) showed items. The data was never wrong; the copy
        was, and it read as a bug in the data.

        So the heading states the scope the server actually applied. Nothing about
        the request changes — the server has always scoped it; only the words do.
      */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          {mine
            ? "My items"
            : isScoped && user?.role === "DEPARTMENT_HEAD"
              ? "Department items"
              : isScoped
                ? "My items"
                : "Browse items"}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {mine
            ? "The items currently in your custody. Search by name, tag ID, or category."
            : isScoped && user?.role === "DEPARTMENT_HEAD"
              ? "All items in your department. Search by name, tag ID, or category."
              : isScoped
                ? "The items currently in your custody. Search by name, tag ID, or category."
                : "Search the active inventory by name, tag ID, category, or department."}
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
            heading={isScoped ? "Nothing is assigned to you yet" : "No items registered yet"}
            body={
              isScoped
                ? "Items you hold will appear here. A transfer request is how an item moves from the college pool to you."
                : "Registered items will show up here."
            }
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

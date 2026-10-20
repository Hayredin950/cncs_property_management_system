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
import { useDepartments } from "../../hooks/useDepartments";
import { useItems } from "../../hooks/useItems";
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

  const isScoped = !seesAllItems(user?.role);

  const page = Number(searchParams.get("page") ?? "1") || 1;
  const search = searchParams.get("search") ?? "";
  const categoryId = searchParams.get("categoryId") ?? "";
  const orgUnitId = searchParams.get("orgUnitId") ?? "";
  const mine = searchParams.get("mine") === "true";
  const scope = searchParams.get("scope") ?? (mine ? "mine" : "all");
  /**
   * Whether the viewer narrowed the list themselves.
   *
   * The scope ("my items" / "my department" / "all departments") is a **view**,
   * not a filter: it is always set, and it is the reason a staff member with no
   * holdings sees an empty list. Counting it as a filter made the empty state
   * say "No items match these filters — Clear filters" to people who had not
   * filtered anything, and offered them a button that cleared nothing. The
   * honest message for a scoped viewer is "Nothing is assigned to you yet".
   */
  const hasFilters = Boolean(search || categoryId || orgUnitId);

  // Auto-set department filter based on scope for Department Heads and Staff
  // Only auto-set when user hasn't manually selected a department
  const effectiveOrgUnitId = (() => {
    if (!user) return orgUnitId;
    if (user.role === "DEPARTMENT_HEAD" || user.role === "STAFF") {
      // If user manually selected a department, respect that choice
      if (orgUnitId) return orgUnitId;
      // Otherwise auto-set based on scope
      if (scope === "mine" || scope === "department" || !scope) {
        return user.departmentId || orgUnitId;
      }
      if (scope === "other" || scope === "all") {
        return ""; // No department filter for other/all scopes (unless manually set)
      }
    }
    return orgUnitId;
  })();

  const categoriesQuery = useCategories();
  const departmentsQuery = useDepartments();
  const itemsQuery = useItems({
    page,
    limit: 20,
    ...(search ? { search } : {}),
    ...(categoryId ? { categoryId } : {}),
    ...(effectiveOrgUnitId ? { orgUnitId: effectiveOrgUnitId } : {}),
    ...(scope ? { scope } : {}),
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

  const departmentOptions = useMemo(
    () => (departmentsQuery.data ?? []).map((dept) => ({ value: dept.id, label: dept.name })),
    [departmentsQuery.data],
  );

  // Determine scope options based on role
  const getScopeOptions = () => {
    if (user?.role === "DEPARTMENT_HEAD") {
      return [
        { value: "all", label: "All departments" },
        { value: "mine", label: "My items" },
        { value: "department", label: "My department" },
        { value: "other", label: "Other departments" },
      ];
    }
    if (user?.role === "PROPERTY_OFFICER" || user?.role === "AUDITOR") {
      return [
        { value: "all", label: "All campus" },
        { value: "mine", label: "My items" },
      ];
    }
    // STAFF sees "My items", "My department", and "All departments" scopes
    if (user?.role === "STAFF") {
      return [
        { value: "all", label: "All departments" },
        { value: "mine", label: "My items" },
        { value: "department", label: "My department" },
      ];
    }
    return [];
  };

  const scopeOptions = getScopeOptions();
  const currentScope = scopeOptions.find((o) => o.value === scope)?.value ?? (scope || "");
  const showScopeDropdown = scopeOptions.length > 0;

  // Determine heading and description based on scope
  const getHeading = () => {
    if (user?.role === "DEPARTMENT_HEAD") {
      switch (scope) {
        case "mine":
          return "My items";
        case "department":
          return "My department";
        case "other":
          return "Other departments";
        case "all":
          return "All departments";
        default:
          return "All departments";
      }
    }
    if (user?.role === "PROPERTY_OFFICER" || user?.role === "AUDITOR") {
      // The full register. "All departments" is what the scope dropdown says;
      // as a page heading it reads like a filtered view of something else, and
      // the nav item that leads here is called "Browse Items". The narrowed
      // views keep their own names, because there the scope IS the subject.
      return scope === "mine" ? "My items" : "Browse items";
    }
    if (user?.role === "STAFF") {
      switch (scope) {
        case "mine":
          return "My items";
        case "department":
          return "My department";
        default:
          return "My items";
      }
    }
    return "Browse items";
  };

  const getDescription = () => {
    if (user?.role === "DEPARTMENT_HEAD") {
      switch (scope) {
        case "mine":
          return "The items currently in your custody. Search by name, tag ID, or category.";
        case "department":
          return "All items in your department. Search by name, tag ID, or category.";
        case "other":
          return "Items from other departments for transfer requests. Limited view: name, category, building, status.";
        case "all":
          return "All items across all departments. Search by name, tag ID, category, or department.";
        default:
          return "All items across all departments. Search by name, tag ID, category, or department.";
      }
    }
    if (user?.role === "PROPERTY_OFFICER" || user?.role === "AUDITOR") {
      return scope === "mine"
        ? "The items currently in your custody. Search by name, tag ID, or category."
        : "Search the active inventory by name, tag ID, category, or department.";
    }
    if (user?.role === "STAFF") {
      switch (scope) {
        case "mine":
          return "The items currently in your custody. Search by name, tag ID, or category.";
        case "department":
          return "All items in your department. Search by name, tag ID, or category.";
        default:
          return "The items currently in your custody. Search by name, tag ID, or category.";
      }
    }
    return "Search the active inventory by name, tag ID, category, or department.";
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{getHeading()}</h1>
        <p className="mt-1 text-sm text-slate-500">{getDescription()}</p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <SearchBar value={search} onChange={(value) => updateParam("search", value)} className="sm:flex-1" />
        {/* Unified scope dropdown */}
        {showScopeDropdown && (
          <Select
            label="Scope"
            options={scopeOptions}
            value={currentScope}
            onChange={(event) => updateParam("scope", event.target.value)}
            className="sm:w-56"
          />
        )}
        <Select
          label="Category"
          options={categoryOptions}
          placeholder="All categories"
          value={categoryId}
          onChange={(event) => updateParam("categoryId", event.target.value)}
          className="sm:w-48"
        />
        {/*
          Department filter from GET /departments (OrgUnits)
          Uses orgUnitId for backend filtering
          For DEPARTMENT_HEAD/STAFF: auto-set based on scope
        */}
        <Select
          label="Department"
          options={departmentOptions}
          placeholder="All departments"
          value={orgUnitId}
          onChange={(event) => updateParam("orgUnitId", event.target.value)}
          className="sm:w-56"
          disabled={scope === "mine" || scope === "department"}
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
              "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
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
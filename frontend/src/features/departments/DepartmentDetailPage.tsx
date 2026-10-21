import { Users, Package, Search } from "lucide-react";
import { Link, useParams, useSearchParams, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useAuth } from "@/app/AuthContext";
import { Card } from "@/components/Card";
import { SearchBar } from "@/components/SearchBar";
import { Select } from "@/components/Select";
import { Button } from "@/components/Button";
import { ItemCard } from "@/components/ItemCard";
import { ItemActions } from "@/components/ItemActions";
import { Pagination } from "@/components/Pagination";
import { SkeletonCard } from "@/components/Skeleton";
import { fetchDepartmentRoster, fetchDepartmentStaff } from "@/api/departments";
import { useQuery } from "@tanstack/react-query";
import { useCategories } from "@/hooks/useCategories";
import { useItems } from "@/hooks/useItems";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState, OfflineState } from "@/components/ErrorState";
import { NetworkError } from "@/types/api";
import { PackageSearch } from "lucide-react";

/**
 * `/departments/:id` — Department detail page for Department Heads.
 * Two tabs:
 * 1. Items — department items with images, clickable for details
 * 2. Staff — department staff member accounts
 */
export function DepartmentDetailPage() {
  const id = useParams<{ id: string }>().id ?? "";
  const { user } = useAuth();
  const isDeptHead = user?.role === "DEPARTMENT_HEAD";
  const navigate = useNavigate();

  // Check if user can access this department
  const canAccess = isDeptHead && user?.departmentId === id;

  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<"items" | "staff">("items");
  const page = Number(searchParams.get("page") ?? "1") || 1;
  const search = searchParams.get("search") ?? "";
  const categoryId = searchParams.get("categoryId") ?? "";

  const rosterQuery = useQuery({
    queryKey: ["department-roster", id],
    queryFn: () => fetchDepartmentRoster(id),
    enabled: !!id,
  });

  // Items query for department items
  const itemsQuery = useItems({
    page,
    limit: 12,
    ...(search ? { search } : {}),
    ...(categoryId ? { categoryId } : {}),
    orgUnitId: id,
    scope: "department",
  });

  // Staff query for department staff
  // Above the early return below: a hook called after one is called
  // conditionally, and React notices.
  const categoriesQuery = useCategories();

  const staffQuery = useQuery({
    queryKey: ["department-staff", id],
    queryFn: () => fetchDepartmentStaff(id),
    enabled: !!id,
  });

  if (!canAccess) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Access Denied</h1>
          <p className="mt-1 text-sm text-slate-500">
            You can only view your own department's details.
          </p>
        </div>
      </div>
    );
  }

  const departmentName = rosterQuery.data?.department?.name ?? "Loading...";
  const staffMembers = staffQuery.data?.staff ?? [];
  // The staff list carries roles, so the head can be named without another
  // request.
  const headName = staffMembers.find((member) => member.role === "DEPARTMENT_HEAD")?.fullName;

  function updateParam(key: string, value: string) {
    if (activeTab === "items") {
      const params = new URLSearchParams(window.location.search);
      if (value) params.set(key, value);
      else params.delete(key);
      params.delete("page");
      navigate(`?${params.toString()}`);
    }
  }

  function clearFilters() {
    const params = new URLSearchParams(window.location.search);
    params.delete("search");
    params.delete("categoryId");
    params.delete("page");
    navigate(`?${params.toString()}`);
  }

  // The real categories, from the server. The three hardcoded ones had ids
  // "1", "2" and "3" — which are not category ids, so choosing a category
  // filtered for an item that does not exist and the list came back empty with
  // no explanation.
  const categoryOptions = [
    { value: "", label: "All categories" },
    ...(categoriesQuery.data ?? []).map((category) => ({
      value: category.id,
      label: category.name,
    })),
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* Header with breadcrumb and department name */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Link
            to="/dashboard"
            className="text-sm text-slate-500 hover:text-slate-700 flex items-center gap-1"
          >
            <span className="text-base">←</span>
            <span className="text-sm font-medium">Dashboard</span>
          </Link>
          <span className="text-slate-300">/</span>
          <span className="text-sm font-medium text-slate-700">{departmentName}</span>
        </div>
        <h1 className="text-2xl font-bold text-slate-900">{departmentName}</h1>
      </div>

      {/* Department summary cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-100">
              <span className="text-xl font-bold text-brand-600">
                {departmentName?.charAt(0) ?? "?"}
              </span>
            </div>
            <div>
              <p className="text-sm text-slate-500">Department Head</p>
              {/* The head is a person. This used to print the department's
                  own name under the label "Department Head", which told a
                  department head nothing they did not already know. */}
              <p className="font-semibold text-slate-900">
                {headName ?? "Not appointed"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-100">
              <Users className="h-5 w-5 text-brand-600" aria-hidden="true" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{rosterQuery.data?.staffCount ?? 0}</p>
              <p className="text-xs text-slate-600">staff members</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-100">
              <Package className="h-5 w-5 text-accent-600" aria-hidden="true" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{itemsQuery.data?.pagination?.total ?? 0}</p>
              <p className="text-xs text-slate-600">items in department</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Tab navigation */}
      <div className="flex border-b border-slate-200">
        <button
          onClick={() => setActiveTab("items")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "items"
              ? "border-brand-600 text-brand-600"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          Items ({itemsQuery.data?.pagination?.total ?? 0})
        </button>
        <button
          onClick={() => setActiveTab("staff")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "staff"
              ? "border-brand-600 text-brand-600"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          Staff ({staffMembers.length})
        </button>
      </div>

      {/* Tab content */}
      {activeTab === "items" && (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <SearchBar
              value={search}
              onChange={(value) => updateParam("search", value)}
              className="sm:flex-1"
            />
            <Select
              label="Category"
              options={categoryOptions}
              placeholder="All categories"
              value={categoryId}
              onChange={(event) => updateParam("categoryId", event.target.value)}
              className="sm:w-48"
            />
            {(search || categoryId) && (
              <Button
                variant="ghost"
                size="md"
                leftIcon={<Search className="h-4 w-4" />}
                onClick={clearFilters}
              >
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
                heading="Couldn't load department items"
                body={itemsQuery.error instanceof Error ? itemsQuery.error.message : undefined}
                action={
                  <Button size="sm" onClick={() => itemsQuery.refetch()}>
                    Try again
                  </Button>
                }
              />
            )
          ) : itemsQuery.data.data.length === 0 ? (
            <EmptyState
              icon={<PackageSearch className="h-8 w-8" />}
              heading="No items in this department"
              body="Items registered to this department will appear here."
            />
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
                onPageChange={(nextPage) => {
                  const params = new URLSearchParams(window.location.search);
                  params.set("page", String(nextPage));
                  navigate(`?${params.toString()}`);
                }}
              />
            </>
          )}
        </div>
      )}

      {activeTab === "staff" && (
        <div className="flex flex-col gap-4">
          {staffQuery.isPending ? (
            <div className="grid gap-4">
              {Array.from({ length: 3 }).map((_, index) => (
                <Card key={index} className="h-20" />
              ))}
            </div>
          ) : staffQuery.isError ? (
            <ErrorState
              heading="Couldn't load department staff"
              action={
                <Button size="sm" onClick={() => staffQuery.refetch()}>
                  Try again
                </Button>
              }
            />
          ) : staffMembers.length === 0 ? (
            <EmptyState
              icon={<Users className="h-8 w-8" />}
              heading="No staff members in this department"
              body="Staff members assigned to this department will appear here."
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {staffMembers.map((staff) => (
                <Card key={staff.id} className="flex flex-col gap-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-100">
                      <span className="text-xl font-bold text-brand-600">
                        {staff.fullName?.charAt(0) ?? "?"}
                      </span>
                    </div>
                    <div>
                      <h3 className="font-semibold text-slate-900">{staff.fullName}</h3>
                      <p className="text-sm text-slate-500">{staff.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span className="flex items-center gap-1">
                      <Package className="h-3 w-3" aria-hidden="true" />
                      {staff.itemCount ?? 0} items
                    </span>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
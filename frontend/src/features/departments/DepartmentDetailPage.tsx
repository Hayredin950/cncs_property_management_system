import { Users, Package } from "lucide-react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "@/app/AuthContext";
import { Card } from "@/components/Card";
import { SearchBar } from "@/components/SearchBar";
import { Select } from "@/components/Select";

import { fetchDepartmentRoster } from "@/api/departments";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/Button";

/**
 * `/departments/:id` — Department detail page for Department Heads.
 * Shows department roster, items, and pending requests.
 */
export function DepartmentDetailPage() {
  const id = useParams<{ id: string }>().id ?? "";
  const { user } = useAuth();
  const isDeptHead = user?.role === "DEPARTMENT_HEAD";

  // Check if user can access this department
  const canAccess = isDeptHead && user?.departmentId === id;

  const [searchParams] = useSearchParams();
  Number(searchParams.get("page") ?? "1") || 1;
  searchParams.get("search") ?? "";
  searchParams.get("categoryId") ?? "";
  searchParams.get("mine") === "true";

  const rosterQuery = useQuery({
    queryKey: ["department-roster", id],
    queryFn: () => fetchDepartmentRoster(id),
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

  return (
    <div className="flex flex-col gap-6">
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
          <span className="text-sm font-medium text-slate-700">{rosterQuery.data?.department?.name ?? "Loading..."}</span>
        </div>
        <h1 className="text-2xl font-bold text-slate-900">{rosterQuery.data?.department?.name ?? "Loading..."}</h1>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-100">
              <span className="text-xl font-bold text-brand-600">
                {rosterQuery.data?.department?.name?.charAt(0) ?? "?"}
              </span>
            </div>
            <div>
              <p className="text-sm text-slate-500">Department Head</p>
              <p className="font-semibold text-slate-900">{rosterQuery.data?.department?.name ?? "Loading..."}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100">
              <Users className="h-5 w-5 text-emerald-600" aria-hidden="true" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{rosterQuery.data?.staffCount ?? 0}</p>
              <p className="text-xs text-slate-600">staff members</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100">
              <Package className="h-5 w-5 text-amber-600" aria-hidden="true" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{rosterQuery.data?.staffCount ?? 0}</p>
              <p className="text-xs text-slate-600">items in department</p>
            </div>
          </div>
        </Card>
      </div>

      <div className="flex flex-col gap-6">
        <div>
          <h2 className="text-xl font-semibold text-slate-900 flex items-center justify-between">
            Department Items
            <Link to={`/items?scope=department`} className="text-sm font-medium text-brand-700 hover:underline">
              View all →
            </Link>
          </h2>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <SearchBar value="" onChange={() => {}} className="sm:flex-1" />
          <Select
            label="Category"
            options={[{ value: "", label: "All categories" }, { value: "1", label: "Electronics" }, { value: "2", label: "Furniture" }, { value: "3", label: "Lab Equipment" }]}
            placeholder="All categories"
            value=""
            onChange={() => {}}
            className="sm:w-48"
          />
          <Button variant="ghost" size="md" leftIcon={<span>←</span>} onClick={() => {}}>
            Clear
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <div
            key="1"
            className="border border-slate-200 rounded-lg p-4 bg-white"
          >
            <h3 className="font-semibold text-slate-900">Dell Latitude Laptop</h3>
            <p className="text-sm text-slate-500">CNCS-DEMO-0001</p>
            <p className="text-sm text-slate-500">Electronics</p>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">ACTIVE</span>
          </div>
          <div
            key="2"
            className="border border-slate-200 rounded-lg p-4 bg-white"
          >
            <h3 className="font-semibold text-slate-900">Office Desk</h3>
            <p className="text-sm text-slate-500">CNCS-DEMO-0002</p>
            <p className="text-sm text-slate-500">Furniture</p>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">ACTIVE</span>
          </div>
          <div
            key="3"
            className="border border-slate-200 rounded-lg p-4 bg-white"
          >
            <h3 className="font-semibold text-slate-900">Microscope</h3>
            <p className="text-sm text-slate-500">CNCS-DEMO-0003</p>
            <p className="text-sm text-slate-500">Lab Equipment</p>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">FAIR</span>
          </div>
        </div>
      </div>
    </div>
  );
}
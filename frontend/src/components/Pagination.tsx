import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "../lib/cn";
import { IconButton } from "./IconButton";

export interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  className?: string;
}

/**
 * frontend-design-system.md §8: prev/next + a page indicator, no jump-to-page
 * input — `limit` caps at 100 server-side, so the API's own pages are small
 * enough that a jump control isn't worth the extra UI.
 */
export function Pagination({ page, totalPages, onPageChange, className }: PaginationProps) {
  if (totalPages <= 1) return null;

  return (
    <nav aria-label="Pagination" className={cn("flex items-center justify-center gap-3", className)}>
      <IconButton
        icon={<ChevronLeft className="h-4 w-4" />}
        label="Previous page"
        variant="outline"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
      />
      <span className="text-sm text-slate-600" aria-live="polite">
        Page {page} of {totalPages}
      </span>
      <IconButton
        icon={<ChevronRight className="h-4 w-4" />}
        label="Next page"
        variant="outline"
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
      />
    </nav>
  );
}

import { useQuery } from "@tanstack/react-query";
import { fetchItemHistory } from "../../api/items";
import { Button } from "../../components/Button";
import { ErrorState } from "../../components/ErrorState";
import { HistoryList } from "../../components/HistoryList";
import { ApiError } from "../../types/api";

/**
 * Grouped edit history (F2.3, F6.3) over `GET /items/:id/history`.
 *
 * Extracted from `ItemStaffPage` so the public item page can render the same
 * history in its "staff detail & tag" disclosure without a second implementation —
 * two copies of a query key or a limit is how two screens start disagreeing about
 * what the history contains. The query key is the same one the staff page used
 * (`["item-history", itemId]`), so opening the disclosure after visiting the staff
 * page costs no request.
 */
export function ItemHistorySection({ itemId }: { itemId: string }) {
  const historyQuery = useQuery({
    queryKey: ["item-history", itemId],
    queryFn: ({ signal }) => fetchItemHistory(itemId, { limit: 50 }, signal),
  });

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Edit history</h2>
      {historyQuery.isError ? (
        <ErrorState
          heading="Couldn't load the edit history"
          body={historyQuery.error instanceof ApiError ? historyQuery.error.message : undefined}
          action={
            <Button size="sm" onClick={() => historyQuery.refetch()}>
              Try again
            </Button>
          }
        />
      ) : (
        <HistoryList entries={historyQuery.data?.entries ?? []} loading={historyQuery.isPending} />
      )}
    </section>
  );
}

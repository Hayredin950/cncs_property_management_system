import { useQuery } from "@tanstack/react-query";
import { fetchTransferRecipients, type TransferRecipient } from "../api/users";

export function useTransferRecipients(search: string = "", department?: string) {
  const trimmed = search.trim();
  return useQuery<TransferRecipient[]>({
    queryKey: ["transfer-recipients", trimmed, department ?? "all"],
    queryFn: ({ signal }) => fetchTransferRecipients(trimmed, department, signal),
    enabled: trimmed.length >= 2,
    staleTime: 30 * 1000,
  });
}

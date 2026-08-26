// src/lib/historyApi.ts
//
// Admin read-only counterpart to the user panel's historyApi.ts. Same
// /api/history and /api/history/symbols endpoints, no accountId scoping
// required — admin can query across all accounts or filter to one.

export interface HistoryRow {
  id: number;
  accountId: number;
  slotId: string;
  batchId?: string | null;
  symbol: string;
  side: "BUY" | "SELL";
  eventType:
    | "entry_placed"
    | "queued"
    | "queued_activated"
    | "entry_filled"
    | "tp_placed"
    | "tp_filled"
    | "repunched"
    | "shifted"
    | "demoted"
    | "trimmed"
    | "rebalanced"
    | "stopped"
    | "resumed"
    | "removed_manual"
    | "ladder_reset";
  limitPrice?: number | null;
  tpPrice?: number | null;
  quantity?: number | null;
  repunchCountAtEvent: number;
  orderId?: string | null;
  note?: string | null;
  createdAt: string;
}

export interface HistoryQueryParams {
  accountId?: number;
  symbol?: string;
  side?: "BUY" | "SELL";
  eventType?: HistoryRow["eventType"];
  batchId?: string;
  slotId?: string;
  dateFrom?: string;
  dateTo?: string;
  minQty?: number;
  maxQty?: number;
  minRepunchCount?: number;
  maxRepunchCount?: number;
  search?: string;
  page?: number;
  pageSize?: number;
  sortBy?: "createdAt" | "quantity" | "repunchCountAtEvent" | "limitPrice";
  sortDir?: "asc" | "desc";
}

export interface HistoryResponse {
  rows: HistoryRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

function buildQuery(params: HistoryQueryParams): string {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      search.append(key, String(value));
    }
  });
  const qs = search.toString();
  return qs.length > 0 ? `?${qs}` : "";
}

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("ct_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function fetchHistory(params: HistoryQueryParams): Promise<HistoryResponse> {
  const res = await fetch(`/api/history${buildQuery(params)}`, {
    credentials: "include",
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`Failed to fetch history (${res.status})`);
  return res.json();
}

export async function fetchHistorySymbols(accountId?: number): Promise<string[]> {
  const qs = accountId != null ? `?accountId=${accountId}` : "";
  const res = await fetch(`/api/history/symbols${qs}`, {
    credentials: "include",
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`Failed to fetch history symbols (${res.status})`);
  const data = await res.json();
  return data.symbols ?? [];
}
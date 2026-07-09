import { useMemo, useState } from "react";
import { useRoute, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  useListAccounts,
  getClosedOrders,
  getTradeLogs,
  OrderWithAccount,
  TradeLog,
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Loader2, Search, X, Download, Filter } from "lucide-react";
import { TablePagination } from "@/components/TablePagination";

const PAGE_SIZE = 25;

const fmt = (v: string | number | null | undefined, decimals = 2) => {
  const n = typeof v === "string" ? parseFloat(v) : v;
  if (n === null || n === undefined || isNaN(n as number)) return "—";
  return (n as number).toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
};

const fmtDate = (v: string | number | null | undefined) => {
  if (!v) return "—";
  return new Date(v).toLocaleString();
};

/* ── Unified row type — union of Closed Orders + Trade Logs ── */
type Source = "ORDER" | "LOG";

interface MergedRow {
  key: string;
  source: Source;
  symbol: string;
  side: string;
  orderType: string;
  quantity: string | number;
  price: string | number | null;
  status: string;
  action: string;
  details: string;
  createdAt: number | string | null;
}

function fromOrder(o: OrderWithAccount): MergedRow {
  const price = o.avgExecutionPrice ?? o.price ?? null;
  const detailsParts: string[] = [];
  if (o.executionFee) detailsParts.push(`fee ${fmt(o.executionFee, 4)}`);
  if (o.realisedPnl) detailsParts.push(`PnL ${fmt(o.realisedPnl)}`);
  if (o.reduceOnly) detailsParts.push("reduce-only");
  return {
    key: `order-${o.orderId}`,
    source: "ORDER",
    symbol: o.symbol,
    side: o.side,
    orderType: o.orderType,
    quantity: o.execQuantity ?? o.quantity,
    price,
    status: o.status,
    action: `${o.side} ${o.orderType}`,
    details: detailsParts.length ? detailsParts.join(" · ") : "—",
    createdAt: o.createdAt ?? null,
  };
}

function fromLog(l: TradeLog): MergedRow {
  const detailsParts: string[] = [`via ${l.firedVia}`];
  if (l.errorMessage) detailsParts.push(l.errorMessage);
  return {
    key: `log-${l.id}`,
    source: "LOG",
    symbol: l.symbol,
    side: l.side,
    orderType: l.orderType,
    quantity: l.quantity ?? "—",
    price: l.price ?? null,
    status: l.status,
    action: `${l.side} ${l.orderType}`,
    details: detailsParts.join(" · "),
    createdAt: l.createdAt,
  };
}

/* ── Filters ── */
interface Filters {
  search: string;
  source: "ALL" | Source;
  side: "ALL" | "BUY" | "SELL";
  status: string; // "ALL" or a specific status value
  fromDate: string; // yyyy-mm-dd
  toDate: string;
}

const EMPTY_FILTERS: Filters = { search: "", source: "ALL", side: "ALL", status: "ALL", fromDate: "", toDate: "" };

/* ── CSV export ── */
function toCsv(rows: MergedRow[]): string {
  const headers = ["Source", "Symbol", "Side", "Type", "Quantity", "Price", "Status", "Action", "Details", "Closed At"];
  const esc = (v: unknown) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.source === "ORDER" ? "Closed Order" : "Trade Log",
        r.symbol,
        r.side,
        r.orderType,
        r.quantity,
        r.price ?? "",
        r.status,
        r.action,
        r.details,
        fmtDate(r.createdAt),
      ]
        .map(esc)
        .join(",")
    );
  }
  return lines.join("\n");
}

function downloadCsv(csv: string, filename: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function AccountDetailPage() {
  const [, params] = useRoute("/accounts/:id");
  const accountId = params?.id ? Number(params.id) : undefined;

  const { data: accounts } = useListAccounts();
  const account = accounts?.find((a) => a.id === accountId);

  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);

  /* ── Closed Orders — no pagination field on ClosedOrdersQuery, returns everything for the account ── */
  const { data: closedOrders = [], isFetching: ordersLoading } = useQuery({
    queryKey: ["closedOrders", accountId],
    queryFn: () => getClosedOrders({ accountIds: accountId != null ? [accountId] : undefined }),
    enabled: accountId != null,
  });

  /* ── Trade Logs — GetTradeLogsParams IS paginated (page field), so loop pages
     until we have the full set for this account. Capped at 50 pages as a safety
     net against an unexpected total. ── */
  const { data: tradeLogs = [], isFetching: logsLoading } = useQuery({
    queryKey: ["tradeLogsAll", accountId],
    queryFn: async () => {
      if (accountId == null) return [] as TradeLog[];
      let all: TradeLog[] = [];
      let pageNum = 1;
      while (pageNum <= 50) {
        const res = await getTradeLogs({ accountId, page: pageNum });
        all = all.concat(res.data);
        if (all.length >= res.total || res.data.length === 0) break;
        pageNum++;
      }
      return all;
    },
    enabled: accountId != null,
  });

  const isLoading = ordersLoading || logsLoading;

  /* ── Merge ── */
  const merged: MergedRow[] = useMemo(() => {
    const rows = [
      ...closedOrders.map(fromOrder),
      ...tradeLogs.map(fromLog),
    ];
    rows.sort((a, b) => {
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return tb - ta;
    });
    return rows;
  }, [closedOrders, tradeLogs]);

  /* ── Distinct statuses for the filter dropdown ── */
  const statusOptions = useMemo(() => {
    const set = new Set(merged.map((r) => r.status));
    return ["ALL", ...Array.from(set).sort()];
  }, [merged]);

  /* ── Apply filters ── */
  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    const from = filters.fromDate ? new Date(filters.fromDate).getTime() : null;
    const to = filters.toDate ? new Date(filters.toDate).getTime() + 86_400_000 : null; // inclusive end of day

    return merged.filter((r) => {
      if (q && !r.symbol.toLowerCase().includes(q) && !r.details.toLowerCase().includes(q)) return false;
      if (filters.source !== "ALL" && r.source !== filters.source) return false;
      if (filters.side !== "ALL" && r.side !== filters.side) return false;
      if (filters.status !== "ALL" && r.status !== filters.status) return false;
      if (from != null || to != null) {
        const t = r.createdAt ? new Date(r.createdAt).getTime() : null;
        if (t == null) return false;
        if (from != null && t < from) return false;
        if (to != null && t > to) return false;
      }
      return true;
    });
  }, [merged, filters]);

  const activeFilterCount =
    (filters.search ? 1 : 0) +
    (filters.source !== "ALL" ? 1 : 0) +
    (filters.side !== "ALL" ? 1 : 0) +
    (filters.status !== "ALL" ? 1 : 0) +
    (filters.fromDate ? 1 : 0) +
    (filters.toDate ? 1 : 0);

  const clearFilters = () => {
    setFilters(EMPTY_FILTERS);
    setPage(1);
  };

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleExportCsv = () => {
    const csv = toCsv(filtered);
    const filenameSafe = (account?.name ?? "account").replace(/[^a-z0-9]+/gi, "_").toLowerCase();
    downloadCsv(csv, `${filenameSafe}-trade-history-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  if (!account) {
    return (
      <div className="p-8">
        <Link href="/accounts">
          <a className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 mb-4">
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Accounts
          </a>
        </Link>
        <p className="text-muted-foreground">Loading account…</p>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      <div>
        <Link href="/accounts">
          <a className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 mb-3">
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Accounts
          </a>
        </Link>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-foreground">{account.name}</h1>
          <Badge variant={account.isActive ? "default" : "secondary"}>
            {account.isActive ? "Active" : "Disabled"}
          </Badge>
        </div>
        <p className="text-muted-foreground">{account.mobileNumber}</p>
      </div>

      {/* Search + Filters */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={filters.search}
                onChange={(e) => { setFilters((f) => ({ ...f, search: e.target.value })); setPage(1); }}
                placeholder="Search symbol or details…"
                className="pl-8"
              />
            </div>

            <Select value={filters.source} onValueChange={(v) => { setFilters((f) => ({ ...f, source: v as Filters["source"] })); setPage(1); }}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Source" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Sources</SelectItem>
                <SelectItem value="ORDER">Closed Orders</SelectItem>
                <SelectItem value="LOG">Trade Logs</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filters.side} onValueChange={(v) => { setFilters((f) => ({ ...f, side: v as Filters["side"] })); setPage(1); }}>
              <SelectTrigger className="w-[130px]">
                <SelectValue placeholder="Side" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Sides</SelectItem>
                <SelectItem value="BUY">Buy</SelectItem>
                <SelectItem value="SELL">Sell</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filters.status} onValueChange={(v) => { setFilters((f) => ({ ...f, status: v })); setPage(1); }}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                {statusOptions.map((s) => (
                  <SelectItem key={s} value={s}>{s === "ALL" ? "All Statuses" : s}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex items-center gap-1.5">
              <Input
                type="date"
                value={filters.fromDate}
                onChange={(e) => { setFilters((f) => ({ ...f, fromDate: e.target.value })); setPage(1); }}
                className="w-[150px]"
              />
              <span className="text-xs text-muted-foreground">to</span>
              <Input
                type="date"
                value={filters.toDate}
                onChange={(e) => { setFilters((f) => ({ ...f, toDate: e.target.value })); setPage(1); }}
                className="w-[150px]"
              />
            </div>

            {activeFilterCount > 0 && (
              <button
                onClick={clearFilters}
                className="flex items-center gap-1 px-2 py-1.5 rounded-md text-xs font-semibold"
                style={{ color: "hsl(345 88% 62%)", border: "1px solid hsl(345 88% 58% / 0.3)", background: "hsl(345 88% 58% / 0.07)" }}
              >
                <X className="h-3 w-3" /> Clear ({activeFilterCount})
              </button>
            )}

            <button
              onClick={handleExportCsv}
              disabled={filtered.length === 0}
              className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold disabled:opacity-40"
              style={{ background: "hsl(var(--primary))", color: "#fff" }}
            >
              <Download className="h-3.5 w-3.5" /> Download CSV
            </button>
          </div>

          <p className="text-xs text-muted-foreground">
            {filtered.length === merged.length
              ? `${merged.length} total`
              : <><span className="font-semibold text-foreground">{filtered.length}</span> of {merged.length}</>}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                {["Source", "Symbol", "Side", "Type", "Qty", "Price", "Status", "Action", "Details", "Closed At"].map((h) => (
                  <TableHead key={h}>{h}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> Loading…
                  </TableCell>
                </TableRow>
              ) : paged.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-12 text-muted-foreground">
                    {merged.length === 0 ? (
                      "No trade history for this account."
                    ) : (
                      <div className="flex flex-col items-center gap-2">
                        <Filter className="w-5 h-5 opacity-30" />
                        <span>No rows match your filters.</span>
                        <button onClick={clearFilters} className="text-xs font-semibold underline underline-offset-2" style={{ color: "hsl(var(--primary))" }}>
                          Clear filters
                        </button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ) : (
                paged.map((r) => (
                  <TableRow key={r.key}>
                    <TableCell>
                      <Badge variant={r.source === "ORDER" ? "default" : "secondary"} className="text-[10px]">
                        {r.source === "ORDER" ? "Order" : "Log"}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono font-bold">{r.symbol}</TableCell>
                    <TableCell>
                      <span className={`text-xs font-bold ${r.side === "BUY" ? "text-[hsl(162_88%_42%)]" : "text-[hsl(345_88%_58%)]"}`}>
                        {r.side}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{r.orderType}</TableCell>
                    <TableCell className="font-mono">{fmt(r.quantity, 4)}</TableCell>
                    <TableCell className="font-mono">{r.price != null ? fmt(r.price) : "—"}</TableCell>
                    <TableCell>{r.status}</TableCell>
                    <TableCell className="text-sm">{r.action}</TableCell>
                    <TableCell className="text-muted-foreground text-sm max-w-xs truncate" title={r.details}>{r.details}</TableCell>
                    <TableCell className="text-muted-foreground">{fmtDate(r.createdAt)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          <TablePagination
            currentPage={page}
            totalPages={totalPages}
            onPageChange={setPage}
            itemsPerPage={PAGE_SIZE}
            totalItems={filtered.length}
          />
        </CardContent>
      </Card>
    </div>
  );
}
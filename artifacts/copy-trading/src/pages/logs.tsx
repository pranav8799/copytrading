import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useGetTradeLogs, useListAccounts, useGetBalances } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TablePagination } from "@/components/TablePagination";

const SYS_PAGE_SIZE = 20;
const TRADE_PAGE_SIZE = 20;

type SystemLog = {
  id: number;
  level: "info" | "warn" | "error";
  message: string;
  context: Record<string, any> | string | null;
  createdAt: string;
};

// NOTE: TradeLog.leverage does not exist on the backend yet. The trade_logs
// table / insert in trade.ts needs a `leverage` column added (see chat) for
// this field to populate. Until then it will render as "—" for every row.
type TradeLog = {
  id: number;
  createdAt: string;
  accountId?: number;
  accountName: string;
  symbol: string;
  side: "BUY" | "SELL";
  orderType: string;
  quantity: string | number | null;
  price?: string | number | null;
  leverage?: string | number | null;
  status: string;
  firedVia: string;
  errorMessage?: string | null;
};

const levelColors: Record<string, string> = {
  info: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  warn: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  error: "bg-red-500/10 text-red-400 border-red-500/20",
};

const levelDot: Record<string, string> = {
  info: "bg-blue-400",
  warn: "bg-yellow-400",
  error: "bg-red-400",
};

function parseContext(ctx: SystemLog["context"]): Record<string, any> | null {
  if (!ctx) return null;
  if (typeof ctx === "object") return ctx;
  if (typeof ctx === "string") {
    try {
      const parsed = JSON.parse(ctx);
      return typeof parsed === "object" && parsed !== null ? parsed : { value: parsed };
    } catch {
      return { message: ctx };
    }
  }
  return null;
}

function stringifyValue(v: any): string {
  if (v == null) return "—";
  if (typeof v === "object") {
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  }
  return String(v);
}

function formatContext(ctx: SystemLog["context"]): string {
  const parsed = parseContext(ctx);
  if (!parsed) return "—";
  const entries = Object.entries(parsed);
  if (entries.length === 0) return "—";
  return entries.map(([k, v]) => `${k}: ${stringifyValue(v)}`).join(" · ");
}

const fmtNum = (v: string | number | null | undefined, decimals = 2) => {
  if (v == null) return "—";
  const n = typeof v === "string" ? parseFloat(v) : v;
  if (isNaN(n)) return "—";
  return n.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
};

const calcMargin = (
  quantity: string | number | null | undefined,
  price: string | number | null | undefined,
  leverage: string | number | null | undefined
): number | null => {
  const q = typeof quantity === "string" ? parseFloat(quantity) : quantity;
  const p = typeof price === "string" ? parseFloat(price) : price;
  const lev = typeof leverage === "string" ? parseFloat(leverage) : leverage;
  if (q == null || p == null || lev == null) return null;
  if (isNaN(q) || isNaN(p) || isNaN(lev) || !p || !lev) return null;
  return (q * p) / lev;
};

const calcNotional = (
  quantity: string | number | null | undefined,
  price: string | number | null | undefined
): number | null => {
  const q = typeof quantity === "string" ? parseFloat(quantity) : quantity;
  const p = typeof price === "string" ? parseFloat(price) : price;
  if (q == null || p == null || isNaN(q) || isNaN(p)) return null;
  return q * p;
};

export function LogsPage() {
  /* ════════════════════════════════════════════════════════════════════
     ACTIVITY (SYSTEM) LOGS
  ════════════════════════════════════════════════════════════════════ */
  const [level, setLevel] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");
  const [applied, setApplied] = useState({ level: "all", from: "", to: "", search: "" });
  const [sysPage, setSysPage] = useState(1);

  const { data: sysLogs, isLoading: sysLoading, refetch, isFetching } = useQuery<SystemLog[]>({
    queryKey: ["/api/logs/system", applied],
    queryFn: async () => {
      const token = localStorage.getItem("ct_token");
      const params = new URLSearchParams();
      if (applied.level !== "all") params.set("level", applied.level);
      if (applied.from) params.set("from", applied.from);
      if (applied.to) params.set("to", applied.to);
      if (applied.search) params.set("search", applied.search);
      const res = await fetch(`/api/logs/system?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch logs");
      const json = await res.json();
      return json.data as SystemLog[];
    },
  });

  const handleApply = () => {
    setApplied({ level, from, to, search });
    setSysPage(1); // reset to first page on new filter
  };
  const handleReset = () => {
    setLevel("all");
    setFrom("");
    setTo("");
    setSearch("");
    setApplied({ level: "all", from: "", to: "", search: "" });
    setSysPage(1);
  };

  const sysCounts = {
    total: sysLogs?.length ?? 0,
    info: sysLogs?.filter((l) => l.level === "info").length ?? 0,
    warn: sysLogs?.filter((l) => l.level === "warn").length ?? 0,
    error: sysLogs?.filter((l) => l.level === "error").length ?? 0,
  };

  const totalSysPages = Math.max(1, Math.ceil((sysLogs?.length ?? 0) / SYS_PAGE_SIZE));
  const pagedSysLogs = (sysLogs ?? []).slice(
    (sysPage - 1) * SYS_PAGE_SIZE,
    sysPage * SYS_PAGE_SIZE
  );

  /* ════════════════════════════════════════════════════════════════════
     TRADE LOGS
  ════════════════════════════════════════════════════════════════════ */
  const { data: tradeLogsResp } = useGetTradeLogs({});
  const { data: accounts } = useListAccounts();
  const { data: balances } = useGetBalances();

  const allTradeLogs = (tradeLogsResp?.data ?? []) as TradeLog[];

  const [tlAccount, setTlAccount] = useState("all");
  const [tlSymbol, setTlSymbol] = useState("all");
  const [tlSide, setTlSide] = useState("all");
  const [tlStatus, setTlStatus] = useState("all");
  const [tlFrom, setTlFrom] = useState("");
  const [tlTo, setTlTo] = useState("");
  const [tlSearch, setTlSearch] = useState("");
  const [tradePage, setTradePage] = useState(1);

  const accountOptions = useMemo(() => {
    const names = new Set<string>();
    allTradeLogs.forEach((l) => l.accountName && names.add(l.accountName));
    return Array.from(names).sort();
  }, [allTradeLogs]);

  const symbolOptions = useMemo(() => {
    const syms = new Set<string>();
    allTradeLogs.forEach((l) => l.symbol && syms.add(l.symbol));
    return Array.from(syms).sort();
  }, [allTradeLogs]);

  const statusOptions = useMemo(() => {
    const statuses = new Set<string>();
    allTradeLogs.forEach((l) => l.status && statuses.add(l.status));
    return Array.from(statuses).sort();
  }, [allTradeLogs]);

  const filteredTradeLogs = useMemo(() => {
    return allTradeLogs.filter((log) => {
      if (tlAccount !== "all" && log.accountName !== tlAccount) return false;
      if (tlSymbol !== "all" && log.symbol !== tlSymbol) return false;
      if (tlSide !== "all" && log.side !== tlSide) return false;
      if (tlStatus !== "all" && log.status !== tlStatus) return false;

      if (tlFrom) {
        const fromMs = new Date(tlFrom).getTime();
        if (new Date(log.createdAt).getTime() < fromMs) return false;
      }
      if (tlTo) {
        const toMs = new Date(tlTo).getTime() + 24 * 60 * 60 * 1000 - 1;
        if (new Date(log.createdAt).getTime() > toMs) return false;
      }
      if (tlSearch) {
        const q = tlSearch.toLowerCase();
        const haystack = `${log.accountName} ${log.symbol} ${log.side} ${log.orderType} ${log.status} ${log.errorMessage ?? ""}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [allTradeLogs, tlAccount, tlSymbol, tlSide, tlStatus, tlFrom, tlTo, tlSearch]);

  const handleTlReset = () => {
    setTlAccount("all");
    setTlSymbol("all");
    setTlSide("all");
    setTlStatus("all");
    setTlFrom("");
    setTlTo("");
    setTlSearch("");
    setTradePage(1);
  };

  // Reset trade page when filters change
  const handleTradeFilterChange = (setter: (v: string) => void) => (v: string) => {
    setter(v);
    setTradePage(1);
  };

  const getRawBalance = (accountId: number | undefined): number | null => {
    if (accountId == null) return null;
    const live = (balances as Array<{ accountId: number; balance: number }> | undefined)?.find(
      (b) => b.accountId === accountId
    )?.balance;
    if (live != null && !isNaN(live)) return live;

    const fallback = (accounts as Array<{ id: number; currentBalance?: string | null }> | undefined)?.find(
      (a) => a.id === accountId
    )?.currentBalance;
    if (fallback != null) {
      const n = parseFloat(fallback);
      if (!isNaN(n)) return n;
    }
    return null;
  };

  const tlCounts = {
    total: filteredTradeLogs.length,
    executed: filteredTradeLogs.filter((l) => l.status === "EXECUTED" || l.status === "RAISED").length,
    failed: filteredTradeLogs.filter((l) => l.status === "FAILED").length,
  };

  const totalTradePages = Math.max(1, Math.ceil(filteredTradeLogs.length / TRADE_PAGE_SIZE));
  const pagedTradeLogs = filteredTradeLogs.slice(
    (tradePage - 1) * TRADE_PAGE_SIZE,
    tradePage * TRADE_PAGE_SIZE
  );

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Logs</h1>
        <p className="text-muted-foreground text-sm">Full audit trail of every action in the system.</p>
      </div>

      <Card>
        <CardContent className="p-0">
          <Tabs defaultValue="activity" className="w-full">
            <div className="p-4 border-b border-border">
              <TabsList>
                <TabsTrigger value="activity">Activity Logs</TabsTrigger>
                <TabsTrigger value="trade">Trade Logs</TabsTrigger>
              </TabsList>
            </div>

            {/* ══════════════════════════════════════════════════════════
                ACTIVITY / SYSTEM LOGS
            ══════════════════════════════════════════════════════════ */}
            <TabsContent value="activity" className="m-0">
              <div className="p-4 space-y-4">
                {/* Summary cards */}
                <div className="grid grid-cols-4 gap-3">
                  {[
                    { label: "Total", value: sysCounts.total, color: "text-foreground" },
                    { label: "Info", value: sysCounts.info, color: "text-blue-400" },
                    { label: "Warn", value: sysCounts.warn, color: "text-yellow-400" },
                    { label: "Error", value: sysCounts.error, color: "text-red-400" },
                  ].map((s) => (
                    <Card key={s.label}>
                      <CardContent className="pt-4 pb-3">
                        <p className="text-xs text-muted-foreground uppercase tracking-wide">{s.label}</p>
                        <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* Filters */}
                <div className="flex flex-wrap items-end gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Level</Label>
                    <Select value={level} onValueChange={setLevel}>
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        <SelectItem value="info">Info</SelectItem>
                        <SelectItem value="warn">Warn</SelectItem>
                        <SelectItem value="error">Error</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">From date</Label>
                    <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">To date</Label>
                    <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
                  </div>
                  <div className="space-y-1 flex-1 min-w-48">
                    <Label className="text-xs">Search</Label>
                    <Input
                      placeholder="e.g. Account created, login..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleApply()}
                    />
                  </div>
                  <Button onClick={handleApply}>Apply</Button>
                  <Button variant="outline" onClick={handleReset}>
                    Reset
                  </Button>
                  <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
                    {isFetching ? "Refreshing..." : "Refresh"}
                  </Button>
                </div>
              </div>

              {/* Table */}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-44">Time</TableHead>
                    <TableHead className="w-24">Level</TableHead>
                    <TableHead className="w-60">Action</TableHead>
                    <TableHead>Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sysLoading ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-12 text-muted-foreground">
                        Loading...
                      </TableCell>
                    </TableRow>
                  ) : !sysLogs?.length ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-12 text-muted-foreground">
                        No activity logs found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    pagedSysLogs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="text-xs text-muted-foreground font-mono whitespace-nowrap">
                          {new Date(log.createdAt).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`gap-1.5 ${levelColors[log.level]}`}>
                            <span className={`w-1.5 h-1.5 rounded-full inline-block ${levelDot[log.level]}`} />
                            {log.level}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-medium text-sm">{log.message}</TableCell>
                        <TableCell className="text-xs text-muted-foreground font-mono">
                          {formatContext(log.context)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>

              <TablePagination
                currentPage={sysPage}
                totalPages={totalSysPages}
                onPageChange={setSysPage}
                itemsPerPage={SYS_PAGE_SIZE}
                totalItems={sysLogs?.length ?? 0}
              />

              <div className="px-4 py-2 text-xs text-muted-foreground border-t border-border">
                Fetching up to 200 most recent entries from the server.
              </div>
            </TabsContent>

            {/* ══════════════════════════════════════════════════════════
                TRADE LOGS
            ══════════════════════════════════════════════════════════ */}
            <TabsContent value="trade" className="m-0">
              <div className="p-4 space-y-4">
                {/* Summary cards */}
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "Total", value: tlCounts.total, color: "text-foreground" },
                    { label: "Executed / Raised", value: tlCounts.executed, color: "text-green-400" },
                    { label: "Failed", value: tlCounts.failed, color: "text-red-400" },
                  ].map((s) => (
                    <Card key={s.label}>
                      <CardContent className="pt-4 pb-3">
                        <p className="text-xs text-muted-foreground uppercase tracking-wide">{s.label}</p>
                        <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* Filters */}
                <div className="flex flex-wrap items-end gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Account</Label>
                    <Select value={tlAccount} onValueChange={handleTradeFilterChange(setTlAccount)}>
                      <SelectTrigger className="w-36">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        {accountOptions.map((a) => (
                          <SelectItem key={a} value={a}>{a}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Symbol</Label>
                    <Select value={tlSymbol} onValueChange={handleTradeFilterChange(setTlSymbol)}>
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        {symbolOptions.map((s) => (
                          <SelectItem key={s} value={s}>{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Side</Label>
                    <Select value={tlSide} onValueChange={handleTradeFilterChange(setTlSide)}>
                      <SelectTrigger className="w-28">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        <SelectItem value="BUY">Buy</SelectItem>
                        <SelectItem value="SELL">Sell</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Status</Label>
                    <Select value={tlStatus} onValueChange={handleTradeFilterChange(setTlStatus)}>
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        {statusOptions.map((s) => (
                          <SelectItem key={s} value={s}>{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">From date</Label>
                    <Input
                      type="date"
                      value={tlFrom}
                      onChange={(e) => { setTlFrom(e.target.value); setTradePage(1); }}
                      className="w-40"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">To date</Label>
                    <Input
                      type="date"
                      value={tlTo}
                      onChange={(e) => { setTlTo(e.target.value); setTradePage(1); }}
                      className="w-40"
                    />
                  </div>
                  <div className="space-y-1 flex-1 min-w-48">
                    <Label className="text-xs">Search</Label>
                    <Input
                      placeholder="Search account, symbol, error..."
                      value={tlSearch}
                      onChange={(e) => { setTlSearch(e.target.value); setTradePage(1); }}
                    />
                  </div>
                  <Button variant="outline" onClick={handleTlReset}>
                    Reset
                  </Button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="whitespace-nowrap">Time</TableHead>
                      <TableHead>Account</TableHead>
                      <TableHead>Symbol</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Qty</TableHead>
                      <TableHead>Price</TableHead>
                      <TableHead>Position Value</TableHead>
                      <TableHead>Leverage</TableHead>
                      <TableHead>Margin Req.</TableHead>
                      <TableHead>Remaining Bal.</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Error</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pagedTradeLogs.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={13} className="text-center py-12 text-muted-foreground">
                          {allTradeLogs.length === 0 ? "No trade logs." : "No trade logs match these filters."}
                        </TableCell>
                      </TableRow>
                    ) : (
                      pagedTradeLogs.map((log) => {
                        const notional = calcNotional(log.quantity, log.price);
                        const margin = calcMargin(log.quantity, log.price, log.leverage);
                        const rawBalance = getRawBalance(log.accountId);
                        const remaining = margin != null && rawBalance != null ? rawBalance - margin : null;

                        return (
                          <TableRow key={log.id}>
                            <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                              {new Date(log.createdAt).toLocaleString()}
                            </TableCell>
                            <TableCell className="text-sm">{log.accountName}</TableCell>
                            <TableCell className="font-bold text-sm">{log.symbol}</TableCell>
                            <TableCell>
                              <span className={log.side === "BUY" ? "text-green-400" : "text-red-400"}>
                                {log.side} {log.orderType}
                              </span>
                            </TableCell>
                            <TableCell className="font-mono text-sm">{fmtNum(log.quantity, 4)}</TableCell>
                            <TableCell className="font-mono text-sm">{log.price ? fmtNum(log.price) : "—"}</TableCell>
                            <TableCell className="font-mono text-sm text-muted-foreground">
                              {notional != null ? `${fmtNum(notional)} USDT` : "—"}
                            </TableCell>
                            <TableCell className="font-mono text-sm text-muted-foreground">
                              {log.leverage != null ? `${fmtNum(log.leverage, 0)}×` : "—"}
                            </TableCell>
                            <TableCell className="font-mono text-sm text-muted-foreground">
                              {margin != null ? `${fmtNum(margin)} USDT` : "—"}
                            </TableCell>
                            <TableCell
                              className={`font-mono text-sm ${
                                remaining != null && remaining < 0 ? "text-red-400" : "text-muted-foreground"
                              }`}
                            >
                              {remaining != null ? `${fmtNum(remaining)} USDT` : "—"}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  log.status === "EXECUTED" || log.status === "RAISED"
                                    ? "default"
                                    : log.status === "FAILED"
                                    ? "destructive"
                                    : "outline"
                                }
                              >
                                {log.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">{log.firedVia}</TableCell>
                            <TableCell className="text-xs text-red-400 max-w-[200px] truncate" title={log.errorMessage ?? undefined}>
                              {log.errorMessage ?? "—"}
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>

              <TablePagination
                currentPage={tradePage}
                totalPages={totalTradePages}
                onPageChange={setTradePage}
                itemsPerPage={TRADE_PAGE_SIZE}
                totalItems={filteredTradeLogs.length}
              />

              <div className="px-4 py-2 text-xs text-muted-foreground border-t border-border">
                Showing {filteredTradeLogs.length} of {allTradeLogs.length} trade log entr
                {allTradeLogs.length === 1 ? "y" : "ies"}. Margin Req. / Remaining Bal. use each
                trade's recorded leverage and the account's <em>current</em> balance — remaining
                balance reflects today's balance, not the balance at the time of the trade.
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
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
import {
  ScrollText,
  Activity,
  ListChecks,
  Search,
  X,
  RefreshCw,
  Info,
  AlertTriangle,
  AlertCircle,
  ArrowUpRight,
  ArrowDownRight,
  Phone,
  Filter,
} from "lucide-react";

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

const levelConfig: Record<string, { badge: string; dot: string; icon: typeof Info; iconColor: string }> = {
  info: { badge: "bg-blue-500/10 text-blue-400 border-blue-500/20", dot: "bg-blue-400", icon: Info, iconColor: "hsl(217 91% 60%)" },
  warn: { badge: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20", dot: "bg-yellow-400", icon: AlertTriangle, iconColor: "hsl(38 92% 50%)" },
  error: { badge: "bg-red-500/10 text-red-400 border-red-500/20", dot: "bg-red-400", icon: AlertCircle, iconColor: "hsl(345 88% 58%)" },
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

/* ── shared little components for a more polished look ── */
function StatCard({ label, value, color, icon: Icon }: { label: string; value: number; color: string; icon: typeof Info }) {
  return (
    <Card className="border-border/60">
      <CardContent className="p-4 flex items-center justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold mt-1" style={{ color }}>{value}</p>
        </div>
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: `${color}1f` }}
        >
          <Icon className="w-4 h-4" style={{ color }} />
        </div>
      </CardContent>
    </Card>
  );
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

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

  const sysActiveFilters =
    (level !== "all" ? 1 : 0) + (from ? 1 : 0) + (to ? 1 : 0) + (search ? 1 : 0);

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

  const getMobileNumber = (accountId: number | undefined, accountName?: string): string => {
    const list = (accounts ?? []) as Array<{ id: number; name: string; mobileNumber?: string }>;
    const byId = accountId != null ? list.find((a) => a.id === accountId) : undefined;
    const byName = !byId && accountName ? list.find((a) => a.name === accountName) : undefined;
    return (byId ?? byName)?.mobileNumber ?? "—";
  };

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
        const phone = getMobileNumber(log.accountId, log.accountName).toLowerCase();
        const haystack = `${log.accountName} ${phone} ${log.symbol} ${log.side} ${log.orderType} ${log.status} ${log.errorMessage ?? ""}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allTradeLogs, tlAccount, tlSymbol, tlSide, tlStatus, tlFrom, tlTo, tlSearch, accounts]);

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

  const tlActiveFilters =
    (tlAccount !== "all" ? 1 : 0) +
    (tlSymbol !== "all" ? 1 : 0) +
    (tlSide !== "all" ? 1 : 0) +
    (tlStatus !== "all" ? 1 : 0) +
    (tlFrom ? 1 : 0) +
    (tlTo ? 1 : 0) +
    (tlSearch ? 1 : 0);

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
      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: "hsl(258 82% 64% / 0.12)" }}
        >
          <ScrollText className="w-5 h-5" style={{ color: "hsl(258 82% 64%)" }} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Logs</h1>
          <p className="text-muted-foreground text-sm">Full audit trail of every action in the system.</p>
        </div>
      </div>

      <Card className="border-border/60 overflow-hidden">
        <CardContent className="p-0">
          <Tabs defaultValue="activity" className="w-full">
            <div className="px-4 pt-4 pb-0" style={{ borderBottom: "1px solid hsl(var(--border))" }}>
              <TabsList>
                <TabsTrigger value="activity" className="gap-1.5">
                  <Activity className="w-3.5 h-3.5" /> Activity Logs
                </TabsTrigger>
                <TabsTrigger value="trade" className="gap-1.5">
                  <ListChecks className="w-3.5 h-3.5" /> Trade Logs
                </TabsTrigger>
              </TabsList>
            </div>

            {/* ══════════════════════════════════════════════════════════
                ACTIVITY / SYSTEM LOGS
            ══════════════════════════════════════════════════════════ */}
            <TabsContent value="activity" className="m-0">
              <div className="p-4 space-y-4">
                {/* Summary cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <StatCard label="Total" value={sysCounts.total} color="hsl(var(--foreground))" icon={ScrollText} />
                  <StatCard label="Info" value={sysCounts.info} color="hsl(217 91% 60%)" icon={Info} />
                  <StatCard label="Warn" value={sysCounts.warn} color="hsl(38 92% 50%)" icon={AlertTriangle} />
                  <StatCard label="Error" value={sysCounts.error} color="hsl(345 88% 58%)" icon={AlertCircle} />
                </div>

                {/* Filters */}
                <div
                  className="rounded-xl p-3"
                  style={{ background: "hsl(var(--muted) / 0.4)", border: "1px solid hsl(var(--border))" }}
                >
                  <div className="flex items-center gap-1.5 mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <Filter className="w-3 h-3" /> Filters
                    {sysActiveFilters > 0 && (
                      <span
                        className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold"
                        style={{ background: "hsl(258 82% 64% / 0.15)", color: "hsl(258 82% 64%)" }}
                      >
                        {sysActiveFilters} active
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-end gap-3">
                    <FilterField label="Level">
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
                    </FilterField>
                    <FilterField label="From date">
                      <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
                    </FilterField>
                    <FilterField label="To date">
                      <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
                    </FilterField>
                    <div className="flex-1 min-w-48">
                      <FilterField label="Search">
                        <div className="relative">
                          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                          <Input
                            placeholder="e.g. Account created, login..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && handleApply()}
                            className="pl-8"
                          />
                        </div>
                      </FilterField>
                    </div>
                    <Button onClick={handleApply} className="gap-1.5">
                      <Search className="w-3.5 h-3.5" /> Apply
                    </Button>
                    {sysActiveFilters > 0 && (
                      <Button variant="outline" onClick={handleReset} className="gap-1.5">
                        <X className="w-3.5 h-3.5" /> Reset
                      </Button>
                    )}
                    <Button variant="outline" onClick={() => refetch()} disabled={isFetching} className="gap-1.5">
                      <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
                      {isFetching ? "Refreshing…" : "Refresh"}
                    </Button>
                  </div>
                </div>
              </div>

              {/* Table */}
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-44 pl-6">Time</TableHead>
                      <TableHead className="w-24">Level</TableHead>
                      <TableHead className="w-60">Action</TableHead>
                      <TableHead className="pr-6">Details</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sysLoading ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-16 text-muted-foreground">
                          Loading...
                        </TableCell>
                      </TableRow>
                    ) : !sysLogs?.length ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-16 text-muted-foreground">
                          No activity logs found.
                        </TableCell>
                      </TableRow>
                    ) : (
                      pagedSysLogs.map((log, idx) => {
                        const cfg = levelConfig[log.level] ?? levelConfig.info;
                        const Icon = cfg.icon;
                        return (
                          <TableRow
                            key={log.id}
                            className="hover:bg-muted/30 transition-colors"
                            style={{ background: idx % 2 === 0 ? "transparent" : "hsl(var(--muted) / 0.15)" }}
                          >
                            <TableCell className="text-xs text-muted-foreground font-mono whitespace-nowrap pl-6">
                              {new Date(log.createdAt).toLocaleString()}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className={`gap-1.5 ${cfg.badge}`}>
                                <Icon className="w-3 h-3" style={{ color: cfg.iconColor }} />
                                {log.level}
                              </Badge>
                            </TableCell>
                            <TableCell className="font-medium text-sm">{log.message}</TableCell>
                            <TableCell className="text-xs text-muted-foreground font-mono pr-6">
                              {formatContext(log.context)}
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>

              <TablePagination
                currentPage={sysPage}
                totalPages={totalSysPages}
                onPageChange={setSysPage}
                itemsPerPage={SYS_PAGE_SIZE}
                totalItems={sysLogs?.length ?? 0}
              />

              <div className="px-6 py-3 text-xs text-muted-foreground" style={{ borderTop: "1px solid hsl(var(--border))" }}>
                Fetching up to 200 most recent entries from the server.
              </div>
            </TabsContent>

            {/* ══════════════════════════════════════════════════════════
                TRADE LOGS
            ══════════════════════════════════════════════════════════ */}
            <TabsContent value="trade" className="m-0">
              <div className="p-4 space-y-4">
                {/* Summary cards */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <StatCard label="Total" value={tlCounts.total} color="hsl(var(--foreground))" icon={ListChecks} />
                  <StatCard label="Executed / Raised" value={tlCounts.executed} color="hsl(162 88% 42%)" icon={ArrowUpRight} />
                  <StatCard label="Failed" value={tlCounts.failed} color="hsl(345 88% 58%)" icon={ArrowDownRight} />
                </div>

                {/* Filters */}
                <div
                  className="rounded-xl p-3"
                  style={{ background: "hsl(var(--muted) / 0.4)", border: "1px solid hsl(var(--border))" }}
                >
                  <div className="flex items-center gap-1.5 mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <Filter className="w-3 h-3" /> Filters
                    {tlActiveFilters > 0 && (
                      <span
                        className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold"
                        style={{ background: "hsl(258 82% 64% / 0.15)", color: "hsl(258 82% 64%)" }}
                      >
                        {tlActiveFilters} active
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-end gap-3">
                    <FilterField label="Account">
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
                    </FilterField>
                    <FilterField label="Symbol">
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
                    </FilterField>
                    <FilterField label="Side">
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
                    </FilterField>
                    <FilterField label="Status">
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
                    </FilterField>
                    <FilterField label="From date">
                      <Input
                        type="date"
                        value={tlFrom}
                        onChange={(e) => { setTlFrom(e.target.value); setTradePage(1); }}
                        className="w-40"
                      />
                    </FilterField>
                    <FilterField label="To date">
                      <Input
                        type="date"
                        value={tlTo}
                        onChange={(e) => { setTlTo(e.target.value); setTradePage(1); }}
                        className="w-40"
                      />
                    </FilterField>
                    <div className="flex-1 min-w-56">
                      <FilterField label="Search">
                        <div className="relative">
                          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                          <Input
                            placeholder="Search account, phone, symbol, error..."
                            value={tlSearch}
                            onChange={(e) => { setTlSearch(e.target.value); setTradePage(1); }}
                            className="pl-8"
                          />
                        </div>
                      </FilterField>
                    </div>
                    {tlActiveFilters > 0 && (
                      <Button variant="outline" onClick={handleTlReset} className="gap-1.5">
                        <X className="w-3.5 h-3.5" /> Reset
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="whitespace-nowrap pl-6">Time</TableHead>
                      <TableHead>Account</TableHead>
                      <TableHead className="gap-1">
                        <span className="inline-flex items-center gap-1">
                          <Phone className="w-3 h-3" /> Phone
                        </span>
                      </TableHead>
                      <TableHead>Symbol</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Qty</TableHead>
                      <TableHead>Price</TableHead>
                      <TableHead>Position Value</TableHead>
                      <TableHead>Leverage</TableHead>
                      <TableHead>Margin Req.</TableHead>
                      <TableHead>Remaining Bal.</TableHead>
                      <TableHead>Status</TableHead>
                      {/* <TableHead>Source</TableHead> */}
                      <TableHead className="pr-6">Error</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pagedTradeLogs.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={14} className="text-center py-16 text-muted-foreground">
                          {allTradeLogs.length === 0 ? "No trade logs." : "No trade logs match these filters."}
                        </TableCell>
                      </TableRow>
                    ) : (
                      pagedTradeLogs.map((log, idx) => {
                        const notional = calcNotional(log.quantity, log.price);
                        const margin = calcMargin(log.quantity, log.price, log.leverage);
                        const rawBalance = getRawBalance(log.accountId);
                        const remaining = margin != null && rawBalance != null ? rawBalance - margin : null;
                        const isBuy = log.side === "BUY";

                        return (
                          <TableRow
                            key={log.id}
                            className="hover:bg-muted/30 transition-colors"
                            style={{ background: idx % 2 === 0 ? "transparent" : "hsl(var(--muted) / 0.15)" }}
                          >
                            <TableCell className="whitespace-nowrap text-xs text-muted-foreground pl-6">
                              {new Date(log.createdAt).toLocaleString()}
                            </TableCell>
                            <TableCell className="text-sm font-medium">{log.accountName}</TableCell>
                            <TableCell className="text-xs font-mono text-muted-foreground whitespace-nowrap">
                              {getMobileNumber(log.accountId, log.accountName)}
                            </TableCell>
                            <TableCell className="font-bold text-sm">{log.symbol}</TableCell>
                            <TableCell>
                              <span
                                className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full"
                                style={
                                  isBuy
                                    ? { background: "hsl(162 88% 42% / 0.12)", color: "hsl(162 88% 42%)" }
                                    : { background: "hsl(345 88% 58% / 0.12)", color: "hsl(345 88% 58%)" }
                                }
                              >
                                {isBuy ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
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
                            {/* <TableCell className="text-xs text-muted-foreground">{log.firedVia}</TableCell> */}
                            <TableCell className="text-xs text-red-400 max-w-[200px] truncate pr-6" title={log.errorMessage ?? undefined}>
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

              <div className="px-6 py-3 text-xs text-muted-foreground" style={{ borderTop: "1px solid hsl(var(--border))" }}>
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
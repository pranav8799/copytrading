import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useListAccounts,
  useGetBalances,
  useGetSettings,
  useGetPositions,
  useSetTpsl,
  useSetLeverage,
  useCancelOrder,
  useCancelAllOrders,
  useUpdateSettings,
  getOpenOrders,
  executeTrade,
  getGetPositionsQueryKey,
  OrderPayloadSide,
  OrderPayloadOrderType,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  RefreshCw,
  Plus,
  Trash2,
  X,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Zap,
  Pencil,
  UserPlus,
  AlertTriangle,
  CheckCircle2,
  Circle,
  Loader2,
  Save,
  Settings2,
  Search,
  Filter,
  SlidersHorizontal,
} from "lucide-react";
import { Link } from "wouter";

/* ── types ─────────────────────────────────────────────────── */
interface Position {
  accountId: number;
  accountName: string;
  positionId?: string;
  symbol: string;
  positionSide: "LONG" | "SHORT";
  leverage: string | number;
  positionSize: string | number;
  positionValue: string | number;
  avgEntryPrice: string | number;
  markPrice: string | number;
  unrealisedPnl: string | number;
  liquidationPrice: string | number;
  status: string;
}

interface OpenOrder {
  accountId: number;
  accountName: string;
  orderId: string;
  symbol: string;
  side: string;
  orderType: string;
  quantity: string | number;
  price: string | number;
  status: string;
  reduceOnly: boolean;
  createdAt: string | null;
}

interface MultiOrderRow {
  id: number;
  symbol: string;
  side: "BUY" | "SELL";
  orderType: "MARKET" | "LIMIT";
  quantity: string;
  price: string;
}

interface SelectedAccount {
  accountId: number;
  multiplier: number;
}

interface AutoPunchConfig {
  orderCount: number;
  stepSize: number;
  tpPoints: number;
}

type OrderStatus = "pending" | "executing" | "success" | "failed";

interface PreviewOrder {
  index: number;
  limitPrice: number;
  tpPrice: number;
  quantity: number;
  status: OrderStatus;
  error?: string;
}

type ConfirmState =
  | { type: "exit_one"; pos: Position }
  | { type: "exit_selected"; count: number }
  | { type: "exit_all"; count: number }
  | { type: "cancel_all"; count: number }
  | { type: "cancel_order"; order: OpenOrder }
  | null;

/* ── Filter types ── */
interface PositionFilters {
  search: string;
  side: "ALL" | "LONG" | "SHORT";
  pnl: "ALL" | "PROFIT" | "LOSS";
}

interface OrderFilters {
  search: string;
  side: "ALL" | "BUY" | "SELL";
  orderType: "ALL" | "MARKET" | "LIMIT";
  reduceOnly: "ALL" | "YES" | "NO";
}

/* ── helpers ── */
const fmt = (v: string | number | null | undefined, decimals = 2) => {
  const n = typeof v === "string" ? parseFloat(v) : v;
  if (n === null || n === undefined || isNaN(n as number)) return "—";
  return (n as number).toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
};

const pnlColor = (v: string | number) => {
  const n = typeof v === "string" ? parseFloat(v) : v;
  if (isNaN(n) || n === 0) return "text-muted-foreground";
  return n > 0 ? "text-[hsl(162_88%_42%)]" : "text-[hsl(345_88%_58%)]";
};

const pnlSign = (v: string | number) => {
  const n = typeof v === "string" ? parseFloat(v) : v;
  if (isNaN(n) || n === 0) return "";
  return n > 0 ? "+" : "";
};

const calcMargin = (quantity: string | number, price: string | number, lev: number): number | null => {
  const q = typeof quantity === "string" ? parseFloat(quantity) : quantity;
  const p = typeof price === "string" ? parseFloat(price) : price;
  if (isNaN(q) || isNaN(p) || !p || !lev) return null;
  return (q * p) / lev;
};

/* ── constants ── */
const LEVERAGE_PRESETS = [5, 10, 20, 30, 50];
const ORDER_TYPES: { value: OrderPayloadOrderType; label: string }[] = [
  { value: "MARKET", label: "Market" },
  { value: "LIMIT", label: "Limit" },
];
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

/* ══════════════════════════════════════════════════════════════
   Pagination Hook
══════════════════════════════════════════════════════════════ */
function usePagination<T>(items: T[], defaultPageSize = 25) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);

  // Reset to page 1 whenever the dataset or page size changes
  useEffect(() => { setPage(1); }, [items.length, pageSize]);

  const totalPages = pageSize === 0 ? 1 : Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(page, totalPages);

  const paged = pageSize === 0
    ? items
    : items.slice((safePage - 1) * pageSize, safePage * pageSize);

  return {
    paged,
    page: safePage,
    pageSize,
    totalPages,
    totalItems: items.length,
    setPage,
    setPageSize,
    hasPrev: safePage > 1,
    hasNext: safePage < totalPages,
  };
}

/* ══════════════════════════════════════════════════════════════
   Pagination Bar
══════════════════════════════════════════════════════════════ */
interface PaginationBarProps {
  page: number;
  pageSize: number;
  totalPages: number;
  totalItems: number;
  hasPrev: boolean;
  hasNext: boolean;
  onPage: (p: number) => void;
  onPageSize: (s: number) => void;
}

function PaginationBar({
  page,
  pageSize,
  totalPages,
  totalItems,
  hasPrev,
  hasNext,
  onPage,
  onPageSize,
}: PaginationBarProps) {
  const start = pageSize === 0 ? 1 : (page - 1) * pageSize + 1;
  const end = pageSize === 0 ? totalItems : Math.min(page * pageSize, totalItems);

  // Build page number buttons — show up to 5 around current
  const pageNumbers: (number | "…")[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pageNumbers.push(i);
  } else {
    pageNumbers.push(1);
    if (page > 3) pageNumbers.push("…");
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pageNumbers.push(i);
    if (page < totalPages - 2) pageNumbers.push("…");
    pageNumbers.push(totalPages);
  }

  const btnBase: React.CSSProperties = {
    minWidth: 28,
    height: 28,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 6,
    fontSize: 11,
    fontWeight: 600,
    cursor: "pointer",
    transition: "all 0.15s",
    border: "1px solid hsl(var(--border))",
    background: "transparent",
    color: "hsl(var(--muted-foreground))",
  };

  const btnActive: React.CSSProperties = {
    ...btnBase,
    background: "hsl(258 82% 64% / 0.18)",
    color: "hsl(var(--primary))",
    border: "1px solid hsl(258 82% 64% / 0.4)",
  };

  const btnDisabled: React.CSSProperties = {
    ...btnBase,
    opacity: 0.35,
    cursor: "not-allowed",
  };

  if (totalItems === 0) return null;

  return (
    <div
      className="flex items-center justify-between gap-3 px-4 py-2 shrink-0 flex-wrap"
      style={{ borderTop: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }}
    >
      {/* Rows per page */}
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-muted-foreground shrink-0">Rows per page</span>
        <div className="relative">
          <select
            value={pageSize === 0 ? "all" : pageSize}
            onChange={(e) => onPageSize(e.target.value === "all" ? 0 : Number(e.target.value))}
            className="appearance-none pl-2.5 pr-6 py-1 rounded-md text-[11px] font-semibold cursor-pointer focus:outline-none focus:ring-1 focus:ring-ring transition-all"
            style={{
              background: "hsl(var(--muted))",
              color: "hsl(var(--muted-foreground))",
              border: "1px solid hsl(var(--border))",
            }}
          >
            {PAGE_SIZE_OPTIONS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
            <option value="all">All</option>
          </select>
          <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 pointer-events-none text-muted-foreground" />
        </div>
      </div>

      {/* Info */}
      <span className="text-[11px] text-muted-foreground">
        {totalItems === 0 ? "0 rows" : pageSize === 0 ? `All ${totalItems}` : `${start}–${end} of ${totalItems}`}
      </span>

      {/* Page controls */}
      {pageSize !== 0 && totalPages > 1 && (
        <div className="flex items-center gap-1">
          <button style={hasPrev ? btnBase : btnDisabled} disabled={!hasPrev} onClick={() => onPage(1)} title="First page">
            <ChevronsLeft className="w-3.5 h-3.5" />
          </button>
          <button style={hasPrev ? btnBase : btnDisabled} disabled={!hasPrev} onClick={() => onPage(page - 1)} title="Previous page">
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>

          {pageNumbers.map((n, i) =>
            n === "…" ? (
              <span key={`ellipsis-${i}`} className="px-1 text-[11px] text-muted-foreground select-none">…</span>
            ) : (
              <button
                key={n}
                style={n === page ? btnActive : btnBase}
                onClick={() => onPage(n as number)}
              >
                {n}
              </button>
            )
          )}

          <button style={hasNext ? btnBase : btnDisabled} disabled={!hasNext} onClick={() => onPage(page + 1)} title="Next page">
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
          <button style={hasNext ? btnBase : btnDisabled} disabled={!hasNext} onClick={() => onPage(totalPages)} title="Last page">
            <ChevronsRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

/* ── StatusIcon ── */
function StatusIcon({ status }: { status: OrderStatus }) {
  if (status === "success") return <CheckCircle2 className="w-3.5 h-3.5" style={{ color: "hsl(162 88% 42%)" }} />;
  if (status === "failed") return <AlertTriangle className="w-3.5 h-3.5" style={{ color: "hsl(345 88% 58%)" }} />;
  if (status === "executing") return <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: "hsl(var(--primary))" }} />;
  return <Circle className="w-3.5 h-3.5 text-muted-foreground" />;
}

/* ══════════════════════════════════════════════════════════════
   Table Search + Filter Bar
══════════════════════════════════════════════════════════════ */
interface FilterChipProps {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  activeColor?: string;
}

function FilterChip({ label, value, options, onChange, activeColor }: FilterChipProps) {
  const isActive = value !== options[0].value;
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none pl-2.5 pr-6 py-1 rounded-md text-[11px] font-semibold cursor-pointer focus:outline-none focus:ring-1 focus:ring-ring transition-all"
        style={
          isActive
            ? {
                background: activeColor ? `${activeColor} / 0.15)`.replace(")", "").replace("hsl(", "hsl(") : "hsl(258 82% 64% / 0.15)",
                color: activeColor ?? "hsl(var(--primary))",
                border: `1px solid ${activeColor ?? "hsl(258 82% 64% / 0.4)"}`,
              }
            : {
                background: "hsl(var(--muted))",
                color: "hsl(var(--muted-foreground))",
                border: "1px solid hsl(var(--border))",
              }
        }
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown
        className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 pointer-events-none"
        style={{ color: isActive ? (activeColor ?? "hsl(var(--primary))") : "hsl(var(--muted-foreground))" }}
      />
    </div>
  );
}

interface TableToolbarProps {
  searchValue: string;
  onSearchChange: (v: string) => void;
  searchPlaceholder: string;
  filterSlot?: React.ReactNode;
  activeFilterCount: number;
  onClearFilters: () => void;
  resultCount: number;
  totalCount: number;
}

function TableToolbar({
  searchValue,
  onSearchChange,
  searchPlaceholder,
  filterSlot,
  activeFilterCount,
  onClearFilters,
  resultCount,
  totalCount,
}: TableToolbarProps) {
  return (
    <div
      className="flex items-center gap-2 px-4 py-2 shrink-0 flex-wrap"
      style={{ borderBottom: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }}
    >
      {/* Search */}
      <div className="relative flex-1 min-w-[160px] max-w-[280px]">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
        <input
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
          className="w-full pl-8 pr-3 py-1.5 rounded-lg text-xs bg-input border border-border focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
        />
        {searchValue && (
          <button
            onClick={() => onSearchChange("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <SlidersHorizontal className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        {filterSlot}
      </div>

      {/* Clear */}
      {activeFilterCount > 0 && (
        <button
          onClick={onClearFilters}
          className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold transition-all"
          style={{ color: "hsl(345 88% 62%)", border: "1px solid hsl(345 88% 58% / 0.3)", background: "hsl(345 88% 58% / 0.07)" }}
        >
          <X className="w-3 h-3" /> Clear ({activeFilterCount})
        </button>
      )}

      {/* Result count */}
      <span className="ml-auto text-[11px] text-muted-foreground shrink-0">
        {resultCount === totalCount ? (
          <span>{totalCount} total</span>
        ) : (
          <span>
            <span className="font-semibold text-foreground">{resultCount}</span> of {totalCount}
          </span>
        )}
      </span>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   Auto-Punch Drawer (inline modal panel)
══════════════════════════════════════════════════════════════ */
interface AutoPunchDrawerProps {
  open: boolean;
  onClose: () => void;
  side: OrderPayloadSide;
  entryPrice: string;
  quantity: string;
  selectedAccounts: SelectedAccount[];
  activeAccounts: Array<{ id: number; name: string }>;
  balances: Array<{ accountId: number; availableBalance?: string }> | undefined;
  onConfigSaved: (cfg: AutoPunchConfig) => void;
  savedConfig: AutoPunchConfig | undefined;
}

function AutoPunchDrawer({
  open,
  onClose,
  side,
  entryPrice,
  quantity,
  selectedAccounts,
  activeAccounts,
  balances,
  onConfigSaved,
  savedConfig,
}: AutoPunchDrawerProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const updateSettingsMut = useUpdateSettings();
  const tpslMut = useSetTpsl();

  const [orderCount, setOrderCount] = useState(savedConfig?.orderCount ?? 6);
  const [stepSize, setStepSize] = useState(savedConfig?.stepSize ?? 50);
  const [tpPoints, setTpPoints] = useState(savedConfig?.tpPoints ?? 100);

  const [isExecuting, setIsExecuting] = useState(false);
  const [orderStatuses, setOrderStatuses] = useState<Map<string, OrderStatus>>(new Map());
  const [orderErrors, setOrderErrors] = useState<Map<string, string>>(new Map());
  const [hasExecuted, setHasExecuted] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState(false);

  useEffect(() => {
    if (open) {
      if (savedConfig) {
        setOrderCount(savedConfig.orderCount);
        setStepSize(savedConfig.stepSize);
        setTpPoints(savedConfig.tpPoints);
      }
      setOrderStatuses(new Map());
      setOrderErrors(new Map());
      setHasExecuted(false);
    }
  }, [open]);

  useEffect(() => { setLastSaved(false); }, [orderCount, stepSize, tpPoints]);

  const getAccountName = (accountId: number) =>
    activeAccounts.find((a) => a.id === accountId)?.name ?? `Account ${accountId}`;

  const getMobileNumber = (accountId: number) =>
    (activeAccounts.find((a) => a.id === accountId) as any)?.mobileNumber ?? "—";

  const getBalance = (id: number): string | null => {
    const b = balances?.find((b) => b.accountId === id);
    if (!b?.availableBalance) return null;
    const n = parseFloat(b.availableBalance);
    return isNaN(n) ? b.availableBalance : `$${fmt(n)}`;
  };

  const orderKey = (orderIdx: number, accountId: number) => `${orderIdx}-${accountId}`;

  const setStatus = (key: string, status: OrderStatus, error?: string) => {
    setOrderStatuses((prev) => new Map(prev).set(key, status));
    if (error) setOrderErrors((prev) => new Map(prev).set(key, error));
  };

  const resetExecution = () => {
    setOrderStatuses(new Map());
    setOrderErrors(new Map());
    setHasExecuted(false);
  };

  const previewOrders: PreviewOrder[] = useMemo(() => {
    const entry = parseFloat(entryPrice);
    const qty = parseFloat(quantity);
    if (isNaN(entry) || entry <= 0 || isNaN(qty) || qty <= 0 || orderCount < 1) return [];
    return Array.from({ length: orderCount }, (_, i) => {
      const n = i + 1;
      const limitPrice = side === "BUY" ? entry - stepSize * n : entry + stepSize * n;
      const tpPrice = side === "BUY" ? limitPrice + tpPoints : limitPrice - tpPoints;
      return { index: n, limitPrice, tpPrice, quantity: qty, status: "pending" as OrderStatus };
    });
  }, [side, entryPrice, quantity, orderCount, stepSize, tpPoints]);

  const totalOrderCount = previewOrders.length * selectedAccounts.length;
  const doneCount = [...orderStatuses.values()].filter((s) => s === "success" || s === "failed").length;
  const successCount = [...orderStatuses.values()].filter((s) => s === "success").length;
  const failedCount = [...orderStatuses.values()].filter((s) => s === "failed").length;
  const progress = totalOrderCount > 0 ? (doneCount / totalOrderCount) * 100 : 0;

  const entryValid = !isNaN(parseFloat(entryPrice)) && parseFloat(entryPrice) > 0;
  const qtyValid = !isNaN(parseFloat(quantity)) && parseFloat(quantity) > 0;
  const canExecute = entryValid && qtyValid && selectedAccounts.length > 0 && !isExecuting;

  const handleSaveConfig = useCallback(async () => {
    setIsSaving(true);
    updateSettingsMut.mutate(
      { data: { autoPunchConfig: { orderCount, stepSize, tpPoints } } as any },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
          onConfigSaved({ orderCount, stepSize, tpPoints });
          setLastSaved(true);
          setIsSaving(false);
          toast({ title: "Config saved ✓", description: "These settings are now the default." });
        },
        onError: (err: any) => {
          setIsSaving(false);
          toast({ title: "Failed to save config", description: err.message, variant: "destructive" });
        },
      }
    );
  }, [orderCount, stepSize, tpPoints, updateSettingsMut, queryClient, onConfigSaved, toast]);

  const handleExecute = useCallback(async () => {
    if (selectedAccounts.length === 0) {
      toast({ title: "No accounts selected", variant: "destructive" });
      return;
    }
    if (!entryValid || !qtyValid) {
      toast({ title: "Set a valid price and quantity in the Trade Terminal first", variant: "destructive" });
      return;
    }

    const entry = parseFloat(entryPrice);
    const qty = parseFloat(quantity);

    resetExecution();
    setIsExecuting(true);

    let totalOk = 0;
    let totalFailed = 0;

    for (const order of previewOrders) {
      for (const { accountId } of selectedAccounts) {
        setStatus(orderKey(order.index, accountId), "executing");
      }

      const results = await Promise.allSettled(
        selectedAccounts.map(({ accountId, multiplier }) =>
          executeTrade({
            accountIds: [accountId],
            order: {
              symbol: "XAUUSDT",
              side,
              orderType: "LIMIT",
              quantity: qty * multiplier,
              price: order.limitPrice,
            },
          })
        )
      );

      for (let i = 0; i < selectedAccounts.length; i++) {
        const { accountId } = selectedAccounts[i];
        const result = results[i];
        const key = orderKey(order.index, accountId);
        if (result.status === "fulfilled") {
          setStatus(key, "success");
          totalOk++;
          tpslMut.mutate({
            data: { accountIds: [accountId], symbol: "XAUUSDT", tpPrice: order.tpPrice },
          });
        } else {
          const msg = (result.reason as Error)?.message ?? "Unknown error";
          setStatus(key, "failed", msg);
          totalFailed++;
        }
      }
    }

    setIsExecuting(false);
    setHasExecuted(true);

    toast({
      title: totalFailed === 0
        ? `All ${totalOk} orders punched ✓`
        : `Completed — ${totalOk} ok, ${totalFailed} failed`,
      variant: totalFailed === 0 ? "default" : "destructive",
    });
  }, [previewOrders, selectedAccounts, side, entryPrice, quantity, entryValid, qtyValid, tpslMut, toast]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "hsl(var(--background) / 0.7)", backdropFilter: "blur(4px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="relative flex rounded-2xl overflow-hidden shadow-2xl"
        style={{
          width: "min(92vw, 700px)",     // ← was 820px
    height: "min(90vh, 500px)",    // ← was 600px
          border: "1px solid hsl(258 82% 64% / 0.3)",
          background: "hsl(var(--card))",
        }}
      >
        {/* Left config */}
        <div
          className="w-48 shrink-0 flex flex-col overflow-y-auto p-4 gap-3"
          style={{ borderRight: "1px solid hsl(var(--border))" }}
        >
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 shrink-0" style={{ color: "hsl(var(--primary))" }} />
            <span className="font-bold text-sm" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              Auto-Punch
            </span>
          </div>

          <div className="rounded-lg px-3 py-2 space-y-1 text-[11px]"
            style={{ background: "hsl(var(--muted))", border: "1px solid hsl(var(--border))" }}>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">From Trade Terminal</p>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Direction</span>
              <span className="font-bold" style={{ color: side === "BUY" ? "hsl(162 88% 42%)" : "hsl(345 88% 58%)" }}>
                {side === "BUY" ? "▲ BUY" : "▼ SELL"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Entry Price</span>
              <span className="font-mono font-semibold">{entryPrice || <span className="text-muted-foreground italic">not set</span>}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Base Qty</span>
              <span className="font-mono font-semibold">{quantity || <span className="text-muted-foreground italic">not set</span>}</span>
            </div>
            {(!entryValid || !qtyValid) && (
              <p className="text-[10px] mt-1" style={{ color: "hsl(38 92% 45%)" }}>
                ⚠ Set price &amp; quantity in the terminal to punch.
              </p>
            )}
          </div>

          <div className="border-t border-border" />

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Number of Orders</label>
              <span className="text-xs font-bold" style={{ color: "hsl(var(--primary))" }}>{orderCount}</span>
            </div>
            <input type="range" min={1} max={20} value={orderCount}
              onChange={(e) => { setOrderCount(Number(e.target.value)); resetExecution(); }}
              className="w-full accent-primary" />
            <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5"><span>1</span><span>20</span></div>
          </div>

          <div>
            <label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1 block">Step Size (pts)</label>
            <input
              className="w-full rounded-lg px-3 py-2 text-sm font-mono bg-input border border-border focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
              type="number" min="1" step="1" value={stepSize}
              onChange={(e) => { setStepSize(Math.max(0, Number(e.target.value))); resetExecution(); }}
              placeholder="50"
            />
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Limits placed every {stepSize} pts {side === "BUY" ? "below" : "above"} entry.
            </p>
          </div>

          <div>
            <label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1 block">Take Profit (pts)</label>
            <input
              className="w-full rounded-lg px-3 py-2 text-sm font-mono bg-input border border-border focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
              type="number" min="1" step="1" value={tpPoints}
              onChange={(e) => { setTpPoints(Math.max(1, Number(e.target.value))); resetExecution(); }}
              placeholder="100"
            />
            <p className="text-[10px] text-muted-foreground mt-0.5">
              TP = limit {side === "BUY" ? "+" : "−"} {tpPoints} pts per order.
            </p>
          </div>

          <button
            onClick={handleSaveConfig}
            disabled={isSaving}
            className="flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition-all disabled:opacity-50"
            style={lastSaved
              ? { background: "hsl(162 88% 42% / 0.12)", color: "hsl(162 88% 42%)", border: "1px solid hsl(162 88% 42% / 0.3)" }
              : { background: "hsl(258 82% 64% / 0.1)", color: "hsl(var(--primary))", border: "1px solid hsl(258 82% 64% / 0.3)" }}
          >
            {isSaving ? <><Loader2 className="w-3 h-3 animate-spin" /> Saving…</>
              : lastSaved ? <><CheckCircle2 className="w-3 h-3" /> Saved ✓</>
              : <><Save className="w-3 h-3" /> Save as Default</>}
          </button>

          <div className="border-t border-border" />

          {previewOrders.length > 0 && selectedAccounts.length > 0 && (
            <div className="rounded-xl px-3 py-2 text-[10px] space-y-0.5"
              style={{ background: "hsl(258 82% 64% / 0.07)", border: "1px solid hsl(258 82% 64% / 0.2)" }}>
              <p className="font-semibold" style={{ color: "hsl(var(--primary))" }}>Summary</p>
              <p className="text-muted-foreground">
                {previewOrders.length} orders × {selectedAccounts.length} acct ={" "}
                <span className="font-bold text-foreground">{totalOrderCount} total</span>
              </p>
              <p className="font-mono text-muted-foreground">
                {fmt(previewOrders[previewOrders.length - 1]?.limitPrice)} → {fmt(previewOrders[0]?.limitPrice)}
              </p>
            </div>
          )}

          <button
            onClick={handleExecute}
            disabled={!canExecute}
            className="w-full py-2.5 rounded-xl font-bold text-sm tracking-wide transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            style={side === "BUY"
              ? { background: "hsl(162 88% 42%)", color: "#fff", boxShadow: canExecute ? "0 0 16px hsl(162 88% 42% / 0.35)" : "none" }
              : { background: "hsl(345 88% 58%)", color: "#fff", boxShadow: canExecute ? "0 0 16px hsl(345 88% 58% / 0.35)" : "none" }}
          >
            {isExecuting
              ? `Punching… (${doneCount}/${totalOrderCount})`
              : hasExecuted ? "Punch Again"
              : `Punch ${previewOrders.length} Limit Order${previewOrders.length !== 1 ? "s" : ""}`}
          </button>

          {hasExecuted && !isExecuting && (
            <button onClick={resetExecution} className="w-full py-1.5 rounded-xl text-xs font-semibold"
              style={{ border: "1px solid hsl(var(--border))", color: "hsl(var(--muted-foreground))" }}>
              Reset Status
            </button>
          )}
        </div>

        {/* Right: live order grid */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {(isExecuting || hasExecuted) && totalOrderCount > 0 && (
            <div className="shrink-0 px-4 py-2.5 space-y-1.5" style={{ borderBottom: "1px solid hsl(var(--border))" }}>
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold">{isExecuting ? "Punching orders…" : "Execution complete"}</span>
                <span className="text-muted-foreground">
                  {successCount > 0 && <span style={{ color: "hsl(162 88% 42%)" }}>{successCount} ok</span>}
                  {successCount > 0 && failedCount > 0 && " · "}
                  {failedCount > 0 && <span style={{ color: "hsl(345 88% 58%)" }}>{failedCount} failed</span>}
                  {!isExecuting && failedCount === 0 && (
                    <span style={{ color: "hsl(162 88% 42%)" }}>All {successCount} succeeded ✓</span>
                  )}
                </span>
              </div>
              <div className="w-full rounded-full overflow-hidden" style={{ height: 3, background: "hsl(var(--muted))" }}>
                <div className="h-full rounded-full transition-all duration-300"
                  style={{ width: `${progress}%`, background: failedCount > 0 ? "hsl(345 88% 58%)" : "hsl(162 88% 42%)" }} />
              </div>
            </div>
          )}

          <div className="shrink-0 px-4 py-2" style={{ borderBottom: "1px solid hsl(var(--border))", background: "hsl(var(--muted))" }}>
            {previewOrders.length === 0 ? (
              <p className="text-xs text-muted-foreground">Configure the form to preview orders.</p>
            ) : (
              <div className="grid text-[10px] font-semibold uppercase tracking-widest text-muted-foreground gap-2"
                style={{ gridTemplateColumns: `2rem 1fr repeat(${Math.min(selectedAccounts.length, 4)}, 1fr) 6rem 6rem` }}>
                <span>#</span>
                <span>Limit Price</span>
                {selectedAccounts.slice(0, 4).map(({ accountId }) => (
                  <span key={accountId} className="truncate">{getAccountName(accountId)}</span>
                ))}
                {selectedAccounts.length > 4 && <span>+{selectedAccounts.length - 4}</span>}
                <span>TP</span>
                <span>Qty</span>
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto">
            {previewOrders.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
                <Zap className="w-8 h-8 opacity-20" />
                <p className="text-sm font-medium">No orders to preview</p>
                <p className="text-xs text-center max-w-xs opacity-70">Enter an entry price and quantity on the left.</p>
              </div>
            ) : (
              previewOrders.map((order, rowIdx) => {
                const isBuy = side === "BUY";
                const rowStatuses = selectedAccounts.map(
                  ({ accountId }) => orderStatuses.get(orderKey(order.index, accountId)) ?? "pending"
                );
                const rowFailed = rowStatuses.some((s) => s === "failed");
                const rowExecuting = rowStatuses.some((s) => s === "executing");
                const rowAllDone = rowStatuses.every((s) => s === "success" || s === "failed");

                return (
                  <div
                    key={order.index}
                    className="px-4 py-2 transition-colors"
                    style={{
                      background: rowExecuting ? "hsl(258 82% 64% / 0.06)"
                        : rowFailed ? "hsl(345 88% 58% / 0.05)"
                        : rowAllDone ? "hsl(162 88% 42% / 0.04)"
                        : rowIdx % 2 === 0 ? "transparent" : "hsl(var(--muted) / 0.3)",
                      borderBottom: "1px solid hsl(var(--border) / 0.5)",
                    }}
                  >
                    <div className="grid items-center gap-2 text-xs"
                      style={{ gridTemplateColumns: `2rem 1fr repeat(${Math.min(selectedAccounts.length, 4)}, 1fr) 6rem 6rem` }}>
                      <span className="font-bold text-muted-foreground">#{order.index}</span>
                      <span className="font-mono font-bold"
                        style={{ color: isBuy ? "hsl(345 88% 58%)" : "hsl(162 88% 42%)" }}>
                        {fmt(order.limitPrice)}
                      </span>
                      {selectedAccounts.slice(0, 4).map(({ accountId }) => {
                        const key = orderKey(order.index, accountId);
                        const status = orderStatuses.get(key) ?? "pending";
                        const errMsg = orderErrors.get(key);
                        return (
                          <div key={accountId} className="flex items-center gap-1" title={errMsg}>
                            <StatusIcon status={status} />
                            <span className="text-[10px] text-muted-foreground capitalize">{status}</span>
                          </div>
                        );
                      })}
                      {selectedAccounts.length > 4 && <span className="text-[10px] text-muted-foreground">…</span>}
                      <span className="font-mono text-muted-foreground text-[11px]">{fmt(order.tpPrice)}</span>
                      <span className="font-mono text-muted-foreground text-[11px]">{parseFloat(quantity) || "—"}</span>
                    </div>
                    {rowFailed && (
                      <div className="mt-1 pl-6 flex flex-wrap gap-1.5">
                        {selectedAccounts.map(({ accountId }) => {
                          const errMsg = orderErrors.get(orderKey(order.index, accountId));
                          if (!errMsg) return null;
                          return (
                            <span key={accountId} className="text-[10px] px-2 py-0.5 rounded"
                              style={{ background: "hsl(345 88% 58% / 0.1)", color: "hsl(345 88% 58%)" }}>
                              {getAccountName(accountId)}: {errMsg}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {previewOrders.length > 0 && (
            <div className="shrink-0 px-4 py-2 flex items-center gap-4 text-[10px] text-muted-foreground"
              style={{ borderTop: "1px solid hsl(var(--border))" }}>
              <span className="flex items-center gap-1"><Circle className="w-3 h-3" /> Pending</span>
              <span className="flex items-center gap-1"><Loader2 className="w-3 h-3" /> Executing</span>
              <span className="flex items-center gap-1" style={{ color: "hsl(162 88% 42%)" }}><CheckCircle2 className="w-3 h-3" /> Success</span>
              <span className="flex items-center gap-1" style={{ color: "hsl(345 88% 58%)" }}><AlertTriangle className="w-3 h-3" /> Failed</span>
              <span className="ml-auto opacity-60">TP set via API after each order.</span>
            </div>
          )}
        </div>

        <button
          onClick={onClose}
          className="absolute top-3 right-3 p-1.5 rounded-lg transition-colors text-muted-foreground hover:text-foreground"
          style={{ border: "1px solid hsl(var(--border))" }}
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   Add Accounts Modal
══════════════════════════════════════════════════════════════ */
interface AddAccountsModalProps {
  open: boolean;
  onClose: () => void;
  unselectedAccounts: Array<{ id: number; name: string }>;
  getBalance: (id: number) => string | null;
  onSave: (additions: SelectedAccount[]) => void;
}

function AddAccountsModal({ open, onClose, unselectedAccounts, getBalance, onSave }: AddAccountsModalProps) {
  const [draft, setDraft] = useState<Map<number, { checked: boolean; multiplier: string }>>(new Map());

  useEffect(() => {
    if (open) {
      const m = new Map<number, { checked: boolean; multiplier: string }>();
      for (const acc of unselectedAccounts) m.set(acc.id, { checked: false, multiplier: "1" });
      setDraft(m);
    }
  }, [open, unselectedAccounts]);

  const toggle = (id: number) => setDraft((prev) => { const next = new Map(prev); const cur = next.get(id)!; next.set(id, { ...cur, checked: !cur.checked }); return next; });
  const setMul = (id: number, val: string) => setDraft((prev) => { const next = new Map(prev); const cur = next.get(id)!; next.set(id, { ...cur, multiplier: val }); return next; });
  const checkedCount = [...draft.values()].filter((v) => v.checked).length;

  const handleSave = () => {
    const additions: SelectedAccount[] = [];
    for (const [accountId, { checked, multiplier }] of draft.entries()) {
      if (checked) { const m = parseFloat(multiplier); additions.push({ accountId, multiplier: isNaN(m) || m < 0 ? 1 : m }); }
    }
    onSave(additions);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="w-4 h-4" style={{ color: "hsl(var(--primary))" }} />
            Add Accounts to This Trade
          </DialogTitle>
          <DialogDescription>
            Select accounts to trade on now. They'll be permanently added after you execute.
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-xl divide-y overflow-hidden" style={{ border: "1px solid hsl(var(--border))", maxHeight: 360, overflowY: "auto" }}>
          {unselectedAccounts.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">All active accounts are already selected.</div>
          ) : (
            unselectedAccounts.map((acc) => {
              const entry = draft.get(acc.id);
              if (!entry) return null;
              const bal = getBalance(acc.id);
              return (
                <div key={acc.id} className="flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors"
                  style={{ background: entry.checked ? "hsl(258 82% 64% / 0.06)" : "transparent" }}
                  onClick={() => toggle(acc.id)}>
                  <Checkbox checked={entry.checked} onCheckedChange={() => toggle(acc.id)} onClick={(e) => e.stopPropagation()} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{acc.name}</p>
                    {bal && <p className="text-[11px]" style={{ color: "hsl(162 88% 42%)" }}>{bal}</p>}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <span className="text-[10px] text-muted-foreground">×</span>
                    <input type="number" min="0" step="any" value={entry.multiplier} disabled={!entry.checked}
                      onChange={(e) => setMul(acc.id, e.target.value)}
                      className="w-16 rounded-md px-2 py-1 text-xs font-mono text-center border focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-35"
                      style={{ background: "hsl(var(--input))", border: "1px solid hsl(var(--border))" }} placeholder="1" />
                  </div>
                </div>
              );
            })
          )}
        </div>
        <p className="text-[11px] text-muted-foreground">
          {checkedCount > 0 ? `${checkedCount} account${checkedCount !== 1 ? "s" : ""} selected.` : "Select at least one account."}
        </p>
        <DialogFooter className="gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium"
            style={{ border: "1px solid hsl(var(--border))", color: "hsl(var(--muted-foreground))" }}>Cancel</button>
          <button onClick={handleSave} disabled={checkedCount === 0} className="px-4 py-2 rounded-lg text-sm font-bold disabled:opacity-50"
            style={{ background: "hsl(var(--primary))", color: "#fff" }}>
            Add {checkedCount > 0 ? `${checkedCount} Account${checkedCount !== 1 ? "s" : ""}` : "Accounts"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ══════════════════════════════════════════════════════════════
   Confirm Dialog
══════════════════════════════════════════════════════════════ */
function ConfirmDialog({ state, onConfirm, onCancel }: { state: ConfirmState; onConfirm: () => void; onCancel: () => void }) {
  if (!state) return null;
  const cfg = {
    exit_one: { title: "Exit Position", desc: state.type === "exit_one" ? `Close ${state.pos.positionSide} on ${state.pos.symbol} for ${state.pos.accountName}?` : "", label: "Exit Position" },
    exit_selected: { title: "Exit Selected", desc: state.type === "exit_selected" ? `Close ${state.count} position${state.count !== 1 ? "s" : ""}?` : "", label: `Exit ${state.type === "exit_selected" ? state.count : ""}` },
    exit_all: { title: "Exit All", desc: state.type === "exit_all" ? `Close all ${state.count} position${state.count !== 1 ? "s" : ""}?` : "", label: `Exit All ${state.type === "exit_all" ? state.count : ""}` },
    cancel_all: { title: "Cancel All Orders", desc: state.type === "cancel_all" ? `Cancel ${state.count} open order${state.count !== 1 ? "s" : ""}?` : "", label: `Cancel All` },
    cancel_order: { title: "Cancel Order", desc: state.type === "cancel_order" ? `Cancel ${state.order.side} ${state.order.orderType} order on ${state.order.symbol} for ${state.order.accountName}?` : "", label: "Cancel Order" },
  }[state.type];

  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" style={{ color: "hsl(345 88% 58%)" }} />{cfg.title}
          </DialogTitle>
          <DialogDescription>{cfg.desc}</DialogDescription>
        </DialogHeader>
        <p className="text-xs px-3 py-2 rounded-lg"
          style={{ background: "hsl(345 88% 58% / 0.08)", border: "1px solid hsl(345 88% 58% / 0.2)", color: "hsl(345 88% 52%)" }}>
          This action is irreversible.
        </p>
        <DialogFooter className="gap-2">
          <button onClick={onCancel} className="px-4 py-2 rounded-lg text-sm font-medium"
            style={{ border: "1px solid hsl(var(--border))", color: "hsl(var(--muted-foreground))" }}>Cancel</button>
          <button onClick={onConfirm} className="px-4 py-2 rounded-lg text-sm font-bold"
            style={{ background: "hsl(345 88% 58%)", color: "#fff" }}>{cfg.label}</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Main Component — TradePage
═══════════════════════════════════════════════════════════════ */
export function TradePage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  /* ── form state ── */
  const [symbol, setSymbol] = useState("XAUUSDT");
  const [side, setSide] = useState<OrderPayloadSide>("BUY");
  const [orderType, setOrderType] = useState<OrderPayloadOrderType>("MARKET");
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [leverage, setLeverage] = useState(10);
  const [tpPrice, setTpPrice] = useState("");
  const [slPrice, setSlPrice] = useState("");
  const [showTpsl, setShowTpsl] = useState(false);

  /* ── auto-punch ── */
  const [autoPunchEnabled, setAutoPunchEnabled] = useState(false);
  const [showAutoPunchDrawer, setShowAutoPunchDrawer] = useState(false);
  const [isPunching, setIsPunching] = useState(false);
  const [localAutoPunchConfig, setLocalAutoPunchConfig] = useState<AutoPunchConfig | undefined>();

  /* ── right panel ── */
  const [rightTab, setRightTab] = useState<"positions" | "orders">("positions");
  const [expandedTpsl, setExpandedTpsl] = useState<string | null>(null);
  const [posTpValues, setPosTpValues] = useState<Record<string, { tp: string; sl: string }>>({});
  const [selectedPositions, setSelectedPositions] = useState<Set<string>>(new Set());
  const [confirmState, setConfirmState] = useState<ConfirmState>(null);

  /* ── position filters ── */
  const [posFilters, setPosFilters] = useState<PositionFilters>({
    search: "",
    side: "ALL",
    pnl: "ALL",
  });

  /* ── order filters ── */
  const [ordFilters, setOrdFilters] = useState<OrderFilters>({
    search: "",
    side: "ALL",
    orderType: "ALL",
    reduceOnly: "ALL",
  });

  /* ── multi-order ── */
  const [showMulti, setShowMulti] = useState(false);
  const [multiOrders, setMultiOrders] = useState<MultiOrderRow[]>([]);
  const [multiCounter, setMultiCounter] = useState(0);

  /* ── add-accounts modal ── */
  const [showAddModal, setShowAddModal] = useState(false);
  const [pendingAdditions, setPendingAdditions] = useState<SelectedAccount[]>([]);

  /* ── execution ── */
  const [isExecuting, setIsExecuting] = useState(false);
  const [isExecutingMulti, setIsExecutingMulti] = useState(false);

  /* ── queries ── */
  const { data: accounts } = useListAccounts();
  const { data: balances } = useGetBalances();
  const { data: settings } = useGetSettings();
  const { data: positions = [], refetch: refetchPositions, isFetching: posLoading } = useGetPositions(
    {}, { query: { queryKey: getGetPositionsQueryKey({}), refetchInterval: 10_000 } }
  );
  const { data: openOrders = [], refetch: refetchOrders, isFetching: ordLoading } = useQuery({
    queryKey: ["openOrders"],
    queryFn: () => getOpenOrders({}),
    refetchInterval: 15_000,
    retry: false,
  });

  /* ── mutations ── */
  const tpslMut = useSetTpsl();
  const leverageMut = useSetLeverage();
  const cancelOrderMut = useCancelOrder();
  const cancelAllMut = useCancelAllOrders();
  const updateSettingsMut = useUpdateSettings();

  /* ── derived accounts ── */
  const activeAccounts = (accounts ?? []).filter((a) => a.isActive);
  const savedSelection: SelectedAccount[] = settings?.selectedAccounts ?? [];
  const savedIds = new Set(savedSelection.map((s) => s.accountId));
  const pendingOnly = pendingAdditions.filter((p) => !savedIds.has(p.accountId));
  const hasPending = pendingOnly.length > 0;
  const effectiveSelection: SelectedAccount[] = hasPending ? pendingOnly : savedSelection;
  const effectiveAccountIds = effectiveSelection.map((s) => s.accountId);
  const mergedSelection: SelectedAccount[] = [...savedSelection, ...pendingOnly];
  const unselectedAccounts = activeAccounts.filter((a) => !savedIds.has(a.id));

  const serverConfig = (settings as any)?.autoPunchConfig as AutoPunchConfig | undefined;
  useEffect(() => {
    if (serverConfig && !localAutoPunchConfig) setLocalAutoPunchConfig(serverConfig);
  }, [serverConfig]);

  const autoPunchConfig = localAutoPunchConfig ?? serverConfig;

  const getAccountName = (accountId: number) =>
    activeAccounts.find((a) => a.id === accountId)?.name ?? `Account ${accountId}`;

  const getMobileNumber = (accountId: number) =>
    (activeAccounts.find((a) => a.id === accountId) as any)?.mobileNumber ?? "—";

  const getBalance = (accountId: number) => {
    const b = (balances as Array<{ accountId: number; balance: number }> | undefined)?.find((b) => b.accountId === accountId);
    return b ? `$${fmt(b.balance)}` : null;
  };

  const getRawBalance = (accountId: number): number | null => {
    const live = (balances as Array<{ accountId: number; balance: number }> | undefined)?.find((b) => b.accountId === accountId)?.balance;
    if (live != null && !isNaN(live)) return live;
    const fallback = (accounts as Array<{ id: number; currentBalance?: string | null }> | undefined)?.find((a) => a.id === accountId)?.currentBalance;
    if (fallback != null) { const n = parseFloat(fallback); if (!isNaN(n)) return n; }
    return null;
  };

  const persistSelection = useCallback((selection: SelectedAccount[], opts?: { silent?: boolean }) => {
    updateSettingsMut.mutate({ data: { selectedAccounts: selection } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
        if (!opts?.silent) toast({ title: "Accounts saved ✓" });
      },
      onError: (err: any) => toast({ title: "Failed to save", description: err.message, variant: "destructive" }),
    });
  }, [updateSettingsMut, queryClient, toast]);

  /* ── auto-punch background run ── */
  const runAutoPunch = useCallback(async (
    tradeSymbol: string,
    tradeSide: OrderPayloadSide,
    tradeEntryPrice: number,
    baseQty: number,
    accounts: SelectedAccount[],
    cfg: AutoPunchConfig
  ) => {
    setIsPunching(true);
    toast({ title: `⚡ Auto-punching ${cfg.orderCount} limit orders…`, description: `${cfg.stepSize}-pt steps, ${cfg.tpPoints}-pt TP each` });
    let totalOk = 0, totalFailed = 0;
    for (let n = 1; n <= cfg.orderCount; n++) {
      const limitPrice = tradeSide === "BUY" ? tradeEntryPrice - cfg.stepSize * n : tradeEntryPrice + cfg.stepSize * n;
      const tp = tradeSide === "BUY" ? limitPrice + cfg.tpPoints : limitPrice - cfg.tpPoints;
      const results = await Promise.allSettled(
        accounts.map(({ accountId, multiplier }) =>
          executeTrade({ accountIds: [accountId], order: { symbol: tradeSymbol, side: tradeSide, orderType: "LIMIT", quantity: baseQty * multiplier, price: limitPrice } })
            .then(async (res) => { await tpslMut.mutateAsync({ data: { accountIds: [accountId], symbol: tradeSymbol, tpPrice: tp } }).catch(() => {}); return res; })
        )
      );
      totalOk += results.filter((r) => r.status === "fulfilled").length;
      totalFailed += results.filter((r) => r.status === "rejected").length;
    }
    setIsPunching(false);
    toast({ title: totalFailed === 0 ? `⚡ Auto-punch complete — ${totalOk} orders ✓` : `⚡ Done — ${totalOk} ok, ${totalFailed} failed`, variant: totalFailed > 0 ? "destructive" : "default" });
  }, [tpslMut, toast]);

  /* ── execute main order ── */
  const handleExecute = useCallback(async () => {
    if (effectiveSelection.length === 0) { toast({ title: "No accounts selected", variant: "destructive" }); return; }
    if (!symbol.trim() || !quantity) { toast({ title: "Symbol and quantity required", variant: "destructive" }); return; }
    if (orderType !== "MARKET" && !price) { toast({ title: "Price required for limit orders", variant: "destructive" }); return; }

    const baseQty = parseFloat(quantity);
    setIsExecuting(true);
    const results = await Promise.allSettled(
      effectiveSelection.map(({ accountId, multiplier }) =>
        executeTrade({ accountIds: [accountId], order: { symbol: symbol.toUpperCase(), side, orderType, quantity: baseQty * multiplier, price: orderType !== "MARKET" && price ? parseFloat(price) : undefined } })
      )
    );
    setIsExecuting(false);

    const ok = results.filter((r) => r.status === "fulfilled").length;
    const failedNames = effectiveSelection.filter((_, i) => results[i].status === "rejected").map(({ accountId }) => getAccountName(accountId));
    toast({ title: ok === results.length ? "Order Executed ✓" : `Partial (${ok}/${results.length})`, description: failedNames.length > 0 ? `Failed: ${failedNames.join(", ")}` : undefined });

    if (showTpsl && (tpPrice || slPrice)) {
      tpslMut.mutate({ data: { accountIds: effectiveAccountIds, symbol: symbol.toUpperCase(), tpPrice: tpPrice ? parseFloat(tpPrice) : undefined, slPrice: slPrice ? parseFloat(slPrice) : undefined } });
    }
    if (pendingOnly.length > 0 && ok > 0) {
      persistSelection(mergedSelection, { silent: true });
      setPendingAdditions([]);
      toast({ title: `${pendingOnly.length} account${pendingOnly.length !== 1 ? "s" : ""} added to selection` });
    }
    if (ok > 0 && autoPunchEnabled && autoPunchConfig) {
      const ep = price ? parseFloat(price) : null;
      if (!ep || isNaN(ep)) {
        toast({ title: "⚡ Auto-punch skipped", description: "Enter a price so the puncher knows where to place limit orders.", variant: "destructive" });
      } else {
        void runAutoPunch(symbol.toUpperCase(), side, ep, baseQty, effectiveSelection, autoPunchConfig);
      }
    }
  }, [effectiveSelection, effectiveAccountIds, pendingOnly, mergedSelection, symbol, quantity, price, side, orderType, showTpsl, tpPrice, slPrice, tpslMut, persistSelection, autoPunchEnabled, autoPunchConfig, runAutoPunch, toast]);

  /* ── leverage ── */
  const handleSetLeverage = useCallback(() => {
    if (effectiveAccountIds.length === 0 || !symbol.trim()) { toast({ title: "No accounts selected", variant: "destructive" }); return; }
    leverageMut.mutate({ data: { accountIds: effectiveAccountIds, symbol: symbol.toUpperCase(), leverage } }, {
      onSuccess: (results) => { const ok = results.filter((r: any) => r.success).length; toast({ title: `Leverage set on ${ok}/${results.length} accounts` }); },
      onError: (err: any) => toast({ title: "Leverage Failed", description: err.message, variant: "destructive" }),
    });
  }, [effectiveAccountIds, symbol, leverage, leverageMut, toast]);

  /* ── exit/cancel ── */
  const doExitPosition = useCallback((pos: Position) => {
    const qty = Math.abs(typeof pos.positionSize === "string" ? parseFloat(pos.positionSize) : pos.positionSize);
    executeTrade({ accountIds: [pos.accountId], order: { symbol: pos.symbol, side: pos.positionSide === "LONG" ? "SELL" : "BUY", orderType: "MARKET", quantity: qty, reduceOnly: true } })
      .then(() => { toast({ title: `Exited ${pos.symbol}` }); void refetchPositions(); })
      .catch((err: any) => toast({ title: "Exit Failed", description: err.message, variant: "destructive" }));
  }, [refetchPositions, toast]);

  const doExitSelected = useCallback(async () => {
    const toExit = (positions as Position[]).filter((p) => selectedPositions.has(`${p.accountId}-${p.symbol}-${p.positionSide}`));
    if (!toExit.length) return;
    await Promise.allSettled(toExit.map((pos) => {
      const qty = Math.abs(typeof pos.positionSize === "string" ? parseFloat(pos.positionSize) : pos.positionSize);
      return executeTrade({ accountIds: [pos.accountId], order: { symbol: pos.symbol, side: pos.positionSide === "LONG" ? "SELL" : "BUY", orderType: "MARKET", quantity: qty, reduceOnly: true } });
    }));
    toast({ title: `Exit orders sent for ${toExit.length} position(s)` });
    setSelectedPositions(new Set());
    void refetchPositions();
  }, [positions, selectedPositions, refetchPositions, toast]);

  const doExitAll = useCallback(async () => {
    const all = positions as Position[];
    if (!all.length) return;
    await Promise.allSettled(all.map((pos) => {
      const qty = Math.abs(typeof pos.positionSize === "string" ? parseFloat(pos.positionSize) : pos.positionSize);
      return executeTrade({ accountIds: [pos.accountId], order: { symbol: pos.symbol, side: pos.positionSide === "LONG" ? "SELL" : "BUY", orderType: "MARKET", quantity: qty, reduceOnly: true } });
    }));
    toast({ title: `Exit orders sent for all ${all.length}` });
    void refetchPositions();
  }, [positions, refetchPositions, toast]);

  const doCancelAll = useCallback(() => {
    const accs = effectiveAccountIds.length > 0 ? effectiveAccountIds : activeAccounts.map((a) => a.id);
    cancelAllMut.mutate({ data: { accountIds: accs, symbol: symbol.trim() ? symbol.toUpperCase() : undefined } }, {
      onSuccess: () => { toast({ title: "All orders cancelled" }); void refetchOrders(); },
      onError: (err: any) => toast({ title: "Cancel All Failed", description: err.message, variant: "destructive" }),
    });
  }, [cancelAllMut, effectiveAccountIds, activeAccounts, symbol, refetchOrders, toast]);

  // const handleConfirm = useCallback(() => {
  //   if (!confirmState) return;
  //   setConfirmState(null);
  //   if (confirmState.type === "exit_one") doExitPosition(confirmState.pos);
  //   else if (confirmState.type === "exit_selected") doExitSelected();
  //   else if (confirmState.type === "exit_all") doExitAll();
  //   else if (confirmState.type === "cancel_all") doCancelAll();
  //   else if (confirmState.type === "cancel_order") handleCancelOrder(confirmState.order);
  // }, [confirmState, doExitPosition, doExitSelected, doExitAll, doCancelAll, handleCancelOrder]);

  const handleApplyTpsl = useCallback((pos: Position) => {
    const key = `${pos.accountId}-${pos.symbol}-${pos.positionSide}`;
    const vals = posTpValues[key] ?? { tp: "", sl: "" };
    tpslMut.mutate({ data: { accountIds: [pos.accountId], symbol: pos.symbol, tpPrice: vals.tp ? parseFloat(vals.tp) : undefined, slPrice: vals.sl ? parseFloat(vals.sl) : undefined } }, {
      onSuccess: () => { toast({ title: `TP/SL set on ${pos.accountName}` }); setExpandedTpsl(null); },
      onError: (err: any) => toast({ title: "TP/SL Failed", description: err.message, variant: "destructive" }),
    });
  }, [posTpValues, tpslMut, toast]);

  const handleCancelOrder = useCallback((order: OpenOrder) => {
    cancelOrderMut.mutate({ data: { accountIds: [order.accountId], orderId: order.orderId } }, {
      onSuccess: () => { toast({ title: `Order cancelled on ${order.accountName}` }); void refetchOrders(); },
      onError: (err: any) => toast({ title: "Cancel Failed", description: err.message, variant: "destructive" }),
    });
  }, [cancelOrderMut, refetchOrders, toast]);

  const handleConfirm = useCallback(() => {
    if (!confirmState) return;
    setConfirmState(null);
    if (confirmState.type === "exit_one") doExitPosition(confirmState.pos);
    else if (confirmState.type === "exit_selected") doExitSelected();
    else if (confirmState.type === "exit_all") doExitAll();
    else if (confirmState.type === "cancel_all") doCancelAll();
    else if (confirmState.type === "cancel_order") handleCancelOrder(confirmState.order);
  }, [confirmState, doExitPosition, doExitSelected, doExitAll, doCancelAll, handleCancelOrder]);

  const handleModalSave = (additions: SelectedAccount[]) => {
    if (!additions.length) return;
    setPendingAdditions(additions);
    toast({ title: `${additions.length} account${additions.length !== 1 ? "s" : ""} staged`, description: "Next trade runs on these accounts, then adds them permanently." });
  };

  const discardPending = () => setPendingAdditions([]);

  /* ── multi-order ── */
  const addMultiRow = () => { setMultiOrders((prev) => [...prev, { id: multiCounter, symbol: "XAUUSDT", side: "BUY", orderType: "MARKET", quantity: "", price: "" }]); setMultiCounter((c) => c + 1); };
  const removeMultiRow = (id: number) => setMultiOrders((prev) => prev.filter((r) => r.id !== id));
  const updateMultiRow = (id: number, patch: Partial<MultiOrderRow>) => setMultiOrders((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const handleExecuteMulti = async () => {
    if (effectiveSelection.length === 0) { toast({ title: "No accounts selected", variant: "destructive" }); return; }
    const valid = multiOrders.filter((o) => o.symbol.trim() && o.quantity);
    if (!valid.length) return;
    setIsExecutingMulti(true);
    const jobs = valid.flatMap((o) => effectiveSelection.map(({ accountId, multiplier }) =>
      executeTrade({ accountIds: [accountId], order: { symbol: o.symbol.toUpperCase(), side: o.side, orderType: o.orderType, quantity: parseFloat(o.quantity) * multiplier, price: o.orderType !== "MARKET" && o.price ? parseFloat(o.price) : undefined } })
    ));
    const results = await Promise.allSettled(jobs);
    setIsExecutingMulti(false);
    const ok = results.filter((r) => r.status === "fulfilled").length;
    toast({ title: `Multi-order: ${ok}/${jobs.length} sent` });
    if (pendingOnly.length > 0 && ok > 0) { persistSelection(mergedSelection, { silent: true }); setPendingAdditions([]); }
  };

  const positionsArr = positions as Position[];
  const ordersArr = openOrders as OpenOrder[];

  /* ── filtered positions ── */
  const filteredPositions = useMemo(() => {
    const q = posFilters.search.toLowerCase().trim();
    return positionsArr.filter((pos) => {
      const phone = getMobileNumber(pos.accountId).toLowerCase();
      if (q && !pos.symbol.toLowerCase().includes(q) && !pos.accountName.toLowerCase().includes(q) && !phone.includes(q)) return false;
      if (posFilters.side !== "ALL" && pos.positionSide !== posFilters.side) return false;
      if (posFilters.pnl !== "ALL") {
        const pnl = typeof pos.unrealisedPnl === "string" ? parseFloat(pos.unrealisedPnl) : pos.unrealisedPnl;
        if (posFilters.pnl === "PROFIT" && pnl <= 0) return false;
        if (posFilters.pnl === "LOSS" && pnl >= 0) return false;
      }
      return true;
    });
  }, [positionsArr, posFilters]);

  /* ── filtered orders ── */
  const filteredOrders = useMemo(() => {
    const q = ordFilters.search.toLowerCase().trim();
    return ordersArr.filter((order) => {
      const phone = getMobileNumber(order.accountId).toLowerCase();
      if (q &&
        !order.symbol.toLowerCase().includes(q) &&
        !order.accountName.toLowerCase().includes(q) &&
        !order.orderId.toLowerCase().includes(q) &&
        !phone.includes(q)
      ) return false;
      if (ordFilters.side !== "ALL" && order.side !== ordFilters.side) return false;
      if (ordFilters.orderType !== "ALL" && order.orderType !== ordFilters.orderType) return false;
      if (ordFilters.reduceOnly !== "ALL") {
        if (ordFilters.reduceOnly === "YES" && !order.reduceOnly) return false;
        if (ordFilters.reduceOnly === "NO" && order.reduceOnly) return false;
      }
      return true;
    });
  }, [ordersArr, ordFilters]);

  /* ── active filter counts ── */
  const posActiveFilters = (posFilters.search ? 1 : 0) + (posFilters.side !== "ALL" ? 1 : 0) + (posFilters.pnl !== "ALL" ? 1 : 0);
  const ordActiveFilters = (ordFilters.search ? 1 : 0) + (ordFilters.side !== "ALL" ? 1 : 0) + (ordFilters.orderType !== "ALL" ? 1 : 0) + (ordFilters.reduceOnly !== "ALL" ? 1 : 0);

  const clearPosFilters = () => setPosFilters({ search: "", side: "ALL", pnl: "ALL" });
  const clearOrdFilters = () => setOrdFilters({ search: "", side: "ALL", orderType: "ALL", reduceOnly: "ALL" });

  /* ── pagination ── */
  const posPagination = usePagination(filteredPositions, 25);
  const ordPagination = usePagination(filteredOrders, 25);

  /* ─────────────────────────────────────────────────────────
     RENDER
  ───────────────────────────────────────────────────────── */
  return (
    <div className="flex flex-col h-screen overflow-hidden">

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 shrink-0"
        style={{ borderBottom: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }}>
        <div className="flex items-center gap-2.5">
          <Zap className="w-5 h-5" style={{ color: "hsl(var(--primary))" }} />
          <span className="font-semibold text-base" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Trade Terminal</span>
          <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: "hsl(258 82% 64% / 0.15)", color: "hsl(var(--primary))" }}>
            {mergedSelection.length} selected
          </span>
          {hasPending && (
            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold flex items-center gap-1"
              style={{ background: "hsl(38 92% 50% / 0.15)", color: "hsl(38 92% 38%)" }}>
              ⚡ Trading {pendingOnly.length} new
              <button onClick={discardPending} className="ml-0.5 hover:opacity-70"><X className="w-3 h-3" /></button>
            </span>
          )}
          {autoPunchEnabled && (
            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold flex items-center gap-1"
              style={{ background: isPunching ? "hsl(38 92% 50% / 0.15)" : "hsl(258 82% 64% / 0.12)", color: isPunching ? "hsl(38 92% 38%)" : "hsl(var(--primary))" }}>
              {isPunching ? "⚡ Punching…" : "⚡ Auto-punch ON"}
            </span>
          )}
        </div>
        <span className="text-xs text-muted-foreground">Positions auto-refresh 10s</span>
      </div>

      {/* Body */}
      <div className="flex flex-1 min-h-0">

        {/* ── LEFT PANEL ── */}
        <div className="w-80 shrink-0 flex flex-col overflow-y-auto" style={{ borderRight: "1px solid hsl(var(--border))" }}>
          <div className="p-4 flex flex-col gap-3">

            {/* Symbol */}
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1 block">Symbol</label>
              <input className="w-full rounded-lg px-3 py-2.5 text-sm font-bold uppercase tracking-wider bg-input border border-border focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
                value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} placeholder="XAUUSDT" />
            </div>

            {/* BUY / SELL */}
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setSide("BUY")} className="py-3 rounded-xl font-bold text-sm tracking-wide transition-all"
                style={side === "BUY" ? { background: "hsl(162 88% 42%)", color: "#fff", boxShadow: "0 0 20px hsl(162 88% 42% / 0.35)" } : { border: "1px solid hsl(162 88% 42% / 0.35)", color: "hsl(162 88% 48%)", background: "hsl(162 88% 42% / 0.06)" }}>
                ▲ BUY / LONG
              </button>
              <button onClick={() => setSide("SELL")} className="py-3 rounded-xl font-bold text-sm tracking-wide transition-all"
                style={side === "SELL" ? { background: "hsl(345 88% 58%)", color: "#fff", boxShadow: "0 0 20px hsl(345 88% 58% / 0.35)" } : { border: "1px solid hsl(345 88% 58% / 0.35)", color: "hsl(345 88% 64%)", background: "hsl(345 88% 58% / 0.06)" }}>
                ▼ SELL / SHORT
              </button>
            </div>

            {/* Order type */}
            <div className="flex gap-1 p-1 rounded-lg" style={{ background: "hsl(var(--muted))" }}>
              {ORDER_TYPES.map((ot) => (
                <button key={ot.value} onClick={() => setOrderType(ot.value)} className="flex-1 py-1.5 text-xs font-semibold rounded-md transition-all"
                  style={orderType === ot.value ? { background: "hsl(var(--card))", color: "hsl(var(--foreground))" } : { color: "hsl(var(--muted-foreground))" }}>
                  {ot.label}
                </button>
              ))}
            </div>

            <div>
              <label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1 block">
                Price (USDT)
                {autoPunchEnabled && <span className="ml-1" style={{ color: "hsl(258 82% 60%)" }}>· auto-punch entry</span>}
              </label>
              <input className="w-full rounded-lg px-3 py-2.5 text-sm font-mono bg-input border border-border focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
                type="number" min="0" step="any" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00" />
              {autoPunchEnabled && autoPunchConfig && (
                <p className="text-[10px] mt-1" style={{ color: "hsl(258 82% 60%)" }}>
                  ⚡ Will punch {autoPunchConfig.orderCount} limits from this price after trade.
                </p>
              )}
            </div>

            {/* Quantity */}
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1 block">Base Quantity</label>
              <input className="w-full rounded-lg px-3 py-2.5 text-sm font-mono bg-input border border-border focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
                type="number" min="0" step="any" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="0.00" />
              <p className="text-[10px] text-muted-foreground mt-1">Actual = base × account multiplier.</p>
            </div>

            {/* Price */}
            {/* <div>
              <label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1 block">
                Price (USDT)
                {autoPunchEnabled && <span className="ml-1" style={{ color: "hsl(258 82% 60%)" }}>· auto-punch entry</span>}
              </label>
              <input className="w-full rounded-lg px-3 py-2.5 text-sm font-mono bg-input border border-border focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
                type="number" min="0" step="any" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00" />
              {autoPunchEnabled && autoPunchConfig && (
                <p className="text-[10px] mt-1" style={{ color: "hsl(258 82% 60%)" }}>
                  ⚡ Will punch {autoPunchConfig.orderCount} limits from this price after trade.
                </p>
              )}
            </div> */}

            {/* TP/SL */}
            <button onClick={() => setShowTpsl((v) => !v)} className="flex items-center justify-between w-full px-3 py-2 rounded-lg text-xs font-semibold transition-colors"
              style={{ background: showTpsl ? "hsl(258 82% 64% / 0.1)" : "hsl(var(--muted))", color: showTpsl ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))", border: showTpsl ? "1px solid hsl(258 82% 64% / 0.3)" : "1px solid transparent" }}>
              <span>Take Profit / Stop Loss</span>
              {showTpsl ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
            {showTpsl && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1 block">Take Profit</label>
                  <input className="w-full rounded-lg px-3 py-2 text-sm font-mono bg-input border border-border focus:outline-none focus:ring-1 focus:ring-ring"
                    type="number" step="any" value={tpPrice} onChange={(e) => setTpPrice(e.target.value)} placeholder="TP price" />
                </div>
                <div>
                  <label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1 block">Stop Loss</label>
                  <input className="w-full rounded-lg px-3 py-2 text-sm font-mono bg-input border border-border focus:outline-none focus:ring-1 focus:ring-ring"
                    type="number" step="any" value={slPrice} onChange={(e) => setSlPrice(e.target.value)} placeholder="SL price" />
                </div>
              </div>
            )}

            {/* Leverage */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Leverage</label>
                <span className="text-xs font-bold" style={{ color: "hsl(var(--primary))" }}>{leverage}×</span>
              </div>
<div className="flex items-center justify-between gap-3">
  {/* Leverage Presets */}
  <div className="flex gap-1 flex-wrap">
    {LEVERAGE_PRESETS.map((lv) => (
      <button
        key={lv}
        onClick={() => setLeverage(lv)}
        className="px-1.5 py-0.5 rounded text-[11px] font-semibold transition-all"
        style={
          leverage === lv
            ? {
                background: "hsl(258 82% 64% / 0.2)",
                color: "hsl(var(--primary))",
                border: "1px solid hsl(258 82% 64% / 0.4)",
              }
            : {
                background: "hsl(var(--muted))",
                color: "hsl(var(--muted-foreground))",
                border: "1px solid transparent",
              }
        }
      >
        {lv}×
      </button>
    ))}
  </div>

  {/* Set Button */}
  <button
    onClick={handleSetLeverage}
    disabled={leverageMut.isPending || effectiveAccountIds.length === 0}
    className="px-4 py-1.5 rounded-xl font-semibold text-xs whitespace-nowrap transition-all disabled:opacity-50"
    style={{
      border: "1px solid hsl(258 82% 64% / 0.35)",
      color: "hsl(var(--primary))",
      background: "hsl(258 82% 64% / 0.06)",
    }}
  >
    {leverageMut.isPending ? "Setting…" : `Set ${leverage}×`}
  </button>
</div>
            </div>

            {/* Auto-punch toggle */}
            <div className="flex items-center justify-between gap-3">
  <div className="min-w-0">
    <div className="flex items-center gap-2">
      <span className="text-xs font-bold">Auto-punch Limits</span>

      <button
        onClick={() => setShowAutoPunchDrawer(true)}
        className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium transition-all"
        style={{
          background: "hsl(258 82% 64% / 0.1)",
          color: "hsl(var(--primary))",
          border: "1px solid hsl(258 82% 64% / 0.25)",
        }}
      >
        <Settings2 className="w-3 h-3" />
        Edit
      </button>
    </div>

    {autoPunchEnabled && autoPunchConfig && (
      <p className="text-[10px] text-muted-foreground mt-0.5">
        {autoPunchConfig.orderCount} orders · {autoPunchConfig.stepSize} pt step ·{" "}
        {autoPunchConfig.tpPoints} pt TP
      </p>
    )}

    {!autoPunchConfig && (
      <p className="text-[10px] text-muted-foreground mt-0.5">
        Configure before enabling.
      </p>
    )}
  </div>

  <button
    onClick={() => {
      if (!autoPunchConfig && !autoPunchEnabled) {
        setShowAutoPunchDrawer(true);
      } else {
        setAutoPunchEnabled((v) => !v);
      }
    }}
    className="relative shrink-0 w-10 h-5 rounded-full transition-colors duration-200"
    style={{
      background: autoPunchEnabled
        ? "hsl(258 82% 64%)"
        : "hsl(var(--muted))",
    }}
  >
    <span
      className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform duration-200 shadow-sm"
      style={{
        transform: autoPunchEnabled
          ? "translateX(20px)"
          : "translateX(0)",
      }}
    />
  </button>
</div>

            {/* Accounts panel */}
            <div className="rounded-xl p-3" style={{ border: "1px solid hsl(var(--border))" }}>
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Accounts ({mergedSelection.length})
                  {hasPending && (
                    <span className="ml-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded"
                      style={{ background: "hsl(38 92% 50% / 0.15)", color: "hsl(38 92% 38%)" }}>
                      {pendingOnly.length} new
                    </span>
                  )}
                </label>
                <div className="flex items-center gap-2">
                  <Link href="/accounts">
                    <a className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground font-medium">
                      <Pencil className="w-3 h-3" /> Manage
                    </a>
                  </Link>
                  {unselectedAccounts.length > 0 && (
                    <button onClick={() => setShowAddModal(true)} className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md transition-all"
                      style={{ background: "hsl(258 82% 64% / 0.12)", color: "hsl(var(--primary))", border: "1px solid hsl(258 82% 64% / 0.25)" }}>
                      <Plus className="w-3 h-3" /> Add
                    </button>
                  )}
                </div>
              </div>
              {hasPending && (
                <div className="mt-2 rounded-lg px-3 py-2 text-[10px] font-semibold flex items-start justify-between gap-2"
                  style={{ background: "hsl(38 92% 50% / 0.1)", border: "1px solid hsl(38 92% 50% / 0.25)", color: "hsl(38 92% 36%)" }}>
                  <span>⚡ Next trade runs on {pendingOnly.length} new account{pendingOnly.length !== 1 ? "s" : ""} only.</span>
                  <button onClick={discardPending} className="shrink-0 underline underline-offset-2 hover:opacity-70">Discard</button>
                </div>
              )}
              {mergedSelection.length === 0 && (
                <div className="mt-2 text-xs text-muted-foreground py-3 px-2 rounded-lg" style={{ background: "hsl(var(--muted))" }}>
                  No accounts selected.{" "}
                  {unselectedAccounts.length > 0
                    ? <button onClick={() => setShowAddModal(true)} className="text-primary hover:underline">Add accounts</button>
                    : <Link href="/accounts"><a className="text-primary hover:underline">Go to Accounts</a></Link>}
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div className="space-y-2 pt-1">
              <button onClick={handleExecute} disabled={isExecuting || effectiveSelection.length === 0}
                className="w-full py-3 rounded-xl font-bold text-sm tracking-wide transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                style={side === "BUY"
                  ? { background: "hsl(162 88% 42%)", color: "#fff", boxShadow: "0 0 16px hsl(162 88% 42% / 0.3)" }
                  : { background: "hsl(345 88% 58%)", color: "#fff", boxShadow: "0 0 16px hsl(345 88% 58% / 0.3)" }}>
                {isExecuting ? "Executing…"
                  : hasPending ? `${side} on ${pendingOnly.length} New Account${pendingOnly.length !== 1 ? "s" : ""}`
                  : `${side} on ${effectiveSelection.length || "—"} Account${effectiveSelection.length !== 1 ? "s" : ""}`}
              </button>
              {/* <button onClick={handleSetLeverage} disabled={leverageMut.isPending || effectiveAccountIds.length === 0}
                className="w-full py-2 rounded-xl font-semibold text-xs tracking-wide transition-all disabled:opacity-50"
                style={{ border: "1px solid hsl(258 82% 64% / 0.35)", color: "hsl(var(--primary))", background: "hsl(258 82% 64% / 0.06)" }}>
                {leverageMut.isPending ? "Setting…" : `Set ${leverage}× Leverage`}
              </button> */}
            </div>

            {/* Multi-order */}
            <div className="border-t border-border pt-3">
              <button onClick={() => setShowMulti((v) => !v)} className="flex items-center gap-2 w-full text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors">
                {showMulti ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                Multi-Order Queue {multiOrders.length > 0 && `(${multiOrders.length})`}
              </button>
              {showMulti && (
                <div className="mt-3 space-y-2">
                  {multiOrders.map((row) => (
                    <div key={row.id} className="rounded-lg p-2 space-y-1.5" style={{ border: "1px solid hsl(var(--border))", background: "hsl(var(--muted))" }}>
                      <div className="flex gap-1">
                        <input className="flex-1 rounded px-2 py-1 text-xs font-bold uppercase bg-input border border-border focus:outline-none"
                          value={row.symbol} onChange={(e) => updateMultiRow(row.id, { symbol: e.target.value.toUpperCase() })} placeholder="Symbol" />
                        <button onClick={() => removeMultiRow(row.id)} className="p-1 text-muted-foreground hover:text-destructive transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                      <div className="flex gap-1">
                        <button onClick={() => updateMultiRow(row.id, { side: "BUY" })} className="flex-1 py-1 rounded text-xs font-bold"
                          style={row.side === "BUY" ? { background: "hsl(162 88% 42%)", color: "#fff" } : { background: "hsl(162 88% 42% / 0.1)", color: "hsl(162 88% 48%)", border: "1px solid hsl(162 88% 42% / 0.3)" }}>BUY</button>
                        <button onClick={() => updateMultiRow(row.id, { side: "SELL" })} className="flex-1 py-1 rounded text-xs font-bold"
                          style={row.side === "SELL" ? { background: "hsl(345 88% 58%)", color: "#fff" } : { background: "hsl(345 88% 58% / 0.1)", color: "hsl(345 88% 64%)", border: "1px solid hsl(345 88% 58% / 0.3)" }}>SELL</button>
                      </div>
                      <div className="flex gap-1">
                        <input className="flex-1 rounded px-2 py-1 text-xs font-mono bg-input border border-border focus:outline-none"
                          type="number" value={row.quantity} onChange={(e) => updateMultiRow(row.id, { quantity: e.target.value })} placeholder="Base Qty" />
                        <select className="rounded px-2 py-1 text-xs bg-input border border-border focus:outline-none"
                          value={row.orderType} onChange={(e) => updateMultiRow(row.id, { orderType: e.target.value as "MARKET" | "LIMIT" })}>
                          <option value="MARKET">MKT</option>
                          <option value="LIMIT">LMT</option>
                        </select>
                      </div>
                      {row.orderType !== "MARKET" && (
                        <input className="w-full rounded px-2 py-1 text-xs font-mono bg-input border border-border focus:outline-none"
                          type="number" value={row.price} onChange={(e) => updateMultiRow(row.id, { price: e.target.value })} placeholder="Limit price" />
                      )}
                    </div>
                  ))}
                  <div className="flex gap-2">
                    <button onClick={addMultiRow} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold"
                      style={{ border: "1px solid hsl(var(--border))", color: "hsl(var(--muted-foreground))" }}>
                      <Plus className="w-3 h-3" /> Add Order
                    </button>
                    {multiOrders.length > 0 && (
                      <button onClick={handleExecuteMulti} disabled={isExecutingMulti} className="flex-1 py-1.5 rounded-lg text-xs font-bold disabled:opacity-50"
                        style={{ background: "hsl(var(--primary))", color: "#fff" }}>
                        {isExecutingMulti ? "Executing…" : `Execute All (${multiOrders.length})`}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── RIGHT PANEL ── */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

          {/* Tab bar + action buttons */}
          <div className="flex items-center justify-between px-4 py-2 shrink-0" style={{ borderBottom: "1px solid hsl(var(--border))" }}>
            <div className="flex gap-1">
              {(["positions", "orders"] as const).map((tab) => {
                const count = tab === "positions" ? positionsArr.length : ordersArr.length;
                const filtered = tab === "positions" ? filteredPositions.length : filteredOrders.length;
                const isActive = rightTab === tab;
                const hasFilter = tab === "positions" ? posActiveFilters > 0 : ordActiveFilters > 0;
                return (
                  <button key={tab} onClick={() => setRightTab(tab)} className="px-4 py-1.5 rounded-lg text-sm font-semibold transition-all capitalize"
                    style={isActive ? { background: "hsl(258 82% 64% / 0.15)", color: "hsl(var(--primary))" } : { color: "hsl(var(--muted-foreground))" }}>
                    {tab === "positions" ? "Positions" : "Open Orders"}
                    <span className="ml-2 text-xs px-1.5 py-0.5 rounded-full"
                      style={{ background: isActive ? "hsl(258 82% 64% / 0.2)" : "hsl(var(--muted))", color: isActive ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))" }}>
                      {hasFilter ? `${filtered}/${count}` : count}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-2">
              {rightTab === "positions" ? (
                <>
                  {selectedPositions.size > 0 && (
                    <button onClick={() => setConfirmState({ type: "exit_selected", count: selectedPositions.size })}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold"
                      style={{ background: "hsl(345 88% 58% / 0.15)", color: "hsl(345 88% 62%)", border: "1px solid hsl(345 88% 58% / 0.3)" }}>
                      Exit Selected ({selectedPositions.size})
                    </button>
                  )}
                  <button onClick={() => setConfirmState({ type: "exit_all", count: positionsArr.length })} disabled={positionsArr.length === 0}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold disabled:opacity-40" style={{ background: "hsl(345 88% 58%)", color: "#fff" }}>
                    Exit All ({positionsArr.length})
                  </button>
                </>
              ) : (
                <button onClick={() => setConfirmState({ type: "cancel_all", count: ordersArr.length })} disabled={ordersArr.length === 0}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold disabled:opacity-40" style={{ background: "hsl(345 88% 58%)", color: "#fff" }}>
                  Cancel All ({ordersArr.length})
                </button>
              )}
              <button onClick={() => rightTab === "positions" ? void refetchPositions() : void refetchOrders()}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground transition-colors" style={{ border: "1px solid hsl(var(--border))" }}>
                <RefreshCw className={`w-3.5 h-3.5 ${posLoading || ordLoading ? "animate-spin" : ""}`} />
              </button>
            </div>
          </div>

          {/* ── Positions toolbar ── */}
          {rightTab === "positions" && (
            <TableToolbar
              searchValue={posFilters.search}
              onSearchChange={(v) => setPosFilters((f) => ({ ...f, search: v }))}
              searchPlaceholder="Search account, phone or symbol…"
              activeFilterCount={posActiveFilters}
              onClearFilters={clearPosFilters}
              resultCount={filteredPositions.length}
              totalCount={positionsArr.length}
              filterSlot={
                <>
                  <FilterChip
                    label="Side"
                    value={posFilters.side}
                    options={[
                      { value: "ALL", label: "All Sides" },
                      { value: "LONG", label: "▲ Long" },
                      { value: "SHORT", label: "▼ Short" },
                    ]}
                    onChange={(v) => setPosFilters((f) => ({ ...f, side: v as PositionFilters["side"] }))}
                    activeColor="hsl(258 82% 60%)"
                  />
                  <FilterChip
                    label="PnL"
                    value={posFilters.pnl}
                    options={[
                      { value: "ALL", label: "All PnL" },
                      { value: "PROFIT", label: "✓ Profit" },
                      { value: "LOSS", label: "✗ Loss" },
                    ]}
                    onChange={(v) => setPosFilters((f) => ({ ...f, pnl: v as PositionFilters["pnl"] }))}
                    activeColor="hsl(162 88% 42%)"
                  />
                </>
              }
            />
          )}

          {/* ── Orders toolbar ── */}
          {rightTab === "orders" && (
            <TableToolbar
              searchValue={ordFilters.search}
              onSearchChange={(v) => setOrdFilters((f) => ({ ...f, search: v }))}
              searchPlaceholder="Search account, phone, symbol or order ID…"
              activeFilterCount={ordActiveFilters}
              onClearFilters={clearOrdFilters}
              resultCount={filteredOrders.length}
              totalCount={ordersArr.length}
              filterSlot={
                <>
                  <FilterChip
                    label="Side"
                    value={ordFilters.side}
                    options={[
                      { value: "ALL", label: "All Sides" },
                      { value: "BUY", label: "▲ Buy" },
                      { value: "SELL", label: "▼ Sell" },
                    ]}
                    onChange={(v) => setOrdFilters((f) => ({ ...f, side: v as OrderFilters["side"] }))}
                    activeColor="hsl(258 82% 60%)"
                  />
                  <FilterChip
                    label="Type"
                    value={ordFilters.orderType}
                    options={[
                      { value: "ALL", label: "All Types" },
                      { value: "MARKET", label: "Market" },
                      { value: "LIMIT", label: "Limit" },
                    ]}
                    onChange={(v) => setOrdFilters((f) => ({ ...f, orderType: v as OrderFilters["orderType"] }))}
                    activeColor="hsl(258 82% 60%)"
                  />
                  <FilterChip
                    label="Reduce Only"
                    value={ordFilters.reduceOnly}
                    options={[
                      { value: "ALL", label: "All Orders" },
                      { value: "YES", label: "Reduce Only" },
                      { value: "NO", label: "Non-Reduce" },
                    ]}
                    onChange={(v) => setOrdFilters((f) => ({ ...f, reduceOnly: v as OrderFilters["reduceOnly"] }))}
                    activeColor="hsl(38 92% 40%)"
                  />
                </>
              }
            />
          )}

          <div className="flex-1 overflow-auto">
            {/* POSITIONS */}
            {rightTab === "positions" && (
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr style={{ background: "hsl(var(--muted))", borderBottom: "1px solid hsl(var(--border))" }}>
                    <th className="px-3 py-2 text-left font-semibold uppercase tracking-wider text-muted-foreground w-6">
                      <Checkbox
                        checked={selectedPositions.size === positionsArr.length && positionsArr.length > 0}
                        onCheckedChange={(v) => {
                          if (v) setSelectedPositions(new Set(positionsArr.map((p) => `${p.accountId}-${p.symbol}-${p.positionSide}`)));
                          else setSelectedPositions(new Set());
                        }}
                      />
                    </th>
                    {["Account", "Phone", "Symbol", "Side", "Size", "Entry", "Mark", "PnL", "Liq.", "Actions"].map((h) => (
                      <th key={h} className="px-3 py-2 text-left font-semibold uppercase tracking-wider text-muted-foreground">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredPositions.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="text-center py-16 text-muted-foreground">
                        {positionsArr.length === 0 ? "No open positions" : (
                          <div className="flex flex-col items-center gap-2">
                            <Filter className="w-6 h-6 opacity-30" />
                            <span>No positions match your filters</span>
                            <button onClick={clearPosFilters} className="text-xs font-semibold underline underline-offset-2"
                              style={{ color: "hsl(var(--primary))" }}>Clear filters</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ) : (
                    posPagination.paged.map((pos, idx) => {
                      const posKey = `${pos.accountId}-${pos.symbol}-${pos.positionSide}`;
                      const isSelected = selectedPositions.has(posKey);
                      const isTpslOpen = expandedTpsl === posKey;
                      const tpVals = posTpValues[posKey] ?? { tp: "", sl: "" };
                      return (
                        <>
                          <tr key={posKey} className="cursor-default transition-colors"
                            style={{ borderBottom: isTpslOpen ? "none" : "1px solid hsl(var(--border))", background: isSelected ? "hsl(258 82% 64% / 0.06)" : idx % 2 === 0 ? "transparent" : "hsl(var(--muted) / 0.3)" }}>
                            <td className="px-3 py-2.5">
                              <Checkbox checked={isSelected} onCheckedChange={(v) => {
                                setSelectedPositions((prev) => { const next = new Set(prev); if (v) next.add(posKey); else next.delete(posKey); return next; });
                              }} />
                            </td>
                            <td className="px-3 py-2.5 font-medium max-w-[100px] truncate">{pos.accountName}</td>
                            <td className="px-3 py-2.5 font-mono text-muted-foreground">{getMobileNumber(pos.accountId)}</td>
                            <td className="px-3 py-2.5 font-bold font-mono">{pos.symbol}</td>
                            <td className="px-3 py-2.5">
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                                style={pos.positionSide === "LONG" ? { background: "hsl(162 88% 42% / 0.15)", color: "hsl(162 88% 46%)" } : { background: "hsl(345 88% 58% / 0.15)", color: "hsl(345 88% 62%)" }}>
                                {pos.positionSide === "LONG" ? "▲ LONG" : "▼ SHORT"}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 font-mono">{fmt(pos.positionSize, 4)}</td>
                            <td className="px-3 py-2.5 font-mono">{fmt(pos.avgEntryPrice)}</td>
                            <td className="px-3 py-2.5 font-mono">{fmt(pos.markPrice)}</td>
                            <td className={`px-3 py-2.5 font-mono font-semibold ${pnlColor(pos.unrealisedPnl)}`}>{pnlSign(pos.unrealisedPnl)}{fmt(pos.unrealisedPnl)} USDT</td>
                            <td className="px-3 py-2.5 font-mono text-muted-foreground">{fmt(pos.liquidationPrice)}</td>
                            <td className="px-3 py-2.5">
                              <div className="flex gap-1.5">
                                <button onClick={() => setConfirmState({ type: "exit_one", pos })} className="px-2.5 py-1 rounded-md text-[10px] font-bold" style={{ background: "hsl(345 88% 58%)", color: "#fff" }}>Exit</button>
                                <button onClick={() => setExpandedTpsl(isTpslOpen ? null : posKey)} className="px-2.5 py-1 rounded-md text-[10px] font-bold transition-all"
                                  style={isTpslOpen ? { background: "hsl(258 82% 64% / 0.2)", color: "hsl(var(--primary))" } : { border: "1px solid hsl(var(--border))", color: "hsl(var(--muted-foreground))" }}>TP/SL</button>
                              </div>
                            </td>
                          </tr>
                          {isTpslOpen && (
                            <tr key={`${posKey}-tpsl`}>
                              <td colSpan={11} style={{ borderBottom: "1px solid hsl(var(--border))", padding: 0 }}>
                                <div className="flex items-center gap-3 px-6 py-3" style={{ background: "hsl(258 82% 64% / 0.05)", borderTop: "1px dashed hsl(var(--border))" }}>
                                  <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground w-24">{pos.symbol} TP/SL</span>
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[10px] text-muted-foreground">Take Profit</span>
                                    <input className="w-28 rounded px-2 py-1.5 text-xs font-mono bg-input border border-border focus:outline-none focus:ring-1 focus:ring-ring"
                                      type="number" step="any" value={tpVals.tp} onChange={(e) => setPosTpValues((prev) => ({ ...prev, [posKey]: { ...tpVals, tp: e.target.value } }))} placeholder="TP price" />
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[10px] text-muted-foreground">Stop Loss</span>
                                    <input className="w-28 rounded px-2 py-1.5 text-xs font-mono bg-input border border-border focus:outline-none focus:ring-1 focus:ring-ring"
                                      type="number" step="any" value={tpVals.sl} onChange={(e) => setPosTpValues((prev) => ({ ...prev, [posKey]: { ...tpVals, sl: e.target.value } }))} placeholder="SL price" />
                                  </div>
                                  <button onClick={() => handleApplyTpsl(pos)} disabled={tpslMut.isPending} className="px-3 py-1.5 rounded-md text-xs font-bold disabled:opacity-50" style={{ background: "hsl(var(--primary))", color: "#fff" }}>Apply</button>
                                  <button onClick={() => setExpandedTpsl(null)} className="p-1 text-muted-foreground hover:text-foreground"><X className="w-3.5 h-3.5" /></button>
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      );
                    })
                  )}
                </tbody>
              </table>
            )}

            {/* ORDERS */}
            {rightTab === "orders" && (
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr style={{ background: "hsl(var(--muted))", borderBottom: "1px solid hsl(var(--border))" }}>
                    {["Account", "Phone", "Symbol", "Side", "Type", "Qty", "Price", "Margin Req.", "Remaining Bal.", "Status", "Reduce Only", "Created", "Actions"].map((h) => (
                      <th key={h} className="px-3 py-2 text-left font-semibold uppercase tracking-wider text-muted-foreground">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.length === 0 ? (
                    <tr>
                      <td colSpan={13} className="text-center py-16 text-muted-foreground">
                        {ordersArr.length === 0 ? "No open orders" : (
                          <div className="flex flex-col items-center gap-2">
                            <Filter className="w-6 h-6 opacity-30" />
                            <span>No orders match your filters</span>
                            <button onClick={clearOrdFilters} className="text-xs font-semibold underline underline-offset-2"
                              style={{ color: "hsl(var(--primary))" }}>Clear filters</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ) : (
                    ordPagination.paged.map((order, idx) => {
                      const margin = calcMargin(order.quantity, order.price, leverage);
                      const rawBalance = getRawBalance(order.accountId);
                      const remaining = margin != null && rawBalance != null ? rawBalance - margin : null;
                      return (
                        <tr key={`${order.accountId}-${order.orderId}`} style={{ borderBottom: "1px solid hsl(var(--border))", background: idx % 2 === 0 ? "transparent" : "hsl(var(--muted) / 0.3)" }}>
                          <td className="px-3 py-2.5 font-medium max-w-[100px] truncate">{order.accountName}</td>
                          <td className="px-3 py-2.5 font-mono text-muted-foreground">{getMobileNumber(order.accountId)}</td>
                          <td className="px-3 py-2.5 font-bold font-mono">{order.symbol}</td>
                          <td className="px-3 py-2.5">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                              style={order.side === "BUY" ? { background: "hsl(162 88% 42% / 0.15)", color: "hsl(162 88% 46%)" } : { background: "hsl(345 88% 58% / 0.15)", color: "hsl(345 88% 62%)" }}>
                              {order.side}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-muted-foreground">{order.orderType}</td>
                          <td className="px-3 py-2.5 font-mono">{fmt(order.quantity, 4)}</td>
                          <td className="px-3 py-2.5 font-mono">{order.price ? fmt(order.price) : "—"}</td>
                          <td className="px-3 py-2.5 font-mono text-muted-foreground">{margin != null ? `${fmt(margin)} USDT` : "—"}</td>
                          <td className={`px-3 py-2.5 font-mono ${remaining != null && remaining < 0 ? "text-[hsl(345_88%_58%)]" : "text-muted-foreground"}`}>{remaining != null ? `${fmt(remaining)} USDT` : "—"}</td>
                          <td className="px-3 py-2.5"><span className="px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: "hsl(258 82% 64% / 0.12)", color: "hsl(var(--primary))" }}>{order.status}</span></td>
                          <td className="px-3 py-2.5 text-muted-foreground">{order.reduceOnly ? "Yes" : "—"}</td>
                          <td className="px-3 py-2.5 text-muted-foreground">{order.createdAt ? new Date(order.createdAt).toLocaleTimeString() : "—"}</td>
                          <td className="px-3 py-2.5">
                            <button onClick={() => setConfirmState({ type: "cancel_order", order })} disabled={cancelOrderMut.isPending} className="px-2.5 py-1 rounded-md text-[10px] font-bold disabled:opacity-50"
                              style={{ border: "1px solid hsl(345 88% 58% / 0.4)", color: "hsl(345 88% 62%)" }}>Cancel</button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            )}
          </div>

          {/* ── Pagination bars ── */}
          {rightTab === "positions" && filteredPositions.length > 0 && (
            <PaginationBar
              page={posPagination.page}
              pageSize={posPagination.pageSize}
              totalPages={posPagination.totalPages}
              totalItems={posPagination.totalItems}
              hasPrev={posPagination.hasPrev}
              hasNext={posPagination.hasNext}
              onPage={posPagination.setPage}
              onPageSize={posPagination.setPageSize}
            />
          )}
          {rightTab === "orders" && filteredOrders.length > 0 && (
            <PaginationBar
              page={ordPagination.page}
              pageSize={ordPagination.pageSize}
              totalPages={ordPagination.totalPages}
              totalItems={ordPagination.totalItems}
              hasPrev={ordPagination.hasPrev}
              hasNext={ordPagination.hasNext}
              onPage={ordPagination.setPage}
              onPageSize={ordPagination.setPageSize}
            />
          )}
        </div>
      </div>

      {/* Auto-Punch Drawer */}
      {/* Auto-Punch Drawer */}
<AutoPunchDrawer
  open={showAutoPunchDrawer}
  onClose={() => setShowAutoPunchDrawer(false)}
  side={side}
  entryPrice={price}
  quantity={quantity}
  selectedAccounts={effectiveSelection}
  activeAccounts={activeAccounts}
  balances={balances as any}
  onConfigSaved={(cfg) => {
    setLocalAutoPunchConfig(cfg);
    setAutoPunchEnabled(true);
  }}
  savedConfig={autoPunchConfig}
/>

      <AddAccountsModal open={showAddModal} onClose={() => setShowAddModal(false)} unselectedAccounts={unselectedAccounts} getBalance={getBalance} onSave={handleModalSave} />
      <ConfirmDialog state={confirmState} onConfirm={handleConfirm} onCancel={() => setConfirmState(null)} />
    </div>
  );
}
import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  useListAccounts,
  useGetBalances,
  useGetSettings,
  useGetPositions,
  useSetTpsl,
  useSetLeverage,
  useCancelOrder,
  useCancelAllOrders,
  getOpenOrders,
  executeTrade,
  getGetPositionsQueryKey,
  OrderPayloadSide,
  OrderPayloadOrderType,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Checkbox } from "@/components/ui/checkbox";
import {
  RefreshCw,
  Plus,
  Trash2,
  X,
  ChevronDown,
  ChevronUp,
  Zap,
  Pencil,
} from "lucide-react";

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

/* ── helpers ────────────────────────────────────────────────── */
const fmt = (v: string | number, decimals = 2) => {
  const n = typeof v === "string" ? parseFloat(v) : v;
  if (isNaN(n)) return "—";
  return n.toLocaleString(undefined, {
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

/* ── constants ──────────────────────────────────────────────── */
const LEVERAGE_PRESETS = [1, 5, 10, 20, 50, 75, 100];
const ORDER_TYPES: { value: OrderPayloadOrderType; label: string }[] = [
  { value: "MARKET", label: "Market" },
  { value: "LIMIT", label: "Limit" },
];

/* ═══════════════════════════════════════════════════════════════
   Component
═══════════════════════════════════════════════════════════════ */
export function TradePage() {
  const { toast } = useToast();

  /* ── order form state ──── */
  const [symbol, setSymbol] = useState("XAUUSDT");
  const [side, setSide] = useState<OrderPayloadSide>("BUY");
  const [orderType, setOrderType] = useState<OrderPayloadOrderType>("MARKET");
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [leverage, setLeverage] = useState(10);
  const [tpPrice, setTpPrice] = useState("");
  const [slPrice, setSlPrice] = useState("");
  const [showTpsl, setShowTpsl] = useState(false);

  /* ── right panel state ── */
  const [rightTab, setRightTab] = useState<"positions" | "orders">("positions");
  const [expandedTpsl, setExpandedTpsl] = useState<string | null>(null);
  const [posTpValues, setPosTpValues] = useState<Record<string, { tp: string; sl: string }>>({});
  const [selectedPositions, setSelectedPositions] = useState<Set<string>>(new Set());

  /* ── multi-order state ── */
  const [showMulti, setShowMulti] = useState(false);
  const [multiOrders, setMultiOrders] = useState<MultiOrderRow[]>([]);
  const [multiCounter, setMultiCounter] = useState(0);

  /* ── execution loading flags (replacing single useExecuteTrade mutation,
         since each account now fires its own scaled-quantity request) ── */
  const [isExecuting, setIsExecuting] = useState(false);
  const [isExecutingMulti, setIsExecutingMulti] = useState(false);

  /* ── queries ────────────────────────────────────────────── */
  const { data: accounts } = useListAccounts();
  const { data: balances } = useGetBalances();
  const { data: settings } = useGetSettings();
  const { data: positions = [], refetch: refetchPositions, isFetching: posLoading } = useGetPositions(
    {},
    { query: { queryKey: getGetPositionsQueryKey({}), refetchInterval: 10_000 } }
  );

  const {
    data: openOrders = [],
    refetch: refetchOrders,
    isFetching: ordLoading,
  } = useQuery({
    queryKey: ["openOrders"],
    queryFn: () => getOpenOrders({}),
    refetchInterval: 15_000,
    retry: false,
  });

  /* ── mutations ──────────────────────────────────────────── */
  const tpslMut = useSetTpsl();
  const leverageMut = useSetLeverage();
  const cancelOrderMut = useCancelOrder();
  const cancelAllMut = useCancelAllOrders();

  const activeAccounts = accounts?.filter((a) => a.isActive) ?? [];

  /* ── saved account selection (set on the Select Accounts page) ──────── */
  const selectedAccounts = settings?.selectedAccounts ?? [];
  const selectedAccountIds = selectedAccounts.map((s) => s.accountId);

  const getAccountName = (accountId: number) =>
    activeAccounts.find((a) => a.id === accountId)?.name ?? `Account ${accountId}`;

  const getBalance = (accountId: number) => {
    const b = (balances as Array<{ accountId: number; balance: number }> | undefined)?.find(
      (b) => b.accountId === accountId
    );
    return b ? `$${fmt(b.balance)}` : null;
  };

  /* ── execute main order ─────────────────────────────────── */
  const handleExecute = useCallback(async () => {
    if (selectedAccounts.length === 0) {
      toast({
        title: "No accounts selected",
        description: "Choose accounts and set multipliers on the Select Accounts page first.",
        variant: "destructive",
      });
      return;
    }
    if (!symbol.trim() || !quantity) {
      toast({ title: "Symbol and quantity required", variant: "destructive" });
      return;
    }
    if (orderType !== "MARKET" && !price) {
      toast({ title: "Price required for limit orders", variant: "destructive" });
      return;
    }

    const baseQty = parseFloat(quantity);
    setIsExecuting(true);

    const results = await Promise.allSettled(
      selectedAccounts.map(({ accountId, multiplier }) =>
        executeTrade({
          accountIds: [accountId],
          order: {
            symbol: symbol.toUpperCase(),
            side,
            orderType,
            quantity: baseQty * multiplier,
            price: orderType !== "MARKET" && price ? parseFloat(price) : undefined,
          },
        })
      )
    );

    setIsExecuting(false);

    const ok = results.filter((r) => r.status === "fulfilled").length;
    const failedNames = selectedAccounts
      .filter((_, i) => results[i].status === "rejected")
      .map(({ accountId }) => getAccountName(accountId));

    toast({
      title: ok === results.length ? "Order Executed ✓" : `Partial Execution (${ok}/${results.length})`,
      description: failedNames.length > 0 ? `Failed: ${failedNames.join(", ")}` : undefined,
    });

    // after order, set TP/SL if provided (applies unchanged to all selected accounts)
    if (showTpsl && (tpPrice || slPrice)) {
      tpslMut.mutate({
        data: {
          accountIds: selectedAccountIds,
          symbol: symbol.toUpperCase(),
          tpPrice: tpPrice ? parseFloat(tpPrice) : undefined,
          slPrice: slPrice ? parseFloat(slPrice) : undefined,
        },
      });
    }
  }, [selectedAccounts, selectedAccountIds, symbol, quantity, price, side, orderType, showTpsl, tpPrice, slPrice, tpslMut, toast]);

  /* ── set leverage ────────────────────────────────────────── */
  const handleSetLeverage = useCallback(() => {
    if (selectedAccountIds.length === 0 || !symbol.trim()) {
      toast({ title: "No accounts selected", description: "Select accounts on the Select Accounts page first.", variant: "destructive" });
      return;
    }
    leverageMut.mutate(
      { data: { accountIds: selectedAccountIds, symbol: symbol.toUpperCase(), leverage } },
      {
        onSuccess: (results) => {
          const ok = results.filter((r) => r.success).length;
          toast({ title: `Leverage set on ${ok}/${results.length} accounts` });
        },
        onError: (err) =>
          toast({
            title: "Leverage Failed",
            description: (err as Error).message,
            variant: "destructive",
          }),
      }
    );
  }, [selectedAccountIds, symbol, leverage, leverageMut, toast]);

  /* ── exit a single position (always closes the position's actual size, unscaled) ── */
  const handleExitPosition = useCallback(
    (pos: Position) => {
      const qty = Math.abs(typeof pos.positionSize === "string" ? parseFloat(pos.positionSize) : pos.positionSize);
      const closeSide: OrderPayloadSide = pos.positionSide === "LONG" ? "SELL" : "BUY";
      executeTrade({
        accountIds: [pos.accountId],
        order: {
          symbol: pos.symbol,
          side: closeSide,
          orderType: "MARKET",
          quantity: qty,
          reduceOnly: true,
        },
      })
        .then(() => {
          toast({ title: `Exited ${pos.symbol} on ${pos.accountName}` });
          void refetchPositions();
        })
        .catch((err) =>
          toast({
            title: "Exit Failed",
            description: (err as Error).message,
            variant: "destructive",
          })
        );
    },
    [refetchPositions, toast]
  );

  /* ── exit selected positions ─────────────────────────────── */
  const handleExitSelected = useCallback(async () => {
    const toExit = (positions as Position[]).filter((p) => {
      const key = `${p.accountId}-${p.symbol}-${p.positionSide}`;
      return selectedPositions.has(key);
    });
    if (toExit.length === 0) return;
    await Promise.allSettled(
      toExit.map((pos) => {
        const qty = Math.abs(typeof pos.positionSize === "string" ? parseFloat(pos.positionSize) : pos.positionSize);
        return executeTrade({
          accountIds: [pos.accountId],
          order: {
            symbol: pos.symbol,
            side: pos.positionSide === "LONG" ? "SELL" : "BUY",
            orderType: "MARKET",
            quantity: qty,
            reduceOnly: true,
          },
        });
      })
    );
    toast({ title: `Exit orders sent for ${toExit.length} position(s)` });
    setSelectedPositions(new Set());
    void refetchPositions();
  }, [positions, selectedPositions, refetchPositions, toast]);

  /* ── exit ALL positions ──────────────────────────────────── */
  const handleExitAll = useCallback(async () => {
    const all = positions as Position[];
    if (all.length === 0) return;
    await Promise.allSettled(
      all.map((pos) => {
        const qty = Math.abs(typeof pos.positionSize === "string" ? parseFloat(pos.positionSize) : pos.positionSize);
        return executeTrade({
          accountIds: [pos.accountId],
          order: {
            symbol: pos.symbol,
            side: pos.positionSide === "LONG" ? "SELL" : "BUY",
            orderType: "MARKET",
            quantity: qty,
            reduceOnly: true,
          },
        });
      })
    );
    toast({ title: `Exit orders sent for all ${all.length} position(s)` });
    void refetchPositions();
  }, [positions, refetchPositions, toast]);

  /* ── apply TP/SL for a position ─────────────────────────── */
  const handleApplyTpsl = useCallback(
    (pos: Position) => {
      const key = `${pos.accountId}-${pos.symbol}-${pos.positionSide}`;
      const vals = posTpValues[key] ?? { tp: "", sl: "" };
      tpslMut.mutate(
        {
          data: {
            accountIds: [pos.accountId],
            symbol: pos.symbol,
            tpPrice: vals.tp ? parseFloat(vals.tp) : undefined,
            slPrice: vals.sl ? parseFloat(vals.sl) : undefined,
          },
        },
        {
          onSuccess: () => {
            toast({ title: `TP/SL set on ${pos.accountName}` });
            setExpandedTpsl(null);
          },
          onError: (err) =>
            toast({
              title: "TP/SL Failed",
              description: (err as Error).message,
              variant: "destructive",
            }),
        }
      );
    },
    [posTpValues, tpslMut, toast]
  );

  /* ── cancel a single order ───────────────────────────────── */
  const handleCancelOrder = useCallback(
    (order: OpenOrder) => {
      cancelOrderMut.mutate(
        { data: { accountIds: [order.accountId], orderId: order.orderId } },
        {
          onSuccess: () => {
            toast({ title: `Order cancelled on ${order.accountName}` });
            void refetchOrders();
          },
          onError: (err) =>
            toast({
              title: "Cancel Failed",
              description: (err as Error).message,
              variant: "destructive",
            }),
        }
      );
    },
    [cancelOrderMut, refetchOrders, toast]
  );

  /* ── cancel ALL orders ───────────────────────────────────── */
  const handleCancelAll = useCallback(() => {
    const accs = selectedAccountIds.length > 0 ? selectedAccountIds : activeAccounts.map((a) => a.id);
    cancelAllMut.mutate(
      { data: { accountIds: accs, symbol: symbol.trim() ? symbol.toUpperCase() : undefined } },
      {
        onSuccess: () => {
          toast({ title: "All orders cancelled" });
          void refetchOrders();
        },
        onError: (err) =>
          toast({
            title: "Cancel All Failed",
            description: (err as Error).message,
            variant: "destructive",
          }),
      }
    );
  }, [cancelAllMut, selectedAccountIds, activeAccounts, symbol, refetchOrders, toast]);

  /* ── multi-order helpers ─────────────────────────────────── */
  const addMultiRow = () => {
    setMultiOrders((prev) => [
      ...prev,
      { id: multiCounter, symbol: "XAUUSDT", side: "BUY", orderType: "MARKET", quantity: "", price: "" },
    ]);
    setMultiCounter((c) => c + 1);
  };

  const removeMultiRow = (id: number) =>
    setMultiOrders((prev) => prev.filter((r) => r.id !== id));

  const updateMultiRow = (id: number, patch: Partial<MultiOrderRow>) =>
    setMultiOrders((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const handleExecuteMulti = async () => {
    if (selectedAccounts.length === 0) {
      toast({
        title: "No accounts selected",
        description: "Choose accounts and set multipliers on the Select Accounts page first.",
        variant: "destructive",
      });
      return;
    }
    const valid = multiOrders.filter((o) => o.symbol.trim() && o.quantity);
    if (valid.length === 0) return;

    setIsExecutingMulti(true);

    const jobs = valid.flatMap((o) =>
      selectedAccounts.map(({ accountId, multiplier }) =>
        executeTrade({
          accountIds: [accountId],
          order: {
            symbol: o.symbol.toUpperCase(),
            side: o.side,
            orderType: o.orderType,
            quantity: parseFloat(o.quantity) * multiplier,
            price: o.orderType !== "MARKET" && o.price ? parseFloat(o.price) : undefined,
          },
        })
      )
    );

    const results = await Promise.allSettled(jobs);
    setIsExecutingMulti(false);

    const ok = results.filter((r) => r.status === "fulfilled").length;
    toast({ title: `Multi-order: ${ok}/${jobs.length} orders sent` });
  };

  /* ── derived ─────────────────────────────────────────────── */
  const positionsArr = positions as Position[];
  const ordersArr = openOrders as OpenOrder[];

  /* ─────────────────────────────────────────────────────────
     RENDER
  ───────────────────────────────────────────────────────── */
  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Page header */}
      <div
        className="flex items-center justify-between px-5 py-3 shrink-0"
        style={{ borderBottom: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }}
      >
        <div className="flex items-center gap-2.5">
          <Zap className="w-5 h-5" style={{ color: "hsl(var(--primary))" }} />
          <span className="font-semibold text-base" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            Trade Terminal
          </span>
          <span className="text-xs px-2 py-0.5 rounded-full font-medium"
            style={{ background: "hsl(258 82% 64% / 0.15)", color: "hsl(var(--primary))" }}>
            {selectedAccounts.length} selected
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>Positions auto-refresh 10s</span>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 min-h-0 gap-0">

        {/* ── LEFT PANEL ───────────────────────────────────── */}
        <div
          className="w-80 shrink-0 flex flex-col overflow-y-auto"
          style={{ borderRight: "1px solid hsl(var(--border))" }}
        >
          <div className="p-4 flex flex-col gap-3">

            {/* Symbol */}
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1 block">
                Symbol
              </label>
              <input
                className="w-full rounded-lg px-3 py-2.5 text-sm font-bold uppercase tracking-wider bg-input border border-border focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                placeholder="XAUUSDT"
              />
            </div>

            {/* BUY / SELL */}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setSide("BUY")}
                className="py-3 rounded-xl font-bold text-sm tracking-wide transition-all duration-150"
                style={
                  side === "BUY"
                    ? {
                        background: "hsl(162 88% 42%)",
                        color: "#fff",
                        boxShadow: "0 0 20px hsl(162 88% 42% / 0.35)",
                      }
                    : {
                        border: "1px solid hsl(162 88% 42% / 0.35)",
                        color: "hsl(162 88% 48%)",
                        background: "hsl(162 88% 42% / 0.06)",
                      }
                }
              >
                ▲ BUY / LONG
              </button>
              <button
                onClick={() => setSide("SELL")}
                className="py-3 rounded-xl font-bold text-sm tracking-wide transition-all duration-150"
                style={
                  side === "SELL"
                    ? {
                        background: "hsl(345 88% 58%)",
                        color: "#fff",
                        boxShadow: "0 0 20px hsl(345 88% 58% / 0.35)",
                      }
                    : {
                        border: "1px solid hsl(345 88% 58% / 0.35)",
                        color: "hsl(345 88% 64%)",
                        background: "hsl(345 88% 58% / 0.06)",
                      }
                }
              >
                ▼ SELL / SHORT
              </button>
            </div>

            {/* Order type */}
            <div className="flex gap-1 p-1 rounded-lg" style={{ background: "hsl(var(--muted))" }}>
              {ORDER_TYPES.map((ot) => (
                <button
                  key={ot.value}
                  onClick={() => setOrderType(ot.value)}
                  className="flex-1 py-1.5 text-xs font-semibold rounded-md transition-all"
                  style={
                    orderType === ot.value
                      ? { background: "hsl(var(--card))", color: "hsl(var(--foreground))" }
                      : { color: "hsl(var(--muted-foreground))" }
                  }
                >
                  {ot.label}
                </button>
              ))}
            </div>

            {/* Quantity */}
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1 block">
                Base Quantity
              </label>
              <input
                className="w-full rounded-lg px-3 py-2.5 text-sm font-num bg-input border border-border focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
                type="number"
                min="0"
                step="any"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="0.00"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                Actual quantity per account = base × that account's multiplier.
              </p>
            </div>

            {/* Price (limit/stop only) */}
            {orderType !== "MARKET" && (
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1 block">
                  Price (USDT)
                </label>
                <input
                  className="w-full rounded-lg px-3 py-2.5 text-sm font-num bg-input border border-border focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
                  type="number"
                  min="0"
                  step="any"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="0.00"
                />
              </div>
            )}

            {/* TP/SL toggle */}
            <button
              onClick={() => setShowTpsl((v) => !v)}
              className="flex items-center justify-between w-full px-3 py-2 rounded-lg text-xs font-semibold transition-colors"
              style={{
                background: showTpsl ? "hsl(258 82% 64% / 0.1)" : "hsl(var(--muted))",
                color: showTpsl ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))",
                border: showTpsl ? "1px solid hsl(258 82% 64% / 0.3)" : "1px solid transparent",
              }}
            >
              <span>Take Profit / Stop Loss</span>
              {showTpsl ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>

            {showTpsl && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1 block">
                    Take Profit
                  </label>
                  <input
                    className="w-full rounded-lg px-3 py-2 text-sm font-num bg-input border border-border focus:outline-none focus:ring-1 focus:ring-ring"
                    type="number"
                    step="any"
                    value={tpPrice}
                    onChange={(e) => setTpPrice(e.target.value)}
                    placeholder="TP price"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1 block">
                    Stop Loss
                  </label>
                  <input
                    className="w-full rounded-lg px-3 py-2 text-sm font-num bg-input border border-border focus:outline-none focus:ring-1 focus:ring-ring"
                    type="number"
                    step="any"
                    value={slPrice}
                    onChange={(e) => setSlPrice(e.target.value)}
                    placeholder="SL price"
                  />
                </div>
              </div>
            )}

            {/* Leverage */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Leverage
                </label>
                <span className="text-xs font-bold" style={{ color: "hsl(var(--primary))" }}>
                  {leverage}×
                </span>
              </div>
              <div className="flex gap-1 flex-wrap">
                {LEVERAGE_PRESETS.map((lv) => (
                  <button
                    key={lv}
                    onClick={() => setLeverage(lv)}
                    className="px-2.5 py-1 rounded-md text-xs font-bold transition-all"
                    style={
                      leverage === lv
                        ? { background: "hsl(258 82% 64% / 0.2)", color: "hsl(var(--primary))", border: "1px solid hsl(258 82% 64% / 0.4)" }
                        : { background: "hsl(var(--muted))", color: "hsl(var(--muted-foreground))", border: "1px solid transparent" }
                    }
                  >
                    {lv}×
                  </button>
                ))}
              </div>
            </div>

            {/* Divider ── Selected accounts (read-only, set on Select Accounts page) */}
            <div className="border-t border-border pt-1">
              <div className="flex items-center justify-between mb-2">
                <label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Selected Accounts ({selectedAccounts.length})
                </label>
                <Link href="/accounts">
                  <a className="flex items-center gap-1 text-[10px] text-primary hover:underline font-medium">
                    <Pencil className="w-3 h-3" /> Edit
                  </a>
                </Link>
              </div>
              <div className="space-y-1 max-h-44 overflow-y-auto pr-1">
                {selectedAccounts.length === 0 && (
                  <div className="text-xs text-muted-foreground py-3 px-2 rounded-lg" style={{ background: "hsl(var(--muted))" }}>
                    No accounts selected.{" "}
                    <Link href="/select-accounts">
                      <a className="text-primary hover:underline">Select accounts</a>
                    </Link>{" "}
                    to start trading.
                  </div>
                )}
                {selectedAccounts.map(({ accountId, multiplier }) => {
                  const bal = getBalance(accountId);
                  return (
                    <div
                      key={accountId}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-lg"
                      style={{ background: "hsl(258 82% 64% / 0.06)" }}
                    >
                      <span className="flex-1 text-xs font-medium truncate" title={getAccountName(accountId)}>
                        {getAccountName(accountId)}
                      </span>
                      {bal && (
                        <span className="text-[10px] font-num shrink-0" style={{ color: "hsl(162 88% 42%)" }}>
                          {bal}
                        </span>
                      )}
                      <span
                        className="text-[10px] font-bold font-num shrink-0 px-1.5 py-0.5 rounded"
                        style={{ background: "hsl(258 82% 64% / 0.15)", color: "hsl(var(--primary))" }}
                      >
                        {multiplier}×
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Action buttons */}
            <div className="space-y-2 pt-1">
              <button
                onClick={handleExecute}
                disabled={isExecuting || selectedAccounts.length === 0}
                className="w-full py-3 rounded-xl font-bold text-sm tracking-wide transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
                style={
                  side === "BUY"
                    ? { background: "hsl(162 88% 42%)", color: "#fff", boxShadow: "0 0 16px hsl(162 88% 42% / 0.3)" }
                    : { background: "hsl(345 88% 58%)", color: "#fff", boxShadow: "0 0 16px hsl(345 88% 58% / 0.3)" }
                }
              >
                {isExecuting
                  ? "Executing…"
                  : `${side} on ${selectedAccounts.length || "—"} Account${selectedAccounts.length !== 1 ? "s" : ""}`}
              </button>
              <button
                onClick={handleSetLeverage}
                disabled={leverageMut.isPending || selectedAccountIds.length === 0}
                className="w-full py-2 rounded-xl font-semibold text-xs tracking-wide transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  border: "1px solid hsl(258 82% 64% / 0.35)",
                  color: "hsl(var(--primary))",
                  background: "hsl(258 82% 64% / 0.06)",
                }}
              >
                {leverageMut.isPending ? "Setting…" : `Set ${leverage}× Leverage`}
              </button>
            </div>

            {/* Multi-order section */}
            <div className="border-t border-border pt-3">
              <button
                onClick={() => setShowMulti((v) => !v)}
                className="flex items-center gap-2 w-full text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
              >
                {showMulti ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                Multi-Order Queue {multiOrders.length > 0 && `(${multiOrders.length})`}
              </button>

              {showMulti && (
                <div className="mt-3 space-y-2">
                  {multiOrders.map((row) => (
                    <div
                      key={row.id}
                      className="rounded-lg p-2 space-y-1.5"
                      style={{ border: "1px solid hsl(var(--border))", background: "hsl(var(--muted))" }}
                    >
                      <div className="flex gap-1">
                        <input
                          className="flex-1 rounded px-2 py-1 text-xs font-bold uppercase bg-input border border-border focus:outline-none"
                          value={row.symbol}
                          onChange={(e) => updateMultiRow(row.id, { symbol: e.target.value.toUpperCase() })}
                          placeholder="Symbol"
                        />
                        <button
                          onClick={() => removeMultiRow(row.id)}
                          className="p-1 text-muted-foreground hover:text-destructive transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="flex gap-1">
                        <button
                          onClick={() => updateMultiRow(row.id, { side: "BUY" })}
                          className="flex-1 py-1 rounded text-xs font-bold transition-all"
                          style={
                            row.side === "BUY"
                              ? { background: "hsl(162 88% 42%)", color: "#fff" }
                              : { background: "hsl(162 88% 42% / 0.1)", color: "hsl(162 88% 48%)", border: "1px solid hsl(162 88% 42% / 0.3)" }
                          }
                        >
                          BUY
                        </button>
                        <button
                          onClick={() => updateMultiRow(row.id, { side: "SELL" })}
                          className="flex-1 py-1 rounded text-xs font-bold transition-all"
                          style={
                            row.side === "SELL"
                              ? { background: "hsl(345 88% 58%)", color: "#fff" }
                              : { background: "hsl(345 88% 58% / 0.1)", color: "hsl(345 88% 64%)", border: "1px solid hsl(345 88% 58% / 0.3)" }
                          }
                        >
                          SELL
                        </button>
                      </div>
                      <div className="flex gap-1">
                        <input
                          className="flex-1 rounded px-2 py-1 text-xs font-num bg-input border border-border focus:outline-none"
                          type="number"
                          value={row.quantity}
                          onChange={(e) => updateMultiRow(row.id, { quantity: e.target.value })}
                          placeholder="Base Qty"
                        />
                        <select
                          className="rounded px-2 py-1 text-xs bg-input border border-border focus:outline-none"
                          value={row.orderType}
                          onChange={(e) => updateMultiRow(row.id, { orderType: e.target.value as "MARKET" | "LIMIT" })}
                        >
                          <option value="MARKET">MKT</option>
                          <option value="LIMIT">LMT</option>
                        </select>
                      </div>
                      {row.orderType !== "MARKET" && (
                        <input
                          className="w-full rounded px-2 py-1 text-xs font-num bg-input border border-border focus:outline-none"
                          type="number"
                          value={row.price}
                          onChange={(e) => updateMultiRow(row.id, { price: e.target.value })}
                          placeholder="Limit price"
                        />
                      )}
                    </div>
                  ))}

                  <div className="flex gap-2">
                    <button
                      onClick={addMultiRow}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                      style={{ border: "1px solid hsl(var(--border))", color: "hsl(var(--muted-foreground))" }}
                    >
                      <Plus className="w-3 h-3" /> Add Order
                    </button>
                    {multiOrders.length > 0 && (
                      <button
                        onClick={handleExecuteMulti}
                        disabled={isExecutingMulti}
                        className="flex-1 py-1.5 rounded-lg text-xs font-bold transition-all disabled:opacity-50"
                        style={{ background: "hsl(var(--primary))", color: "#fff" }}
                      >
                        {isExecutingMulti ? "Executing…" : `Execute All (${multiOrders.length})`}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── RIGHT PANEL ──────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

          {/* Tab bar + actions */}
          <div
            className="flex items-center justify-between px-4 py-2 shrink-0"
            style={{ borderBottom: "1px solid hsl(var(--border))" }}
          >
            <div className="flex gap-1">
              {(["positions", "orders"] as const).map((tab) => {
                const count = tab === "positions" ? positionsArr.length : ordersArr.length;
                const isActive = rightTab === tab;
                return (
                  <button
                    key={tab}
                    onClick={() => setRightTab(tab)}
                    className="px-4 py-1.5 rounded-lg text-sm font-semibold transition-all capitalize"
                    style={
                      isActive
                        ? { background: "hsl(258 82% 64% / 0.15)", color: "hsl(var(--primary))" }
                        : { color: "hsl(var(--muted-foreground))" }
                    }
                  >
                    {tab === "positions" ? "Positions" : "Open Orders"}
                    <span
                      className="ml-2 text-xs px-1.5 py-0.5 rounded-full"
                      style={{
                        background: isActive ? "hsl(258 82% 64% / 0.2)" : "hsl(var(--muted))",
                        color: isActive ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))",
                      }}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-2">
              {rightTab === "positions" ? (
                <>
                  {selectedPositions.size > 0 && (
                    <button
                      onClick={handleExitSelected}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
                      style={{ background: "hsl(345 88% 58% / 0.15)", color: "hsl(345 88% 62%)", border: "1px solid hsl(345 88% 58% / 0.3)" }}
                    >
                      Exit Selected ({selectedPositions.size})
                    </button>
                  )}
                  <button
                    onClick={handleExitAll}
                    disabled={positionsArr.length === 0}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all disabled:opacity-40"
                    style={{ background: "hsl(345 88% 58%)", color: "#fff" }}
                  >
                    Exit All ({positionsArr.length})
                  </button>
                </>
              ) : (
                <button
                  onClick={handleCancelAll}
                  disabled={ordersArr.length === 0}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all disabled:opacity-40"
                  style={{ background: "hsl(345 88% 58%)", color: "#fff" }}
                >
                  Cancel All ({ordersArr.length})
                </button>
              )}

              <button
                onClick={() => rightTab === "positions" ? void refetchPositions() : void refetchOrders()}
                className="p-1.5 rounded-lg transition-colors text-muted-foreground hover:text-foreground"
                style={{ border: "1px solid hsl(var(--border))" }}
              >
                <RefreshCw className={`w-3.5 h-3.5 ${(posLoading || ordLoading) ? "animate-spin" : ""}`} />
              </button>
            </div>
          </div>

          {/* Table content */}
          <div className="flex-1 overflow-auto">

            {/* ── POSITIONS TABLE ── */}
            {rightTab === "positions" && (
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr style={{ background: "hsl(var(--muted))", borderBottom: "1px solid hsl(var(--border))" }}>
                    <th className="px-3 py-2 text-left font-semibold uppercase tracking-wider text-muted-foreground w-6">
                      <Checkbox
                        checked={selectedPositions.size === positionsArr.length && positionsArr.length > 0}
                        onCheckedChange={(v) => {
                          if (v) {
                            setSelectedPositions(new Set(positionsArr.map((p) => `${p.accountId}-${p.symbol}-${p.positionSide}`)));
                          } else {
                            setSelectedPositions(new Set());
                          }
                        }}
                      />
                    </th>
                    {["Account", "Symbol", "Side", "Size", "Entry", "Mark", "PnL", "Liq.", "Actions"].map((h) => (
                      <th key={h} className="px-3 py-2 text-left font-semibold uppercase tracking-wider text-muted-foreground">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {positionsArr.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="text-center py-16 text-muted-foreground">
                        No open positions
                      </td>
                    </tr>
                  ) : (
                    positionsArr.map((pos, idx) => {
                      const posKey = `${pos.accountId}-${pos.symbol}-${pos.positionSide}`;
                      const isSelected = selectedPositions.has(posKey);
                      const isTpslOpen = expandedTpsl === posKey;
                      const tpVals = posTpValues[posKey] ?? { tp: "", sl: "" };

                      return (
                        <>
                          <tr
                            key={posKey}
                            className="transition-colors cursor-default"
                            style={{
                              borderBottom: isTpslOpen ? "none" : "1px solid hsl(var(--border))",
                              background: isSelected ? "hsl(258 82% 64% / 0.06)" : idx % 2 === 0 ? "transparent" : "hsl(var(--muted) / 0.3)",
                            }}
                          >
                            <td className="px-3 py-2.5">
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={(v) => {
                                  setSelectedPositions((prev) => {
                                    const next = new Set(prev);
                                    if (v) next.add(posKey); else next.delete(posKey);
                                    return next;
                                  });
                                }}
                              />
                            </td>
                            <td className="px-3 py-2.5 font-medium max-w-[100px] truncate">{pos.accountName}</td>
                            <td className="px-3 py-2.5 font-bold font-num">{pos.symbol}</td>
                            <td className="px-3 py-2.5">
                              <span
                                className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                                style={
                                  pos.positionSide === "LONG"
                                    ? { background: "hsl(162 88% 42% / 0.15)", color: "hsl(162 88% 46%)" }
                                    : { background: "hsl(345 88% 58% / 0.15)", color: "hsl(345 88% 62%)" }
                                }
                              >
                                {pos.positionSide === "LONG" ? "▲ LONG" : "▼ SHORT"}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 font-num">{fmt(pos.positionSize, 4)}</td>
                            <td className="px-3 py-2.5 font-num">{fmt(pos.avgEntryPrice)}</td>
                            <td className="px-3 py-2.5 font-num">{fmt(pos.markPrice)}</td>
                            <td className={`px-3 py-2.5 font-num font-semibold ${pnlColor(pos.unrealisedPnl)}`}>
                              {pnlSign(pos.unrealisedPnl)}{fmt(pos.unrealisedPnl)} USDT
                            </td>
                            <td className="px-3 py-2.5 font-num text-muted-foreground">{fmt(pos.liquidationPrice)}</td>
                            <td className="px-3 py-2.5">
                              <div className="flex gap-1.5">
                                <button
                                  onClick={() => handleExitPosition(pos)}
                                  className="px-2.5 py-1 rounded-md text-[10px] font-bold transition-all disabled:opacity-50"
                                  style={{ background: "hsl(345 88% 58%)", color: "#fff" }}
                                >
                                  Exit
                                </button>
                                <button
                                  onClick={() => setExpandedTpsl(isTpslOpen ? null : posKey)}
                                  className="px-2.5 py-1 rounded-md text-[10px] font-bold transition-all"
                                  style={
                                    isTpslOpen
                                      ? { background: "hsl(258 82% 64% / 0.2)", color: "hsl(var(--primary))" }
                                      : { border: "1px solid hsl(var(--border))", color: "hsl(var(--muted-foreground))" }
                                  }
                                >
                                  TP/SL
                                </button>
                              </div>
                            </td>
                          </tr>

                          {/* Inline TP/SL editor */}
                          {isTpslOpen && (
                            <tr key={`${posKey}-tpsl`}>
                              <td colSpan={10} style={{ borderBottom: "1px solid hsl(var(--border))", padding: 0 }}>
                                <div
                                  className="flex items-center gap-3 px-6 py-3"
                                  style={{ background: "hsl(258 82% 64% / 0.05)", borderTop: "1px dashed hsl(var(--border))" }}
                                >
                                  <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground w-24">
                                    {pos.symbol} TP/SL
                                  </span>
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[10px] text-muted-foreground">Take Profit</span>
                                    <input
                                      className="w-28 rounded px-2 py-1.5 text-xs font-num bg-input border border-border focus:outline-none focus:ring-1 focus:ring-ring"
                                      type="number"
                                      step="any"
                                      value={tpVals.tp}
                                      onChange={(e) =>
                                        setPosTpValues((prev) => ({
                                          ...prev,
                                          [posKey]: { ...tpVals, tp: e.target.value },
                                        }))
                                      }
                                      placeholder="TP price"
                                    />
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[10px] text-muted-foreground">Stop Loss</span>
                                    <input
                                      className="w-28 rounded px-2 py-1.5 text-xs font-num bg-input border border-border focus:outline-none focus:ring-1 focus:ring-ring"
                                      type="number"
                                      step="any"
                                      value={tpVals.sl}
                                      onChange={(e) =>
                                        setPosTpValues((prev) => ({
                                          ...prev,
                                          [posKey]: { ...tpVals, sl: e.target.value },
                                        }))
                                      }
                                      placeholder="SL price"
                                    />
                                  </div>
                                  <button
                                    onClick={() => handleApplyTpsl(pos)}
                                    disabled={tpslMut.isPending}
                                    className="px-3 py-1.5 rounded-md text-xs font-bold transition-all"
                                    style={{ background: "hsl(var(--primary))", color: "#fff" }}
                                  >
                                    Apply
                                  </button>
                                  <button
                                    onClick={() => setExpandedTpsl(null)}
                                    className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
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

            {/* ── ORDERS TABLE ── */}
            {rightTab === "orders" && (
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr style={{ background: "hsl(var(--muted))", borderBottom: "1px solid hsl(var(--border))" }}>
                    {["Account", "Symbol", "Side", "Type", "Qty", "Price", "Status", "Reduce Only", "Created", "Actions"].map((h) => (
                      <th key={h} className="px-3 py-2 text-left font-semibold uppercase tracking-wider text-muted-foreground">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ordersArr.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="text-center py-16 text-muted-foreground">
                        No open orders
                      </td>
                    </tr>
                  ) : (
                    ordersArr.map((order, idx) => (
                      <tr
                        key={`${order.accountId}-${order.orderId}`}
                        style={{
                          borderBottom: "1px solid hsl(var(--border))",
                          background: idx % 2 === 0 ? "transparent" : "hsl(var(--muted) / 0.3)",
                        }}
                      >
                        <td className="px-3 py-2.5 font-medium max-w-[100px] truncate">{order.accountName}</td>
                        <td className="px-3 py-2.5 font-bold font-num">{order.symbol}</td>
                        <td className="px-3 py-2.5">
                          <span
                            className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                            style={
                              order.side === "BUY"
                                ? { background: "hsl(162 88% 42% / 0.15)", color: "hsl(162 88% 46%)" }
                                : { background: "hsl(345 88% 58% / 0.15)", color: "hsl(345 88% 62%)" }
                            }
                          >
                            {order.side}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground">{order.orderType}</td>
                        <td className="px-3 py-2.5 font-num">{fmt(order.quantity, 4)}</td>
                        <td className="px-3 py-2.5 font-num">{order.price ? fmt(order.price) : "—"}</td>
                        <td className="px-3 py-2.5">
                          <span
                            className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
                            style={{ background: "hsl(258 82% 64% / 0.12)", color: "hsl(var(--primary))" }}
                          >
                            {order.status}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground">
                          {order.reduceOnly ? "Yes" : "—"}
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground">
                          {order.createdAt ? new Date(order.createdAt).toLocaleTimeString() : "—"}
                        </td>
                        <td className="px-3 py-2.5">
                          <button
                            onClick={() => handleCancelOrder(order)}
                            disabled={cancelOrderMut.isPending}
                            className="px-2.5 py-1 rounded-md text-[10px] font-bold transition-all disabled:opacity-50"
                            style={{ border: "1px solid hsl(345 88% 58% / 0.4)", color: "hsl(345 88% 62%)" }}
                          >
                            Cancel
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
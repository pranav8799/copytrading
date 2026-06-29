import { useState, useMemo, useCallback, useEffect } from "react";
import {
  useListAccounts,
  useGetBalances,
  useGetSettings,
  useUpdateSettings,
  useSetTpsl,
  executeTrade,
  OrderPayloadSide,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Zap, CheckCircle2, Circle, Loader2, AlertTriangle, Save } from "lucide-react";

/* ── types ─────────────────────────────────────────────────── */
interface SelectedAccount {
  accountId: number;
  multiplier: number;
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

/* ── helpers ────────────────────────────────────────────────── */
const fmt = (v: number | string | null | undefined, decimals = 2): string => {
  const n = typeof v === "string" ? parseFloat(v) : v;
  if (n === null || n === undefined || isNaN(n as number)) return "—";
  return (n as number).toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
};

function StatusIcon({ status }: { status: OrderStatus }) {
  if (status === "success") return <CheckCircle2 className="w-3.5 h-3.5" style={{ color: "hsl(162 88% 42%)" }} />;
  if (status === "failed") return <AlertTriangle className="w-3.5 h-3.5" style={{ color: "hsl(345 88% 58%)" }} />;
  if (status === "executing") return <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: "hsl(var(--primary))" }} />;
  return <Circle className="w-3.5 h-3.5 text-muted-foreground" />;
}

/* ════════════════════════════════════════════════════════════
   Component
════════════════════════════════════════════════════════════ */
export function AutoTradePuncherPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  /* ── form state ── */
  const [side, setSide] = useState<OrderPayloadSide>("BUY");
  const [entryPrice, setEntryPrice] = useState("");
  const [quantity, setQuantity] = useState("");
  const [orderCount, setOrderCount] = useState(6);
  const [stepSize, setStepSize] = useState(50);
  const [tpPoints, setTpPoints] = useState(100);

  /* ── config sync state ── */
  const [configLoaded, setConfigLoaded] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState(false);

  /* ── execution state ── */
  const [isExecuting, setIsExecuting] = useState(false);
  const [orderStatuses, setOrderStatuses] = useState<Map<string, OrderStatus>>(new Map());
  const [orderErrors, setOrderErrors] = useState<Map<string, string>>(new Map());
  const [hasExecuted, setHasExecuted] = useState(false);

  /* ── data ── */
  const { data: accounts } = useListAccounts();
  const { data: balances } = useGetBalances();
  const { data: settings } = useGetSettings();
  const updateSettingsMut = useUpdateSettings();
  const tpslMut = useSetTpsl();

  /* ── load saved config into local state on first load ── */
  useEffect(() => {
    if (settings?.autoPunchConfig && !configLoaded) {
      const cfg = settings.autoPunchConfig as { orderCount?: number; stepSize?: number; tpPoints?: number };
      if (typeof cfg.orderCount === "number") setOrderCount(cfg.orderCount);
      if (typeof cfg.stepSize === "number") setStepSize(cfg.stepSize);
      if (typeof cfg.tpPoints === "number") setTpPoints(cfg.tpPoints);
      setConfigLoaded(true);
    }
  }, [settings, configLoaded]);

  const activeAccounts = (accounts ?? []).filter((a) => a.isActive);
  const selectedAccounts: SelectedAccount[] = settings?.selectedAccounts ?? [];

  const getAccountName = (id: number) =>
    activeAccounts.find((a) => a.id === id)?.name ?? `Account ${id}`;

  const getBalance = (id: number): string | null => {
    const b = balances?.find((b) => b.accountId === id);
    if (!b?.availableBalance) return null;
    const n = parseFloat(b.availableBalance);
    if (isNaN(n)) return b.availableBalance;
    return `$${fmt(n)}`;
  };

  /* ── save config to server ── */
  const handleSaveConfig = useCallback(async () => {
    setIsSaving(true);
    setLastSaved(false);
    updateSettingsMut.mutate(
      {
        data: {
          autoPunchConfig: { orderCount, stepSize, tpPoints },
        } as any,
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
          setLastSaved(true);
          setIsSaving(false);
          toast({ title: "Config saved ✓", description: "Trade Terminal will now use these settings." });
        },
        onError: (err: any) => {
          setIsSaving(false);
          toast({ title: "Failed to save config", description: err.message, variant: "destructive" });
        },
      }
    );
  }, [orderCount, stepSize, tpPoints, updateSettingsMut, queryClient, toast]);

  /* ── reset saved indicator when values change ── */
  useEffect(() => {
    setLastSaved(false);
  }, [orderCount, stepSize, tpPoints]);

  /* ── preview orders ── */
  const previewOrders: PreviewOrder[] = useMemo(() => {
    const entry = parseFloat(entryPrice);
    const qty = parseFloat(quantity);
    if (isNaN(entry) || entry <= 0 || isNaN(qty) || qty <= 0 || orderCount < 1) return [];

    return Array.from({ length: orderCount }, (_, i) => {
      const n = i + 1;
      const limitPrice = side === "BUY"
        ? entry - stepSize * n
        : entry + stepSize * n;
      const tpPrice = side === "BUY"
        ? limitPrice + tpPoints
        : limitPrice - tpPoints;
      return { index: n, limitPrice, tpPrice, quantity: qty, status: "pending" as OrderStatus };
    });
  }, [side, entryPrice, quantity, orderCount, stepSize, tpPoints]);

  /* ── order key helper ── */
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

  const validate = (): string | null => {
    if (selectedAccounts.length === 0) return "No accounts selected. Go to the Accounts page to select accounts.";
    if (!entryPrice || isNaN(parseFloat(entryPrice)) || parseFloat(entryPrice) <= 0) return "Enter a valid entry price.";
    if (!quantity || isNaN(parseFloat(quantity)) || parseFloat(quantity) <= 0) return "Enter a valid quantity.";
    if (orderCount < 1 || orderCount > 20) return "Order count must be between 1 and 20.";
    if (stepSize <= 0) return "Step size must be greater than 0.";
    if (tpPoints <= 0) return "TP points must be greater than 0.";
    return null;
  };

  const handleExecute = useCallback(async () => {
    const err = validate();
    if (err) { toast({ title: "Validation Error", description: err, variant: "destructive" }); return; }

    resetExecution();
    setIsExecuting(true);

    const baseQty = parseFloat(quantity);
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
              quantity: baseQty * multiplier,
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
            data: {
              accountIds: [accountId],
              symbol: "XAUUSDT",
              tpPrice: order.tpPrice,
            },
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
        : `Completed with errors — ${totalOk} ok, ${totalFailed} failed`,
      description: totalFailed === 0
        ? `${previewOrders.length} limit orders across ${selectedAccounts.length} account${selectedAccounts.length !== 1 ? "s" : ""}.`
        : "Check the order grid for details.",
      variant: totalFailed === 0 ? "default" : "destructive",
    });
  }, [previewOrders, selectedAccounts, side, quantity, tpslMut, toast]);

  /* ── derived ── */
  const hasValidEntry = !isNaN(parseFloat(entryPrice)) && parseFloat(entryPrice) > 0;
  const hasValidQty = !isNaN(parseFloat(quantity)) && parseFloat(quantity) > 0;
  const canExecute = hasValidEntry && hasValidQty && selectedAccounts.length > 0 && !isExecuting;

  const totalOrderCount = previewOrders.length * selectedAccounts.length;
  const doneCount = [...orderStatuses.values()].filter((s) => s === "success" || s === "failed").length;
  const successCount = [...orderStatuses.values()].filter((s) => s === "success").length;
  const failedCount = [...orderStatuses.values()].filter((s) => s === "failed").length;
  const progress = totalOrderCount > 0 ? (doneCount / totalOrderCount) * 100 : 0;

  return (
    <div className="flex flex-col h-screen overflow-hidden">

      {/* Header */}
      <div
        className="flex items-center justify-between px-5 py-3 shrink-0"
        style={{ borderBottom: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }}
      >
        <div className="flex items-center gap-2.5">
          <Zap className="w-5 h-5" style={{ color: "hsl(var(--primary))" }} />
          <span className="font-semibold text-base" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            Auto Trade Puncher
          </span>
          <span
            className="text-xs px-2 py-0.5 rounded-full font-medium"
            style={{ background: "hsl(258 82% 64% / 0.15)", color: "hsl(var(--primary))" }}
          >
            {selectedAccounts.length} account{selectedAccounts.length !== 1 ? "s" : ""}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {/* Save config button in header */}
          <button
            onClick={handleSaveConfig}
            disabled={isSaving}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all disabled:opacity-50"
            style={lastSaved
              ? { background: "hsl(162 88% 42% / 0.15)", color: "hsl(162 88% 42%)", border: "1px solid hsl(162 88% 42% / 0.3)" }
              : { background: "hsl(258 82% 64% / 0.12)", color: "hsl(var(--primary))", border: "1px solid hsl(258 82% 64% / 0.3)" }}
          >
            {isSaving
              ? <><Loader2 className="w-3 h-3 animate-spin" /> Saving…</>
              : lastSaved
                ? <><CheckCircle2 className="w-3 h-3" /> Saved ✓</>
                : <><Save className="w-3 h-3" /> Save Config for Trade Terminal</>}
          </button>
          <span className="text-xs text-muted-foreground">
            Limit orders punched automatically at fixed intervals
          </span>
        </div>
      </div>

      {/* Body — two columns */}
      <div className="flex flex-1 min-h-0">

        {/* ── LEFT: Config panel ── */}
        <div
          className="w-72 shrink-0 flex flex-col overflow-y-auto p-4 gap-4"
          style={{ borderRight: "1px solid hsl(var(--border))" }}
        >

          {/* Side */}
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1.5 block">
              Direction
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => { setSide("BUY"); resetExecution(); }}
                className="py-2.5 rounded-xl font-bold text-sm tracking-wide transition-all"
                style={side === "BUY"
                  ? { background: "hsl(162 88% 42%)", color: "#fff", boxShadow: "0 0 18px hsl(162 88% 42% / 0.3)" }
                  : { border: "1px solid hsl(162 88% 42% / 0.35)", color: "hsl(162 88% 48%)", background: "hsl(162 88% 42% / 0.06)" }}
              >▲ BUY</button>
              <button
                onClick={() => { setSide("SELL"); resetExecution(); }}
                className="py-2.5 rounded-xl font-bold text-sm tracking-wide transition-all"
                style={side === "SELL"
                  ? { background: "hsl(345 88% 58%)", color: "#fff", boxShadow: "0 0 18px hsl(345 88% 58% / 0.3)" }
                  : { border: "1px solid hsl(345 88% 58% / 0.35)", color: "hsl(345 88% 64%)", background: "hsl(345 88% 58% / 0.06)" }}
              >▼ SELL</button>
            </div>
          </div>

          {/* Entry price */}
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1 block">
              Entry Price
            </label>
            <input
              className="w-full rounded-lg px-3 py-2.5 text-sm font-mono bg-input border border-border focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
              type="number" min="0" step="any"
              value={entryPrice}
              onChange={(e) => { setEntryPrice(e.target.value); resetExecution(); }}
              placeholder="e.g. 4000"
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              {side === "BUY" ? "Limits placed BELOW this price." : "Limits placed ABOVE this price."}
            </p>
          </div>

          {/* Quantity */}
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1 block">
              Base Quantity
            </label>
            <input
              className="w-full rounded-lg px-3 py-2.5 text-sm font-mono bg-input border border-border focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
              type="number" min="0" step="any"
              value={quantity}
              onChange={(e) => { setQuantity(e.target.value); resetExecution(); }}
              placeholder="e.g. 1.0"
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              Per account = base × account's multiplier.
            </p>
          </div>

          <div className="border-t border-border" />

          {/* Order count */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Number of Orders
              </label>
              <span className="text-xs font-bold" style={{ color: "hsl(var(--primary))" }}>{orderCount}</span>
            </div>
            <input
              type="range" min={1} max={20}
              value={orderCount}
              onChange={(e) => { setOrderCount(Number(e.target.value)); resetExecution(); }}
              className="w-full accent-primary"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
              <span>1</span><span>20</span>
            </div>
          </div>

          {/* Step size */}
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1 block">
              Step Size (points)
            </label>
            <input
              className="w-full rounded-lg px-3 py-2.5 text-sm font-mono bg-input border border-border focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
              type="number" min="1" step="1"
              value={stepSize}
              onChange={(e) => { setStepSize(Math.max(1, Number(e.target.value))); resetExecution(); }}
              placeholder="50"
            />
          </div>

          {/* TP points */}
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1 block">
              Take Profit (points)
            </label>
            <input
              className="w-full rounded-lg px-3 py-2.5 text-sm font-mono bg-input border border-border focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
              type="number" min="1" step="1"
              value={tpPoints}
              onChange={(e) => { setTpPoints(Math.max(1, Number(e.target.value))); resetExecution(); }}
              placeholder="100"
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              TP = limit price {side === "BUY" ? "+" : "−"} {tpPoints} pts per order.
            </p>
          </div>

          {/* Save config inline reminder */}
          {!lastSaved && configLoaded && (
            <div
              className="rounded-lg px-3 py-2 text-[10px] flex items-center justify-between gap-2"
              style={{ background: "hsl(38 92% 50% / 0.08)", border: "1px solid hsl(38 92% 50% / 0.25)", color: "hsl(38 92% 38%)" }}
            >
              <span>Unsaved changes — Trade Terminal won't see them yet.</span>
              <button
                onClick={handleSaveConfig}
                disabled={isSaving}
                className="shrink-0 font-bold underline underline-offset-2 hover:opacity-70 disabled:opacity-50"
              >
                {isSaving ? "Saving…" : "Save"}
              </button>
            </div>
          )}

          <div className="border-t border-border" />

          {/* Selected accounts (read-only) */}
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2 block">
              Trading Accounts ({selectedAccounts.length})
            </label>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {selectedAccounts.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2 px-2 rounded-lg" style={{ background: "hsl(var(--muted))" }}>
                  No accounts selected. Go to the Accounts page to select accounts.
                </p>
              ) : (
                selectedAccounts.map(({ accountId, multiplier }) => {
                  const bal = getBalance(accountId);
                  return (
                    <div key={accountId} className="flex items-center gap-2 px-2 py-1.5 rounded-lg"
                      style={{ background: "hsl(258 82% 64% / 0.06)" }}>
                      <span className="flex-1 text-xs font-medium truncate">{getAccountName(accountId)}</span>
                      {bal && (
                        <span className="text-[10px] font-mono shrink-0" style={{ color: "hsl(162 88% 42%)" }}>
                          {bal}
                        </span>
                      )}
                      <span className="text-[10px] font-bold font-mono shrink-0 px-1.5 py-0.5 rounded"
                        style={{ background: "hsl(258 82% 64% / 0.15)", color: "hsl(var(--primary))" }}>
                        {multiplier}×
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Summary pill */}
          {previewOrders.length > 0 && selectedAccounts.length > 0 && (
            <div className="rounded-xl px-3 py-2.5 text-xs space-y-1"
              style={{ background: "hsl(258 82% 64% / 0.08)", border: "1px solid hsl(258 82% 64% / 0.2)" }}>
              <p className="font-semibold" style={{ color: "hsl(var(--primary))" }}>Summary</p>
              <p className="text-muted-foreground">
                {previewOrders.length} limit orders × {selectedAccounts.length} account{selectedAccounts.length !== 1 ? "s" : ""} ={" "}
                <span className="font-bold text-foreground">{totalOrderCount} total orders</span>
              </p>
              <p className="text-muted-foreground">
                Price range:{" "}
                <span className="font-mono text-foreground">
                  {fmt(previewOrders[previewOrders.length - 1]?.limitPrice)} → {fmt(previewOrders[0]?.limitPrice)}
                </span>
              </p>
            </div>
          )}

          {/* Execute button */}
          <button
            onClick={handleExecute}
            disabled={!canExecute}
            className="w-full py-3 rounded-xl font-bold text-sm tracking-wide transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
            style={side === "BUY"
              ? { background: "hsl(162 88% 42%)", color: "#fff", boxShadow: canExecute ? "0 0 16px hsl(162 88% 42% / 0.35)" : "none" }
              : { background: "hsl(345 88% 58%)", color: "#fff", boxShadow: canExecute ? "0 0 16px hsl(345 88% 58% / 0.35)" : "none" }}
          >
            {isExecuting
              ? `Punching… (${doneCount}/${totalOrderCount})`
              : hasExecuted
                ? "Punch Again"
                : `Punch ${previewOrders.length} Limit Order${previewOrders.length !== 1 ? "s" : ""}`}
          </button>

          {hasExecuted && !isExecuting && (
            <button
              onClick={resetExecution}
              className="w-full py-2 rounded-xl text-xs font-semibold transition-colors"
              style={{ border: "1px solid hsl(var(--border))", color: "hsl(var(--muted-foreground))" }}
            >
              Reset Status
            </button>
          )}
        </div>

        {/* ── RIGHT: Preview / live grid ── */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">

          {/* Progress bar */}
          {(isExecuting || hasExecuted) && totalOrderCount > 0 && (
            <div className="shrink-0 px-5 py-3 space-y-1.5" style={{ borderBottom: "1px solid hsl(var(--border))" }}>
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-foreground">
                  {isExecuting ? "Punching orders…" : "Execution complete"}
                </span>
                <span className="text-muted-foreground">
                  {successCount > 0 && <span style={{ color: "hsl(162 88% 42%)" }}>{successCount} ok</span>}
                  {successCount > 0 && failedCount > 0 && " · "}
                  {failedCount > 0 && <span style={{ color: "hsl(345 88% 58%)" }}>{failedCount} failed</span>}
                  {!isExecuting && failedCount === 0 && (
                    <span style={{ color: "hsl(162 88% 42%)" }}>All {successCount} succeeded ✓</span>
                  )}
                </span>
              </div>
              <div className="w-full rounded-full overflow-hidden" style={{ height: 4, background: "hsl(var(--muted))" }}>
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${progress}%`,
                    background: failedCount > 0 ? "hsl(345 88% 58%)" : "hsl(162 88% 42%)",
                  }}
                />
              </div>
            </div>
          )}

          {/* Column headers */}
          <div className="shrink-0 px-5 py-2" style={{ borderBottom: "1px solid hsl(var(--border))", background: "hsl(var(--muted))" }}>
            {previewOrders.length === 0 ? (
              <p className="text-xs text-muted-foreground">Configure the form to preview orders.</p>
            ) : (
              <div
                className="grid text-[10px] font-semibold uppercase tracking-widest text-muted-foreground"
                style={{ gridTemplateColumns: `2.5rem 1fr repeat(${Math.min(selectedAccounts.length, 6)}, 1fr) 7rem 7rem` }}
              >
                <span>#</span>
                <span>Limit Price</span>
                {selectedAccounts.slice(0, 6).map(({ accountId }) => (
                  <span key={accountId} className="truncate">{getAccountName(accountId)}</span>
                ))}
                {selectedAccounts.length > 6 && <span>+{selectedAccounts.length - 6} more</span>}
                <span>TP Price</span>
                <span>Qty (base)</span>
              </div>
            )}
          </div>

          {/* Order rows */}
          <div className="flex-1 overflow-y-auto">
            {previewOrders.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
                <Zap className="w-10 h-10 opacity-20" />
                <p className="text-sm font-medium">No orders to preview yet</p>
                <p className="text-xs text-center max-w-xs">
                  Enter an entry price and quantity on the left to see your limit order ladder.
                </p>
              </div>
            ) : (
              previewOrders.map((order, rowIdx) => {
                const isBuy = side === "BUY";
                const rowBg = rowIdx % 2 === 0 ? "transparent" : "hsl(var(--muted) / 0.3)";

                const rowStatuses = selectedAccounts.map(
                  ({ accountId }) => orderStatuses.get(orderKey(order.index, accountId)) ?? "pending"
                );
                const rowFailed = rowStatuses.some((s) => s === "failed");
                const rowExecuting = rowStatuses.some((s) => s === "executing");
                const rowAllDone = rowStatuses.every((s) => s === "success" || s === "failed");

                return (
                  <div
                    key={order.index}
                    className="px-5 py-2.5 transition-colors"
                    style={{
                      background: rowExecuting
                        ? "hsl(258 82% 64% / 0.06)"
                        : rowFailed
                          ? "hsl(345 88% 58% / 0.05)"
                          : rowAllDone
                            ? "hsl(162 88% 42% / 0.04)"
                            : rowBg,
                      borderBottom: "1px solid hsl(var(--border) / 0.5)",
                    }}
                  >
                    <div
                      className="grid items-center gap-2 text-xs"
                      style={{ gridTemplateColumns: `2.5rem 1fr repeat(${Math.min(selectedAccounts.length, 6)}, 1fr) 7rem 7rem` }}
                    >
                      <span className="font-bold text-muted-foreground">#{order.index}</span>

                      <span className="font-mono font-bold"
                        style={{ color: isBuy ? "hsl(345 88% 58%)" : "hsl(162 88% 42%)" }}>
                        {fmt(order.limitPrice)}
                      </span>

                      {selectedAccounts.slice(0, 6).map(({ accountId }) => {
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
                      {selectedAccounts.length > 6 && (
                        <span className="text-[10px] text-muted-foreground">…</span>
                      )}

                      <span className="font-mono text-muted-foreground">
                        {fmt(order.tpPrice)}{" "}
                        <span className="text-[10px]" style={{ color: "hsl(162 88% 42%)" }}>
                          (+{tpPoints})
                        </span>
                      </span>

                      <span className="font-mono text-muted-foreground">
                        {parseFloat(quantity) || "—"}
                      </span>
                    </div>

                    {rowFailed && (
                      <div className="mt-1.5 pl-8 flex flex-wrap gap-2">
                        {selectedAccounts.map(({ accountId }) => {
                          const key = orderKey(order.index, accountId);
                          const errMsg = orderErrors.get(key);
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

          {/* Footer legend */}
          {previewOrders.length > 0 && (
            <div
              className="shrink-0 px-5 py-2 flex items-center gap-6 text-[10px] text-muted-foreground"
              style={{ borderTop: "1px solid hsl(var(--border))" }}
            >
              <span className="flex items-center gap-1.5"><Circle className="w-3 h-3" /> Pending</span>
              <span className="flex items-center gap-1.5"><Loader2 className="w-3 h-3" /> Executing</span>
              <span className="flex items-center gap-1.5" style={{ color: "hsl(162 88% 42%)" }}>
                <CheckCircle2 className="w-3 h-3" /> Success
              </span>
              <span className="flex items-center gap-1.5" style={{ color: "hsl(345 88% 58%)" }}>
                <AlertTriangle className="w-3 h-3" /> Failed
              </span>
              <span className="ml-auto">TP set via separate API call after each order fills.</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
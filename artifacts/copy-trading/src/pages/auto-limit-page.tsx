import { useState, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { useListAccounts } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface LadderRow {
  level: number;
  limitPrice: number;
  tpPrice: number;
  profit: number;
}

interface OrderResult {
  limitPrice: number;
  tpPrice: number;
  orderId?: string;
  error?: string;
}

interface AutoLimitAccountResult {
  accountId: number;
  accountName: string;
  orders: OrderResult[];
}

interface PunchResult {
  success: boolean;
  summary: {
    totalAccounts: number;
    ordersPerAccount: number;
    totalPlaced: number;
    totalFailed: number;
  };
  results: AutoLimitAccountResult[];
}

interface PreviewResult {
  success: boolean;
  ladder: LadderRow[];
}

// ─── Config defaults ───────────────────────────────────────────────────────────

const DEFAULTS = {
  symbol: "",
  entryPrice: "",
  quantity: "",
  side: "buy" as "buy" | "sell",
  orderCount: 6,
  stepSize: 50,
  tpPoints: 100,
};

async function customFetch<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Request failed with status ${response.status}: ${response.statusText}${
        text ? `: ${text}` : ""
      }`
    );
  }

  return response.json() as Promise<T>;
}

// ─── Small UI primitives ───────────────────────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-1.5">
      {children}
    </label>
  );
}

function Input({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white",
        "placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500",
        "transition-colors",
        className
      )}
      {...props}
    />
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

// ─── Ladder preview ────────────────────────────────────────────────────────────

function LadderPreview({
  ladder,
  side,
}: {
  ladder: LadderRow[];
  side: "buy" | "sell";
}) {
  if (!ladder.length) return null;

  return (
    <div className="rounded-xl border border-slate-700/60 overflow-hidden">
      <div className="px-4 py-3 bg-slate-800/60 border-b border-slate-700/60 flex items-center justify-between">
        <span className="text-sm font-semibold text-white">Order Ladder Preview</span>
        <span className="text-xs text-slate-400">{ladder.length} levels</span>
      </div>
      <div className="divide-y divide-slate-800">
        {ladder.map((row) => (
          <div
            key={row.level}
            className="flex items-center gap-3 px-4 py-3 hover:bg-slate-800/30 transition-colors"
          >
            <div className="w-7 h-7 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-mono text-slate-400">{row.level}</span>
            </div>
            <div className="flex-1 flex items-center gap-6 min-w-0">
              <div>
                <div className="text-xs text-slate-500 mb-0.5">Limit</div>
                <div
                  className={cn(
                    "text-sm font-mono font-semibold",
                    side === "buy" ? "text-red-400" : "text-emerald-400"
                  )}
                >
                  {row.limitPrice.toLocaleString()}
                </div>
              </div>
              <div className="text-slate-600 text-xs">→</div>
              <div>
                <div className="text-xs text-slate-500 mb-0.5">Take Profit</div>
                <div className="text-sm font-mono font-semibold text-emerald-400">
                  {row.tpPrice.toLocaleString()}
                </div>
              </div>
              <div className="ml-auto">
                <div className="text-xs text-slate-500 mb-0.5">Profit</div>
                <div className="text-sm font-mono text-emerald-400">
                  +{row.profit} pts
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Result panel ──────────────────────────────────────────────────────────────

function ResultPanel({ result }: { result: PunchResult }) {
  const [expanded, setExpanded] = useState<number | null>(null);
  const { summary, results } = result;

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Accounts", value: summary.totalAccounts, color: "text-white" },
          { label: "Orders/Acct", value: summary.ordersPerAccount, color: "text-white" },
          { label: "Placed", value: summary.totalPlaced, color: "text-emerald-400" },
          {
            label: "Failed",
            value: summary.totalFailed,
            color: summary.totalFailed > 0 ? "text-red-400" : "text-slate-500",
          },
        ].map((s) => (
          <div
            key={s.label}
            className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-4 text-center"
          >
            <div className={cn("text-2xl font-bold font-mono", s.color)}>
              {s.value}
            </div>
            <div className="text-xs text-slate-500 mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Per-account breakdown */}
      <div className="space-y-2">
        {results.map((acct) => {
          const placed = acct.orders.filter((o) => !o.error).length;
          const failed = acct.orders.filter((o) => !!o.error).length;
          const isOpen = expanded === acct.accountId;
          return (
            <div
              key={acct.accountId}
              className="rounded-xl border border-slate-700/60 overflow-hidden"
            >
              <button
                onClick={() => setExpanded(isOpen ? null : acct.accountId)}
                className="w-full flex items-center gap-3 px-4 py-3 bg-slate-800/40 hover:bg-slate-800/70 transition-colors text-left"
              >
                <div className="flex-1 flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-indigo-500 flex-shrink-0" />
                  <span className="text-sm font-medium text-white truncate">
                    {acct.accountName}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs flex-shrink-0">
                  <span className="text-emerald-400 font-mono">✓ {placed}</span>
                  {failed > 0 && (
                    <span className="text-red-400 font-mono">✗ {failed}</span>
                  )}
                  <span className="text-slate-500">{isOpen ? "▲" : "▼"}</span>
                </div>
              </button>
              {isOpen && (
                <div className="divide-y divide-slate-800/60">
                  {acct.orders.map((order, idx) => (
                    <div
                      key={idx}
                      className={cn(
                        "flex items-center gap-4 px-4 py-2.5 text-xs font-mono",
                        order.error ? "bg-red-950/20" : "bg-slate-900/20"
                      )}
                    >
                      <span className="text-slate-500 w-4">{idx + 1}</span>
                      <span className={cn(order.error ? "text-red-400" : "text-white")}>
                        Limit {order.limitPrice.toLocaleString()}
                      </span>
                      {!order.error && (
                        <>
                          <span className="text-slate-600">→ TP</span>
                          <span className="text-emerald-400">
                            {order.tpPrice.toLocaleString()}
                          </span>
                          <span className="ml-auto text-slate-500 truncate">
                            {order.orderId}
                          </span>
                        </>
                      )}
                      {order.error && (
                        <span className="ml-auto text-red-400 truncate">
                          {order.error}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export function AutoLimitPage() {
  const { toast } = useToast();
  const [config, setConfig] = useState(DEFAULTS);
  const [ladder, setLadder] = useState<LadderRow[]>([]);
  const [punchResult, setPunchResult] = useState<PunchResult | null>(null);
  const [accountMode, setAccountMode] = useState<"all" | "selected">("all");
  const [selectedAccountIds, setSelectedAccountIds] = useState<number[]>([]);

  // Use the generated hook — returns Account[] directly
  const { data: accounts = [] } = useListAccounts();

  // Preview — computed client-side, no network call needed
  const previewMutation = useMutation({
    mutationFn: async () => {
      return customFetch<PreviewResult>("/api/auto-limit/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entryPrice: Number(config.entryPrice),
          side: config.side,
          orderCount: config.orderCount,
          stepSize: config.stepSize,
          tpPoints: config.tpPoints,
        }),
      });
    },
    onSuccess: (data) => {
      if (data.success) setLadder(data.ladder);
    },
    onError: () => {
      toast({ title: "Preview failed", variant: "destructive" });
    },
  });

  // Punch
  const punchMutation = useMutation({
    mutationFn: async () => {
      const accountIds: number[] | "all" =
        accountMode === "all" ? "all" : selectedAccountIds;
      return customFetch<PunchResult>("/api/auto-limit/punch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: config.symbol,
          entryPrice: Number(config.entryPrice),
          quantity: Number(config.quantity),
          side: config.side,
          orderCount: config.orderCount,
          stepSize: config.stepSize,
          tpPoints: config.tpPoints,
          accountIds,
        }),
      });
    },
    onSuccess: (data: PunchResult) => {
      setPunchResult(data);
      toast({
        title: `${data.summary.totalPlaced} orders placed`,
        description: `Across ${data.summary.totalAccounts} account(s)`,
      });
    },
    onError: () => {
      toast({ title: "Failed to place orders", variant: "destructive" });
    },
  });

  const set = useCallback(
    (key: keyof typeof DEFAULTS, value: string | number) =>
      setConfig((c) => ({ ...c, [key]: value })),
    []
  );

  const canPunch =
    config.symbol &&
    config.entryPrice &&
    config.quantity &&
    (accountMode === "all" || selectedAccountIds.length > 0);

  return (
    <div className="max-w-4xl mx-auto py-6 px-4 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Auto Limit Orders</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Place a ladder of limit orders with automatic take-profit on all accounts
          </p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20">
          <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
          <span className="text-xs text-indigo-300 font-medium">Live</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* ── Config panel ── */}
        <div className="lg:col-span-2 space-y-5">
          <div className="rounded-xl border border-slate-700/60 bg-slate-800/30 p-5 space-y-4">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Trade Setup
            </p>

            <Field label="Direction">
              <div className="flex rounded-lg border border-slate-700 overflow-hidden">
                {(["buy", "sell"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => set("side", s)}
                    className={cn(
                      "flex-1 py-2.5 text-sm font-semibold capitalize transition-colors",
                      config.side === s
                        ? s === "buy"
                          ? "bg-emerald-600 text-white"
                          : "bg-red-600 text-white"
                        : "bg-slate-900 text-slate-400 hover:text-white"
                    )}
                  >
                    {s === "buy" ? "▲ Buy" : "▼ Sell"}
                  </button>
                ))}
              </div>
            </Field>

            <Field label="Symbol">
              <Input
                placeholder="e.g. BTCUSDT"
                value={config.symbol}
                onChange={(e) => set("symbol", e.target.value.toUpperCase())}
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Entry Price">
                <Input
                  type="number"
                  placeholder="4000"
                  value={config.entryPrice}
                  onChange={(e) => set("entryPrice", e.target.value)}
                />
              </Field>
              <Field label="Quantity">
                <Input
                  type="number"
                  placeholder="1"
                  value={config.quantity}
                  onChange={(e) => set("quantity", e.target.value)}
                />
              </Field>
            </div>
          </div>

          <div className="rounded-xl border border-slate-700/60 bg-slate-800/30 p-5 space-y-4">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Ladder Config
            </p>

            <div className="grid grid-cols-3 gap-3">
              <Field label="# Orders">
                <Input
                  type="number"
                  min={1}
                  max={20}
                  value={config.orderCount}
                  onChange={(e) =>
                    set("orderCount", Math.max(1, parseInt(e.target.value) || 1))
                  }
                />
              </Field>
              <Field label="Step Size">
                <Input
                  type="number"
                  min={1}
                  value={config.stepSize}
                  onChange={(e) =>
                    set("stepSize", Math.max(1, parseInt(e.target.value) || 1))
                  }
                />
              </Field>
              <Field label="TP Points">
                <Input
                  type="number"
                  min={1}
                  value={config.tpPoints}
                  onChange={(e) =>
                    set("tpPoints", Math.max(1, parseInt(e.target.value) || 1))
                  }
                />
              </Field>
            </div>

            <button
              onClick={() => previewMutation.mutate()}
              disabled={!config.entryPrice || previewMutation.isPending}
              className={cn(
                "w-full py-2.5 rounded-lg text-sm font-medium border transition-colors",
                "border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-white",
                "disabled:opacity-40 disabled:cursor-not-allowed"
              )}
            >
              {previewMutation.isPending ? "Calculating…" : "Preview Ladder"}
            </button>
          </div>

          {/* Account selector */}
          <div className="rounded-xl border border-slate-700/60 bg-slate-800/30 p-5 space-y-3">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Target Accounts
            </p>
            <div className="flex rounded-lg border border-slate-700 overflow-hidden">
              {(["all", "selected"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setAccountMode(m)}
                  className={cn(
                    "flex-1 py-2 text-sm font-medium capitalize transition-colors",
                    accountMode === m
                      ? "bg-indigo-600 text-white"
                      : "bg-slate-900 text-slate-400 hover:text-white"
                  )}
                >
                  {m === "all" ? "All Accounts" : "Select Accounts"}
                </button>
              ))}
            </div>

            {accountMode === "selected" && (
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {accounts.length === 0 && (
                  <p className="text-xs text-slate-500 py-2 text-center">
                    No accounts found
                  </p>
                )}
                {accounts.map((acct) => {
                  const checked = selectedAccountIds.includes(acct.id);
                  return (
                    <label
                      key={acct.id}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors",
                        checked
                          ? "bg-indigo-500/10 border border-indigo-500/30"
                          : "bg-slate-900/40 border border-transparent hover:border-slate-700"
                      )}
                    >
                      <input
                        type="checkbox"
                        className="accent-indigo-500"
                        checked={checked}
                        onChange={(e) =>
                          setSelectedAccountIds((ids) =>
                            e.target.checked
                              ? [...ids, acct.id]
                              : ids.filter((id) => id !== acct.id)
                          )
                        }
                      />
                      <span className="text-sm text-white truncate">
                        {acct.name}
                      </span>
                      {!acct.isActive && (
                        <span className="ml-auto text-xs text-slate-500">
                          inactive
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          {/* Punch button */}
          <button
            onClick={() => punchMutation.mutate()}
            disabled={!canPunch || punchMutation.isPending}
            className={cn(
              "w-full py-3.5 rounded-xl text-sm font-bold tracking-wide transition-all",
              config.side === "buy"
                ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/40"
                : "bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-900/40",
              "disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
            )}
          >
            {punchMutation.isPending
              ? "Placing Orders…"
              : `Punch ${config.orderCount} Limit Orders`}
          </button>
        </div>

        {/* ── Right panel: ladder + results ── */}
        <div className="lg:col-span-3 space-y-5">
          {/* Live summary strip */}
          {config.entryPrice && (
            <div className="grid grid-cols-3 gap-3">
              {[
                {
                  label: "Entry",
                  value: Number(config.entryPrice).toLocaleString(),
                  color: "text-white",
                },
                {
                  label: `Lowest ${config.side === "buy" ? "Bid" : "Ask"}`,
                  value: (
                    Number(config.entryPrice) +
                    (config.side === "buy" ? -1 : 1) *
                      config.stepSize *
                      config.orderCount
                  ).toLocaleString(),
                  color: config.side === "buy" ? "text-red-400" : "text-emerald-400",
                },
                {
                  label: "TP per level",
                  value: `+${config.tpPoints} pts`,
                  color: "text-emerald-400",
                },
              ].map((s) => (
                <div
                  key={s.label}
                  className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-4 text-center"
                >
                  <div className={cn("text-lg font-bold font-mono", s.color)}>
                    {s.value}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">{s.label}</div>
                </div>
              ))}
            </div>
          )}

          {/* Ladder preview */}
          {ladder.length > 0 && !punchResult && (
            <LadderPreview ladder={ladder} side={config.side} />
          )}

          {/* Empty state */}
          {!ladder.length && !punchResult && (
            <div className="rounded-xl border border-dashed border-slate-700/60 flex flex-col items-center justify-center py-20 text-center">
              <div className="text-4xl mb-3">📊</div>
              <p className="text-sm font-medium text-slate-300">
                Set your config and hit Preview
              </p>
              <p className="text-xs text-slate-500 mt-1 max-w-xs">
                The order ladder will appear here before you punch
              </p>
            </div>
          )}

          {/* Punch results */}
          {punchResult && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-white">
                  Execution Results
                </p>
                <button
                  onClick={() => {
                    setPunchResult(null);
                    setLadder([]);
                  }}
                  className="text-xs text-slate-400 hover:text-white transition-colors"
                >
                  ← New ladder
                </button>
              </div>
              <ResultPanel result={punchResult} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
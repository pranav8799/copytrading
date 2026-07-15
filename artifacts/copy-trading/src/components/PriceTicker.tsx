import { useRef } from "react";
import { useGetTicker, getGetTickerQueryKey } from "@workspace/api-client-react";
import { TrendingUp, TrendingDown } from "lucide-react";

const SYMBOLS = ["XAUUSDT", "XAGUSDT", "BTCUSDT", "ETHUSDT", "CLUSDT"] as const;

function fmtPrice(v: string | number | undefined, decimals = 2) {
  if (v === undefined || v === null) return "—";
  const n = typeof v === "string" ? parseFloat(v) : v;
  if (isNaN(n)) return "—";
  return n.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function TickerItem({ symbol }: { symbol: string }) {
  const { data, isLoading } = useGetTicker(
    { symbol },
    { query: { queryKey: getGetTickerQueryKey({ symbol }), refetchInterval: 4000, staleTime: 2000 } }
  );

  // Track previous price to color the price on tick direction (up/down flash)
  const prevRef = useRef<number | null>(null);
  const current = data?.lastPrice != null ? parseFloat(String(data.lastPrice)) : null;
  const prev = prevRef.current;
  const direction = current != null && prev != null ? (current > prev ? "up" : current < prev ? "down" : null) : null;
  if (current != null) prevRef.current = current;

  const pctRaw = data?.priceChangePct24h;
  const pct = pctRaw != null ? parseFloat(String(pctRaw)) : null;

  return (
    <div className="flex items-center gap-2.5 px-4 shrink-0" style={{ borderRight: "1px solid hsl(var(--border))" }}>
      <span className="text-[12px] font-bold text-muted-foreground">{symbol.replace("USDT", "")}</span>
      {isLoading && !data ? (
        <span className="text-xs text-muted-foreground">…</span>
      ) : (
        <>
          <span
            className="text-sm font-mono font-bold transition-colors"
            style={{
              color:
                direction === "up" ? "hsl(162 88% 42%)" :
                direction === "down" ? "hsl(345 88% 58%)" :
                "hsl(var(--foreground))",
            }}
          >
            {fmtPrice(data?.lastPrice)}
          </span>
          {pct != null && !isNaN(pct) && (
            <span
              className="flex items-center gap-0.5 text-[11px] font-semibold"
              style={{ color: pct >= 0 ? "hsl(162 88% 42%)" : "hsl(345 88% 58%)" }}
            >
              {pct >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {pct >= 0 ? "+" : ""}{pct.toFixed(2)}%
            </span>
          )}
        </>
      )}
    </div>
  );
}

export function PriceTicker() {
  return (
    <div
      className="flex items-stretch shrink-0 overflow-x-auto"
      style={{ height: 44, background: "hsl(var(--card))", borderBottom: "1px solid hsl(var(--border))" }}
    >
      <div
        className="flex items-center shrink-0 pl-4 pr-4"
        style={{ borderRight: "1px solid hsl(var(--border))" }}
      >
        <span
          className="font-bold text-sm tracking-wide whitespace-nowrap"
          style={{ color: "hsl(38 92% 45%)", fontFamily: "'Space Grotesk', sans-serif" }}
        >
          MY TRADE STUDY
        </span>
      </div>
      <div className="flex-1 flex items-center justify-center">
        {SYMBOLS.map((s) => (
          <TickerItem key={s} symbol={s} />
        ))}
      </div>
    </div>
  );
}
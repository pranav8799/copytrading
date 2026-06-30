import { useGetDashboard } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Users,
  UserCheck,
  Layers,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  Wallet,
} from "lucide-react";

const fmtMoney = (v?: number | null) => {
  if (v == null || isNaN(v)) return "0.00";
  return Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export function DashboardPage() {
  const { data: dashboard, isLoading } = useGetDashboard();

  if (isLoading) {
    return (
      <div className="p-8 space-y-6">
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-28 w-full" />)}
        </div>
      </div>
    );
  }

  if (!dashboard) {
    return <div className="p-8">No data available</div>;
  }

  const pnlPositive = (dashboard.totalUnrealisedPnl ?? 0) >= 0;

  const statCards = [
    {
      label: "Total Accounts",
      value: dashboard.totalAccounts,
      icon: Users,
      color: "hsl(258 82% 64%)",
      bg: "hsl(258 82% 64% / 0.12)",
    },
    {
      label: "Active Accounts",
      value: dashboard.activeAccounts,
      icon: UserCheck,
      color: "hsl(162 88% 42%)",
      bg: "hsl(162 88% 42% / 0.12)",
    },
    {
      label: "Total Open Positions",
      value: dashboard.totalPositions,
      icon: Layers,
      color: "hsl(38 92% 50%)",
      bg: "hsl(38 92% 50% / 0.12)",
    },
  ];

  const recentExecutions = (dashboard.recentExecutions ?? []).slice(0, 10);

  return (
    <div className="p-8 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground mt-1">Overview of your copy trading operation.</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map(({ label, value, icon: Icon, color, bg }) => (
          <Card
            key={label}
            className="border-border/60 transition-all hover:shadow-md hover:-translate-y-0.5"
            style={{ background: "hsl(var(--card))" }}
          >
            <CardContent className="p-5 flex items-center justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
                <p className="text-3xl font-bold mt-2 text-foreground">{value ?? 0}</p>
              </div>
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: bg }}
              >
                <Icon className="w-5 h-5" style={{ color }} />
              </div>
            </CardContent>
          </Card>
        ))}

        {/* PnL card, styled distinctly */}
        <Card
          className="border-border/60 transition-all hover:shadow-md hover:-translate-y-0.5"
          style={{
            background: pnlPositive
              ? "linear-gradient(135deg, hsl(162 88% 42% / 0.10), hsl(var(--card)))"
              : "linear-gradient(135deg, hsl(345 88% 58% / 0.10), hsl(var(--card)))",
          }}
        >
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Total Unrealised PnL</p>
              <div className="flex items-center gap-1 mt-2">
                <span
                  className="text-3xl font-bold"
                  style={{ color: pnlPositive ? "hsl(162 88% 42%)" : "hsl(345 88% 58%)" }}
                >
                  {pnlPositive ? "+" : "−"}${fmtMoney(dashboard.totalUnrealisedPnl)}
                </span>
              </div>
            </div>
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: pnlPositive ? "hsl(162 88% 42% / 0.12)" : "hsl(345 88% 58% / 0.12)" }}
            >
              {pnlPositive ? (
                <TrendingUp className="w-5 h-5" style={{ color: "hsl(162 88% 42%)" }} />
              ) : (
                <TrendingDown className="w-5 h-5" style={{ color: "hsl(345 88% 58%)" }} />
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Accounts Summary */}
        <Card className="border-border/60">
          <CardHeader className="flex flex-row items-center gap-2 pb-3">
            <Wallet className="w-4 h-4 text-muted-foreground" />
            <CardTitle className="text-base font-semibold">Accounts Summary</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-6">Account</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Positions</TableHead>
                  <TableHead className="text-right pr-6">PnL</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dashboard.accountSummaries?.map(acc => {
                  const pnl = acc.unrealisedPnl ?? 0;
                  const pnlPos = pnl >= 0;
                  return (
                    <TableRow key={acc.accountId} className="hover:bg-muted/40 transition-colors">
                      <TableCell className="font-medium pl-6">{acc.accountName}</TableCell>
                      <TableCell>
                        {acc.isActive ? (
                          <Badge variant="outline" className="bg-success/10 text-success border-success/20">
                            <span className="w-1.5 h-1.5 rounded-full bg-success mr-1.5 inline-block" />
                            Active
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-muted text-muted-foreground">
                            <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground mr-1.5 inline-block" />
                            Inactive
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono">{acc.openPositions || 0}</TableCell>
                      <TableCell
                        className={`text-right pr-6 font-mono font-semibold ${pnlPos ? "text-success" : "text-destructive"}`}
                      >
                        {pnlPos ? "+" : "−"}${fmtMoney(pnl)}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {(!dashboard.accountSummaries || dashboard.accountSummaries.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-10">
                      No accounts found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Recent Executions — capped height, scrollable */}
        <Card className="border-border/60">
          <CardHeader className="flex flex-row items-center justify-between pb-4">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-muted-foreground" />
              <CardTitle className="text-base font-semibold">Recent Executions</CardTitle>
            </div>
            {recentExecutions.length > 0 && (
              <span className="text-[11px] text-muted-foreground font-medium">
                Last {recentExecutions.length}
              </span>
            )}
          </CardHeader>
          <CardContent className="p-0">
            <div
              className="max-h-[420px] overflow-y-auto px-6 pb-5 pt-1"
              style={{ borderTop: "1px solid hsl(var(--border) / 0.6)" }}
            >
              <div className="space-y-1">
                {recentExecutions.map((exec, i) => {
                  const isBuy = exec.side === "BUY";
                  return (
                    <div
                      key={exec.id}
                      className="flex items-center justify-between gap-3 py-3"
                      style={{
                        borderBottom: i === recentExecutions.length - 1 ? "none" : "1px solid hsl(var(--border) / 0.6)",
                      }}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                          style={{
                            background: isBuy ? "hsl(162 88% 42% / 0.12)" : "hsl(345 88% 58% / 0.12)",
                          }}
                        >
                          {isBuy ? (
                            <ArrowUpRight className="w-4 h-4" style={{ color: "hsl(162 88% 42%)" }} />
                          ) : (
                            <ArrowDownRight className="w-4 h-4" style={{ color: "hsl(345 88% 58%)" }} />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-sm truncate">{exec.symbol}</span>
                            <Badge
                              className="text-[10px] px-1.5 py-0 h-4 font-bold"
                              style={
                                isBuy
                                  ? { background: "hsl(162 88% 42% / 0.15)", color: "hsl(162 88% 42%)" }
                                  : { background: "hsl(345 88% 58% / 0.15)", color: "hsl(345 88% 58%)" }
                              }
                            >
                              {exec.side}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">
                            {exec.accountName} · {exec.orderType} · Qty {exec.quantity}
                          </p>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <Badge
                          variant={exec.status === "EXECUTED" || exec.status === "RAISED" ? "default" : exec.status === "FAILED" ? "destructive" : "outline"}
                          className="text-[10px]"
                        >
                          {exec.status}
                        </Badge>
                        <p className="text-[11px] text-muted-foreground mt-1 font-mono">
                          {new Date(exec.createdAt).toLocaleTimeString()}
                        </p>
                      </div>
                    </div>
                  );
                })}
                {recentExecutions.length === 0 && (
                  <div className="text-center text-muted-foreground py-10">No recent executions.</div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
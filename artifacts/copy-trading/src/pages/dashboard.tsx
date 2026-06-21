import { useGetDashboard } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

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

  return (
    <div className="p-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground">Overview of your copy trading operation.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Accounts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{dashboard.totalAccounts}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Accounts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{dashboard.activeAccounts}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Open Positions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{dashboard.totalPositions}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Unrealised PnL</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-3xl font-bold ${dashboard.totalUnrealisedPnl >= 0 ? "text-success" : "text-destructive"}`}>
              ${dashboard.totalUnrealisedPnl?.toFixed(2)}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card>
          <CardHeader>
            <CardTitle>Accounts Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Positions</TableHead>
                  <TableHead className="text-right">PnL</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dashboard.accountSummaries?.map(acc => (
                  <TableRow key={acc.accountId}>
                    <TableCell className="font-medium">{acc.accountName}</TableCell>
                    <TableCell>
                      {acc.isActive ? (
                        <Badge variant="outline" className="bg-success/10 text-success border-success/20">Active</Badge>
                      ) : (
                        <Badge variant="outline" className="bg-muted text-muted-foreground">Inactive</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">{acc.openPositions || 0}</TableCell>
                    <TableCell className={`text-right ${acc.unrealisedPnl && acc.unrealisedPnl >= 0 ? "text-success" : "text-destructive"}`}>
                      ${acc.unrealisedPnl?.toFixed(2) || "0.00"}
                    </TableCell>
                  </TableRow>
                ))}
                {(!dashboard.accountSummaries || dashboard.accountSummaries.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-6">
                      No accounts found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Executions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {dashboard.recentExecutions?.map(exec => (
                <div key={exec.id} className="flex items-center justify-between border-b border-border pb-4 last:border-0 last:pb-0">
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge className={exec.side === 'BUY' ? 'bg-success hover:bg-success/90 text-success-foreground' : 'bg-destructive hover:bg-destructive/90 text-destructive-foreground'}>
                        {exec.side}
                      </Badge>
                      <span className="font-medium">{exec.symbol}</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {exec.accountName} • {exec.orderType} • Qty: {exec.quantity}
                    </div>
                  </div>
                  <div className="text-right">
                    <Badge variant={exec.status === 'EXECUTED' ? 'default' : exec.status === 'FAILED' ? 'destructive' : 'outline'}>
                      {exec.status}
                    </Badge>
                    <div className="text-xs text-muted-foreground mt-1">
                      {new Date(exec.createdAt).toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              ))}
              {(!dashboard.recentExecutions || dashboard.recentExecutions.length === 0) && (
                <div className="text-center text-muted-foreground py-6">
                  No recent executions.
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

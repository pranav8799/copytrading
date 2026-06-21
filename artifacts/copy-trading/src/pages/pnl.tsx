import { useState } from "react";
import { useGetPnl } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

export function PnlPage() {
  const { data: pnlData, isLoading } = useGetPnl({});

  // Mock data for chart if none provided by API
  const chartData = [
    { date: 'Mon', pnl: 120 },
    { date: 'Tue', pnl: 250 },
    { date: 'Wed', pnl: -100 },
    { date: 'Thu', pnl: 400 },
    { date: 'Fri', pnl: 350 },
    { date: 'Sat', pnl: 800 },
    { date: 'Sun', pnl: 750 },
  ];

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">P&L Tracker</h1>
        <p className="text-muted-foreground">Monitor your performance across all sub-accounts.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Realised PnL</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-success">
              $0.00
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Fees</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-destructive">
              $0.00
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Net PnL</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              $0.00
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Best Account</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold truncate">
              -
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Net PnL Over Time</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `$${value}`} />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                  itemStyle={{ color: 'hsl(var(--foreground))' }}
                />
                <Line type="monotone" dataKey="pnl" stroke="hsl(var(--primary))" strokeWidth={3} dot={false} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Per-Account Breakdown</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead className="text-right">Realised PnL</TableHead>
                <TableHead className="text-right">Fees</TableHead>
                <TableHead className="text-right">Net PnL</TableHead>
                <TableHead className="text-right">Trades</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8">Loading...</TableCell></TableRow>
              ) : !pnlData || pnlData.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8">No data available.</TableCell></TableRow>
              ) : (
                pnlData.map((item) => (
                  <TableRow key={item.accountId}>
                    <TableCell className="font-medium">{item.accountName}</TableCell>
                    <TableCell className={`text-right ${item.realisedPnl >= 0 ? 'text-success' : 'text-destructive'}`}>
                      ${item.realisedPnl.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right text-destructive">
                      ${item.fees.toFixed(2)}
                    </TableCell>
                    <TableCell className={`text-right font-bold ${item.netPnl >= 0 ? 'text-success' : 'text-destructive'}`}>
                      ${item.netPnl.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right">{item.tradeCount}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

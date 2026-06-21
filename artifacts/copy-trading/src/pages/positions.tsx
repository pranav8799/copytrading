import { useState } from "react";
import { useGetPositions, getGetPositionsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export function PositionsPage() {
  const { data: positions, isLoading } = useGetPositions({}, { query: { queryKey: getGetPositionsQueryKey({}), refetchInterval: 10000 } });

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Open Positions</h1>
        <p className="text-muted-foreground">Monitor real-time positions across all accounts. Refreshes every 10s.</p>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead>Symbol</TableHead>
                <TableHead>Side</TableHead>
                <TableHead className="text-right">Size</TableHead>
                <TableHead className="text-right">Entry</TableHead>
                <TableHead className="text-right">Mark Price</TableHead>
                <TableHead className="text-right">Liq. Price</TableHead>
                <TableHead className="text-right">Leverage</TableHead>
                <TableHead className="text-right">Unrealised PnL</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Loading positions...</TableCell>
                </TableRow>
              ) : !positions || positions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">No open positions.</TableCell>
                </TableRow>
              ) : (
                positions.map((pos) => {
                  const pnlNum = parseFloat(pos.unrealisedPnl);
                  return (
                    <TableRow key={`${pos.accountId}-${pos.symbol}-${pos.positionSide}`}>
                      <TableCell className="font-medium">{pos.accountName}</TableCell>
                      <TableCell className="font-bold">{pos.symbol}</TableCell>
                      <TableCell>
                        <Badge className={pos.positionSide === 'LONG' || pos.positionSide === 'BUY' ? 'bg-success hover:bg-success/90' : 'bg-destructive hover:bg-destructive/90'}>
                          {pos.positionSide}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono">{pos.positionSize}</TableCell>
                      <TableCell className="text-right font-mono">{pos.avgEntryPrice}</TableCell>
                      <TableCell className="text-right font-mono">{pos.markPrice}</TableCell>
                      <TableCell className="text-right font-mono text-destructive">{pos.liquidationPrice}</TableCell>
                      <TableCell className="text-right">{pos.leverage}x</TableCell>
                      <TableCell className={`text-right font-bold ${pnlNum >= 0 ? "text-success" : "text-destructive"}`}>
                        {pnlNum > 0 ? "+" : ""}{pnlNum.toFixed(2)}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

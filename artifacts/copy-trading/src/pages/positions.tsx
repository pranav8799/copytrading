import { useMemo, useState } from "react";
import { useGetPositions, getGetPositionsQueryKey, useListAccounts } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, X, Phone } from "lucide-react";

type SideFilter = "all" | "long" | "short";
type PnlFilter = "all" | "profit" | "loss";

const isLongSide = (side: string) => side === "LONG" || side === "BUY";

export function PositionsPage() {
  const { data: positions, isLoading } = useGetPositions({}, { query: { queryKey: getGetPositionsQueryKey({}), refetchInterval: 10000 } });
  const { data: accounts } = useListAccounts();

  const [searchQuery, setSearchQuery] = useState("");
  const [accountFilter, setAccountFilter] = useState("all");
  const [sideFilter, setSideFilter] = useState<SideFilter>("all");
  const [pnlFilter, setPnlFilter] = useState<PnlFilter>("all");

  const getMobileNumber = (accountId: number | undefined, accountName?: string): string => {
    const list = (accounts ?? []) as Array<{ id: number; name: string; mobileNumber?: string }>;
    const byId = accountId != null ? list.find((a) => a.id === accountId) : undefined;
    const byName = !byId && accountName ? list.find((a) => a.name === accountName) : undefined;
    return (byId ?? byName)?.mobileNumber ?? "—";
  };

  const accountOptions = useMemo(() => {
    if (!positions) return [];
    const names = new Set(positions.map((p) => p.accountName));
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [positions]);

  const filteredPositions = useMemo(() => {
    if (!positions) return [];
    const q = searchQuery.trim().toLowerCase();
    return positions.filter((pos) => {
      if (q) {
        const phone = getMobileNumber(pos.accountId, pos.accountName).toLowerCase();
        const matches =
          pos.symbol.toLowerCase().includes(q) ||
          pos.accountName.toLowerCase().includes(q) ||
          phone.includes(q);
        if (!matches) return false;
      }

      if (accountFilter !== "all" && pos.accountName !== accountFilter) return false;

      if (sideFilter === "long" && !isLongSide(pos.positionSide)) return false;
      if (sideFilter === "short" && isLongSide(pos.positionSide)) return false;

      const pnlNum = parseFloat(pos.unrealisedPnl);
      if (pnlFilter === "profit" && !(pnlNum > 0)) return false;
      if (pnlFilter === "loss" && !(pnlNum < 0)) return false;

      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positions, searchQuery, accountFilter, sideFilter, pnlFilter, accounts]);

  const hasActiveFilters =
    searchQuery.trim() !== "" ||
    accountFilter !== "all" ||
    sideFilter !== "all" ||
    pnlFilter !== "all";

  const clearFilters = () => {
    setSearchQuery("");
    setAccountFilter("all");
    setSideFilter("all");
    setPnlFilter("all");
  };

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Open Positions</h1>
        <p className="text-muted-foreground">Monitor real-time positions across all accounts. Refreshes every 10s.</p>
      </div>

      {/* Search & Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by symbol, account or phone..."
                className="pl-8"
              />
            </div>

            <Select value={accountFilter} onValueChange={setAccountFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Account" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Accounts</SelectItem>
                {accountOptions.map((name) => (
                  <SelectItem key={name} value={name}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={sideFilter} onValueChange={(v) => setSideFilter(v as SideFilter)}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Side" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sides</SelectItem>
                <SelectItem value="long">Long</SelectItem>
                <SelectItem value="short">Short</SelectItem>
              </SelectContent>
            </Select>

            <Select value={pnlFilter} onValueChange={(v) => setPnlFilter(v as PnlFilter)}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="PnL" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All PnL</SelectItem>
                <SelectItem value="profit">In Profit</SelectItem>
                <SelectItem value="loss">In Loss</SelectItem>
              </SelectContent>
            </Select>

            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1">
                <X className="h-3.5 w-3.5" />
                Clear
              </Button>
            )}
          </div>

          {hasActiveFilters && positions && (
            <p className="text-xs text-muted-foreground mt-2">
              Showing {filteredPositions.length} of {positions.length} position{positions.length !== 1 ? "s" : ""}.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead>
                  <span className="inline-flex items-center gap-1">
                    <Phone className="h-3 w-3" /> Phone
                  </span>
                </TableHead>
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
                  <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">Loading positions...</TableCell>
                </TableRow>
              ) : !positions || positions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">No open positions.</TableCell>
                </TableRow>
              ) : filteredPositions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                    No positions match your search/filters.
                  </TableCell>
                </TableRow>
              ) : (
                filteredPositions.map((pos) => {
                  const pnlNum = parseFloat(pos.unrealisedPnl);
                  return (
                    <TableRow key={`${pos.accountId}-${pos.symbol}-${pos.positionSide}`}>
                      <TableCell className="font-medium">{pos.accountName}</TableCell>
                      <TableCell className="font-mono text-sm text-muted-foreground whitespace-nowrap">
                        {getMobileNumber(pos.accountId, pos.accountName)}
                      </TableCell>
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
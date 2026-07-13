import { useState } from "react";
import {
  useListWebhooks,
  useCreateWebhook,
  useUpdateWebhook,
  useDeleteWebhook,
  useTestWebhook,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type OrderType = "MARKET" | "LIMIT";

export function WebhooksPage() {
  const { data: webhooks, isLoading } = useListWebhooks();
  const createMutation = useCreateWebhook();
  const updateMutation = useUpdateWebhook();
  const deleteMutation = useDeleteWebhook();
  const testMutation = useTestWebhook();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [defaultSymbol, setDefaultSymbol] = useState("");
  const [orderType, setOrderType] = useState<OrderType>("MARKET");
  const [limitOffsetPercent, setLimitOffsetPercent] = useState("0.1");

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/webhooks"] });
  };

  const handleCreate = () => {
    if (!name) return;
    createMutation.mutate(
      {
        data: {
          name,
          targetAccounts: [], // deprecated: accounts are now resolved dynamically from Select Accounts page
          defaultSymbol: defaultSymbol || null,
          orderType,
          limitOffsetPercent:
            orderType === "LIMIT" && limitOffsetPercent !== ""
              ? Number(limitOffsetPercent)
              : null,
          isActive: true,
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Webhook created" });
          setName("");
          setDefaultSymbol("");
          setOrderType("MARKET");
          setLimitOffsetPercent("0.1");
          invalidate();
        },
        onError: (err: Error) => {
          toast({ title: "Failed to create webhook", description: err.message, variant: "destructive" });
        },
      },
    );
  };

  const handleDelete = (id: number) => {
    if (!confirm("Delete this webhook? Any TradingView alert using its URL will stop working.")) return;
    deleteMutation.mutate(
      { id },
      {
        onSuccess: () => {
          toast({ title: "Webhook deleted" });
          invalidate();
        },
      },
    );
  };

  const handleToggleActive = (id: number, isActive: boolean) => {
    updateMutation.mutate(
      { id, data: { isActive } },
      {
        onSuccess: () => {
          toast({ title: isActive ? "Webhook enabled" : "Webhook disabled" });
          invalidate();
        },
      },
    );
  };

  const handleTest = (token: string) => {
    testMutation.mutate(
      { token },
      {
        onSuccess: () => {
          toast({ title: "Test successful", description: "Dry run OK — no trades were executed." });
        },
        onError: (err: Error) => {
          toast({ title: "Test failed", description: err.message, variant: "destructive" });
        },
      },
    );
  };

  const handleCopyUrl = (token: string) => {
    const base = `${window.location.origin}${import.meta.env.VITE_API_BASE ?? ""}`;
    const url = `${base}/api/webhooks/${token}`;
    navigator.clipboard.writeText(url);
    toast({ title: "Webhook URL copied to clipboard" });
  };

  const payloadTemplate =
    orderType === "LIMIT"
      ? `{
  "symbol": "{{ticker}}",
  "side": "{{strategy.order.action}}",
  "quantity": {{strategy.order.contracts}},
  "price": {{close}}
}`
      : `{
  "symbol": "{{ticker}}",
  "side": "{{strategy.order.action}}",
  "quantity": {{strategy.order.contracts}}
}`;

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Webhooks Integration</h1>
          <p className="text-muted-foreground">
            Trigger trades from TradingView or external signals. Trades fire on whichever accounts are
            currently checked on the{" "}
            <span className="font-medium text-foreground">Select Trading Accounts</span> page, scaled by
            each account's multiplier.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Create Webhook</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. BTC Scalp Strategy" />
            </div>
            <div className="space-y-2">
              <Label>Symbol</Label>
              <Input
                value={defaultSymbol}
                onChange={(e) => setDefaultSymbol(e.target.value.toUpperCase())}
                placeholder="e.g. BTCUSDT"
              />
            </div>
            <div className="space-y-2">
              <Label>Order Type</Label>
              <Select value={orderType} onValueChange={(v) => setOrderType(v as OrderType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MARKET">Market</SelectItem>
                  <SelectItem value="LIMIT">Limit</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {orderType === "LIMIT" && (
              <div className="space-y-2">
                <Label>Limit Offset %</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={limitOffsetPercent}
                  onChange={(e) => setLimitOffsetPercent(e.target.value)}
                  placeholder="0.1"
                />
                <p className="text-xs text-muted-foreground">
                  Rests the limit order this % away from the alert price (better fill, may not always execute).
                </p>
              </div>
            )}
          </div>
          <Button onClick={handleCreate} disabled={createMutation.isPending || !name}>
            {createMutation.isPending ? "Creating..." : "Create Webhook"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Symbol</TableHead>
                <TableHead>Order Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last Triggered</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    Loading...
                  </TableCell>
                </TableRow>
              ) : !webhooks || webhooks.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    No webhooks configured.
                  </TableCell>
                </TableRow>
              ) : (
                webhooks.map((wh) => (
                  <TableRow key={wh.id}>
                    <TableCell className="font-medium">{wh.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{wh.defaultSymbol || "—"}</TableCell>
                    <TableCell className="text-sm">
                      {wh.orderType === "LIMIT"
                        ? `Limit (${wh.limitOffsetPercent ?? 0}% offset)`
                        : "Market"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={wh.isActive}
                          onCheckedChange={(checked) => handleToggleActive(wh.id, checked)}
                        />
                        {wh.isActive ? (
                          <Badge variant="outline" className="bg-success/10 text-success border-success/20">
                            Active
                          </Badge>
                        ) : (
                          <Badge variant="outline">Disabled</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {wh.lastTriggered ? new Date(wh.lastTriggered).toLocaleString() : "Never"}
                    </TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button variant="outline" size="sm" onClick={() => handleTest(wh.token)}>
                        Test
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => handleCopyUrl(wh.token)}>
                        Copy URL
                      </Button>
                      <Button variant="destructive" size="sm" onClick={() => handleDelete(wh.id)}>
                        Delete
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>TradingView Payload Template</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Paste the copied webhook URL into your TradingView alert's "Webhook URL" field, and use this as
            the alert message (matches the order type selected above):
          </p>
          <pre className="p-4 bg-muted text-muted-foreground rounded-md overflow-x-auto text-sm font-mono border border-border">
            {payloadTemplate}
          </pre>
          <p className="text-xs text-muted-foreground">
            No passphrase or secret is needed in the payload — the webhook URL itself is the credential.
            Regenerate/delete the webhook if the URL is ever compromised.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
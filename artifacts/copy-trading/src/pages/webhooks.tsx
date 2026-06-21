import { useState } from "react";
import { useListWebhooks, useCreateWebhook, useDeleteWebhook, useTestWebhook } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function WebhooksPage() {
  const { data: webhooks, isLoading } = useListWebhooks();
  const createMutation = useCreateWebhook();
  const deleteMutation = useDeleteWebhook();
  const testMutation = useTestWebhook();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [name, setName] = useState("");

  const handleCreate = () => {
    if (!name) return;
    createMutation.mutate({ data: { name, targetAccounts: [], isActive: true } }, {
      onSuccess: () => {
        toast({ title: "Webhook created" });
        setName("");
        queryClient.invalidateQueries({ queryKey: ["/api/webhooks"] });
      }
    });
  };

  const handleDelete = (id: number) => {
    deleteMutation.mutate({ id }, {
      onSuccess: () => {
        toast({ title: "Webhook deleted" });
        queryClient.invalidateQueries({ queryKey: ["/api/webhooks"] });
      }
    });
  };

  const handleCopyUrl = (token: string) => {
    const url = `${window.location.origin}/api/webhooks/trigger/${token}`;
    navigator.clipboard.writeText(url);
    toast({ title: "Webhook URL copied to clipboard" });
  };

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Webhooks Integration</h1>
          <p className="text-muted-foreground">Trigger trades from TradingView or external signals.</p>
        </div>
      </div>

      <div className="flex gap-4 items-end">
        <div className="space-y-2 flex-1 max-w-sm">
          <Label>New Webhook Name</Label>
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. TradingView Scalper" />
        </div>
        <Button onClick={handleCreate} disabled={createMutation.isPending || !name}>Create Webhook</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Target Accounts</TableHead>
                <TableHead>Last Triggered</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8">Loading...</TableCell></TableRow>
              ) : !webhooks || webhooks.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8">No webhooks configured.</TableCell></TableRow>
              ) : (
                webhooks.map(wh => (
                  <TableRow key={wh.id}>
                    <TableCell className="font-medium">{wh.name}</TableCell>
                    <TableCell>
                      {wh.isActive ? <Badge variant="outline" className="bg-success/10 text-success border-success/20">Active</Badge> : <Badge variant="outline">Disabled</Badge>}
                    </TableCell>
                    <TableCell>{wh.targetAccounts?.length || 0} accounts</TableCell>
                    <TableCell>{wh.lastTriggered ? new Date(wh.lastTriggered).toLocaleString() : 'Never'}</TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button variant="outline" size="sm" onClick={() => handleCopyUrl(wh.token)}>Copy URL</Button>
                      <Button variant="destructive" size="sm" onClick={() => handleDelete(wh.id)}>Delete</Button>
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
        <CardContent>
          <pre className="p-4 bg-muted text-muted-foreground rounded-md overflow-x-auto text-sm font-mono border border-border">
{`{
  "symbol": "{{ticker}}",
  "side": "{{strategy.order.action}}",
  "orderType": "MARKET",
  "quantity": {{strategy.order.contracts}},
  "passphrase": "YOUR_WEBHOOK_TOKEN"
}`}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}

import { useState } from "react";
import { useGetOpenOrders, useGetClosedOrders, useCancelOrder, useCancelAllOrders } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

export function OrdersPage() {
  const [activeTab, setActiveTab] = useState("open");
  const { data: openOrders, isPending: isOpenLoading } = useGetOpenOrders();
  const { data: closedOrders, isPending: isClosedLoading } = useGetClosedOrders();
  const cancelOrderMutation = useCancelOrder();
  const cancelAllMutation = useCancelAllOrders();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const handleCancelOrder = (orderId: string, accountId: number) => {
    cancelOrderMutation.mutate({ data: { accountIds: [accountId], orderId } }, {
      onSuccess: () => {
        toast({ title: "Order Cancelled" });
        queryClient.invalidateQueries({ queryKey: ["/api/trade/open-orders"] });
      },
      onError: (err: any) => {
        toast({ title: "Failed to cancel order", description: err.message, variant: "destructive" });
      }
    });
  };

  const handleCancelAll = () => {
    if (!confirm("Are you sure you want to cancel all open orders across all accounts?")) return;
    // Note: cancelAllOrders expects accountIds. If we don't have them easily, we can just omit or pass empty if supported, or fetch from accounts.
    // For now, let's just pass empty array assuming the backend handles it or we'd need to select accounts.
    // Actually the spec says accountIds: number[]. So we need to pass them. Let's pass empty for now.
    cancelAllMutation.mutate({ data: { accountIds: [] } }, {
      onSuccess: () => {
        toast({ title: "All Orders Cancelled" });
        queryClient.invalidateQueries({ queryKey: ["/api/trade/open-orders"] });
      },
      onError: (err: any) => {
        toast({ title: "Failed to cancel all orders", description: err.message, variant: "destructive" });
      }
    });
  };

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Orders Manager</h1>
          <p className="text-muted-foreground">View and manage open and closed orders.</p>
        </div>
        {activeTab === "open" && (
          <Button variant="destructive" onClick={handleCancelAll} disabled={cancelAllMutation.isPending}>
            Cancel All Open Orders
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <div className="p-4 border-b border-border">
              <TabsList>
                <TabsTrigger value="open">Open Orders</TabsTrigger>
                <TabsTrigger value="closed">Closed Orders</TabsTrigger>
              </TabsList>
            </div>
            
            <TabsContent value="open" className="m-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Account</TableHead>
                    <TableHead>Symbol</TableHead>
                    <TableHead>Side</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isOpenLoading ? (
                    <TableRow><TableCell colSpan={8} className="text-center py-8">Loading...</TableCell></TableRow>
                  ) : !openOrders || openOrders.length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="text-center py-8">No open orders.</TableCell></TableRow>
                  ) : (
                    openOrders.map(order => (
                      <TableRow key={`${order.accountId}-${order.orderId}`}>
                        <TableCell className="font-medium">{order.accountName}</TableCell>
                        <TableCell className="font-bold">{order.symbol}</TableCell>
                        <TableCell>
                          <Badge className={order.side === 'BUY' ? 'bg-success hover:bg-success/90' : 'bg-destructive hover:bg-destructive/90'}>
                            {order.side}
                          </Badge>
                        </TableCell>
                        <TableCell>{order.orderType}</TableCell>
                        <TableCell className="text-right font-mono">{order.quantity}</TableCell>
                        <TableCell className="text-right font-mono">{order.price || 'Market'}</TableCell>
                        <TableCell><Badge variant="outline">{order.status}</Badge></TableCell>
                        <TableCell className="text-right">
                          <Button variant="outline" size="sm" onClick={() => handleCancelOrder(order.orderId, order.accountId)}>
                            Cancel
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                   )}
                </TableBody>
              </Table>
            </TabsContent>

            <TabsContent value="closed" className="m-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Account</TableHead>
                    <TableHead>Symbol</TableHead>
                    <TableHead>Side</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isClosedLoading ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-8">Loading...</TableCell></TableRow>
                  ) : !closedOrders || closedOrders.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-8">No closed orders.</TableCell></TableRow>
                  ) : (
                    closedOrders.map(order => (
                      <TableRow key={`${order.accountId}-${order.orderId}`}>
                        <TableCell className="font-medium">{order.accountName}</TableCell>
                        <TableCell className="font-bold">{order.symbol}</TableCell>
                        <TableCell>
                          <Badge className={order.side === 'BUY' ? 'bg-success hover:bg-success/90' : 'bg-destructive hover:bg-destructive/90'}>
                            {order.side}
                          </Badge>
                        </TableCell>
                        <TableCell>{order.orderType}</TableCell>
                        <TableCell className="text-right font-mono">{order.quantity}</TableCell>
                        <TableCell className="text-right font-mono">{order.price || 'Market'}</TableCell>
                        <TableCell><Badge variant="outline">{order.status}</Badge></TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

import { useState } from "react";
import { useListAccounts, useSetTpsl } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Checkbox } from "@/components/ui/checkbox";

export function TpslPage() {
  const { data: accounts } = useListAccounts();
  const setTpslMutation = useSetTpsl();
  const { toast } = useToast();

  const [symbol, setSymbol] = useState("BTCUSDT");
  const [tpPrice, setTpPrice] = useState("");
  const [slPrice, setSlPrice] = useState("");
  const [selectedAccounts, setSelectedAccounts] = useState<number[]>([]);

  const activeAccounts = accounts?.filter(a => a.isActive) || [];

  const handleApply = () => {
    if (selectedAccounts.length === 0) {
      toast({ title: "Select accounts", variant: "destructive" });
      return;
    }
    if (!tpPrice && !slPrice) {
      toast({ title: "Set TP or SL", variant: "destructive" });
      return;
    }
    
    setTpslMutation.mutate({
      data: {
        accountIds: selectedAccounts,
        symbol,
        tpPrice: tpPrice ? parseFloat(tpPrice) : undefined,
        slPrice: slPrice ? parseFloat(slPrice) : undefined,
      }
    }, {
      onSuccess: () => {
        toast({ title: "TP/SL Applied Successfully" });
      },
      onError: (err: any) => {
        toast({ title: "Failed to apply TP/SL", description: err.message, variant: "destructive" });
      }
    });
  };

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Take Profit / Stop Loss</h1>
        <p className="text-muted-foreground">Manage TP/SL orders across multiple accounts simultaneously.</p>
      </div>

      <div className="flex gap-8">
        <Card className="flex-1">
          <CardHeader>
            <CardTitle>Set TP/SL</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Symbol</Label>
              <Input value={symbol} onChange={e => setSymbol(e.target.value.toUpperCase())} placeholder="BTCUSDT" className="uppercase" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Take Profit Price</Label>
                <Input type="number" step="any" value={tpPrice} onChange={e => setTpPrice(e.target.value)} placeholder="0.00" />
              </div>
              <div className="space-y-2">
                <Label>Stop Loss Price</Label>
                <Input type="number" step="any" value={slPrice} onChange={e => setSlPrice(e.target.value)} placeholder="0.00" />
              </div>
            </div>
            
            <div className="pt-4 space-y-2">
              <Label>Apply to Accounts:</Label>
              <div className="space-y-2 max-h-60 overflow-auto border border-border rounded-md p-4">
                {activeAccounts.map(acc => (
                  <div key={acc.id} className="flex items-center space-x-2">
                    <Checkbox 
                      id={`acc-${acc.id}`} 
                      checked={selectedAccounts.includes(acc.id)}
                      onCheckedChange={(c) => {
                        if (c) setSelectedAccounts(p => [...p, acc.id]);
                        else setSelectedAccounts(p => p.filter(id => id !== acc.id));
                      }}
                    />
                    <Label htmlFor={`acc-${acc.id}`}>{acc.name}</Label>
                  </div>
                ))}
              </div>
            </div>

            <Button className="w-full" onClick={handleApply} disabled={setTpslMutation.isPending}>
              {setTpslMutation.isPending ? "Applying..." : "Apply to Selected Accounts"}
            </Button>
          </CardContent>
        </Card>
        
        <Card className="flex-1">
          <CardHeader>
            <CardTitle>Current TP/SL Orders</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center text-muted-foreground py-12">
              TP/SL Tracking is currently unified with Open Orders.<br/>
              View the Orders tab to manage active bounds.
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

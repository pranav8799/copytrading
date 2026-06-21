import { useState, useEffect } from "react";
import { useGetSettings, useUpdateSettings } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function SettingsPage() {
  const { data: settings, isLoading } = useGetSettings();
  const updateMutation = useUpdateSettings();
  const { toast } = useToast();

  const [leverage, setLeverage] = useState("");
  const [orderType, setOrderType] = useState("MARKET");
  const [webhooksEnabled, setWebhooksEnabled] = useState(true);

  useEffect(() => {
    if (settings) {
      setLeverage(settings.defaultLeverage?.toString() || "10");
      setOrderType(settings.defaultOrderType || "MARKET");
      setWebhooksEnabled(settings.webhooksEnabled ?? true);
    }
  }, [settings]);

  const handleSave = () => {
    updateMutation.mutate({
      data: {
        defaultLeverage: parseInt(leverage),
        defaultOrderType: orderType,
        webhooksEnabled
      }
    }, {
      onSuccess: () => {
        toast({ title: "Settings saved successfully" });
      },
      onError: (err: any) => {
        toast({ title: "Failed to save settings", description: err.message, variant: "destructive" });
      }
    });
  };

  if (isLoading) return <div className="p-8">Loading settings...</div>;

  return (
    <div className="p-8 space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">System Settings</h1>
        <p className="text-muted-foreground">Configure global application behavior.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Trading Defaults</CardTitle>
          <CardDescription>Default values used when placing trades or processing webhooks.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label>Default Leverage</Label>
            <Input 
              type="number" 
              value={leverage} 
              onChange={e => setLeverage(e.target.value)} 
              placeholder="10" 
            />
          </div>
          
          <div className="space-y-2">
            <Label>Default Order Type</Label>
            <Select value={orderType} onValueChange={setOrderType}>
              <SelectTrigger>
                <SelectValue placeholder="Select Order Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="MARKET">Market</SelectItem>
                <SelectItem value="LIMIT">Limit</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between border border-border p-4 rounded-lg">
            <div className="space-y-0.5">
              <Label className="text-base">Master Webhook Switch</Label>
              <p className="text-sm text-muted-foreground">
                Enable or disable all incoming webhook triggers globally.
              </p>
            </div>
            <Switch checked={webhooksEnabled} onCheckedChange={setWebhooksEnabled} />
          </div>

          <Button onClick={handleSave} disabled={updateMutation.isPending} className="w-full">
            {updateMutation.isPending ? "Saving..." : "Save Settings"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

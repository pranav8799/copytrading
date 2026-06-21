import { useEffect, useState } from "react";
import { useListAccounts, useGetSettings, useUpdateSettings } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

type SelectionMap = Map<number, number>; // accountId -> multiplier

export function SelectAccountsPage() {
  const { data: accounts, isLoading: accountsLoading } = useListAccounts();
  const { data: settings, isLoading: settingsLoading } = useGetSettings();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const updateMutation = useUpdateSettings();

  const [selection, setSelection] = useState<SelectionMap>(new Map());

  const savedSelection: SelectionMap = new Map(
    (settings?.selectedAccounts ?? []).map((s) => [s.accountId, s.multiplier])
  );

  // Seed local selection from saved settings once loaded
  useEffect(() => {
    if (settings?.selectedAccounts) {
      setSelection(new Map(settings.selectedAccounts.map((s) => [s.accountId, s.multiplier])));
    }
  }, [settings?.selectedAccounts]);

  const activeAccounts = accounts?.filter((a) => a.isActive) ?? [];
  const allSelected = activeAccounts.length > 0 && activeAccounts.every((a) => selection.has(a.id));

  const serialize = (m: SelectionMap) =>
    JSON.stringify([...m.entries()].sort((a, b) => a[0] - b[0]));
  const isDirty = settings != null && serialize(selection) !== serialize(savedSelection);

  const toggleOne = (id: number, checked: boolean) => {
    setSelection((prev) => {
      const next = new Map(prev);
      if (checked) next.set(id, next.get(id) ?? 1);
      else next.delete(id);
      return next;
    });
  };

  const toggleAll = (checked: boolean) => {
    setSelection(checked ? new Map(activeAccounts.map((a) => [a.id, selection.get(a.id) ?? 1])) : new Map());
  };

  const setMultiplier = (id: number, value: string) => {
    const n = parseFloat(value);
    setSelection((prev) => {
      const next = new Map(prev);
      if (next.has(id)) next.set(id, isNaN(n) ? 0 : n);
      return next;
    });
  };

  const handleSave = () => {
    const selectedAccounts = [...selection.entries()].map(([accountId, multiplier]) => ({
      accountId,
      multiplier,
    }));
    updateMutation.mutate(
      { data: { selectedAccounts } },
      {
        onSuccess: () => {
          toast({
            title: "Selection saved",
            description: `${selectedAccounts.length} account${selectedAccounts.length !== 1 ? "s" : ""} selected for trading.`,
          });
          queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
        },
        onError: (err: any) => {
          toast({ title: "Failed to save selection", description: err.message, variant: "destructive" });
        },
      }
    );
  };

  const handleReset = () => {
    setSelection(new Map(savedSelection));
  };

  const isLoading = accountsLoading || settingsLoading;

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Select Trading Accounts</h1>
          <p className="text-muted-foreground">
            Choose which accounts trades placed in the Trade Terminal will be punched on, and set a
            size multiplier for each.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isDirty && (
            <Button variant="outline" onClick={handleReset} disabled={updateMutation.isPending}>
              Discard Changes
            </Button>
          )}
          <Button onClick={handleSave} disabled={updateMutation.isPending || !isDirty}>
            {updateMutation.isPending ? "Saving..." : "Save Selection"}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">
            Accounts ({selection.size}/{activeAccounts.length} selected)
          </CardTitle>
          <Button
            variant="link"
            size="sm"
            className="h-auto p-0"
            onClick={() => toggleAll(!allSelected)}
          >
            {allSelected ? "Deselect all" : "Select all"}
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={(v) => toggleAll(!!v)}
                  />
                </TableHead>
                <TableHead>Name</TableHead>
                <TableHead>API Key</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-32">Multiplier</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    Loading accounts...
                  </TableCell>
                </TableRow>
              ) : activeAccounts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    No active accounts. Add accounts on the Accounts page first.
                  </TableCell>
                </TableRow>
              ) : (
                activeAccounts.map((acc) => {
                  const checked = selection.has(acc.id);
                  const multiplier = selection.get(acc.id);
                  return (
                    <TableRow
                      key={acc.id}
                      className="cursor-pointer"
                      onClick={() => toggleOne(acc.id, !checked)}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(v) => toggleOne(acc.id, !!v)}
                        />
                      </TableCell>
                      <TableCell className="font-medium">{acc.name}</TableCell>
                      <TableCell className="font-mono text-sm text-muted-foreground">
                        {acc.apiKeyMasked}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="bg-success/10 text-success border-success/20">
                          Active
                        </Badge>
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1">
                          <Input
                            type="number"
                            min="0"
                            step="any"
                            disabled={!checked}
                            value={checked ? multiplier ?? 1 : ""}
                            onChange={(e) => setMultiplier(acc.id, e.target.value)}
                            className="h-8 w-20 font-mono"
                            placeholder="—"
                          />
                          <span className="text-xs text-muted-foreground">×</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {isDirty && (
        <p className="text-sm text-muted-foreground">
          You have unsaved changes. Click "Save Selection" to apply them to the Trade Terminal.
        </p>
      )}
    </div>
  );
}
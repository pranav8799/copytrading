import { useState, useEffect, useRef } from "react";
import {
  useListAccounts,
  useCreateAccount,
  useDeleteAccount,
  useVerifyAccount,
  useUpdateAccount,
  useGetSettings,
  useUpdateSettings,
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type AccountRow = {
  id: number;
  name: string;
  mobileNumber: string;
  apiKeyMasked: string;
  isActive: boolean;
  lastBalance?: string | null;
  currentBalance?: string | null;
  balanceUpdatedAt?: string | null;
  createdAt: string;
};

type SelectionMap = Map<number, number>; // accountId -> multiplier

const fmtBalance = (v?: string | null) => {
  if (v == null) return "—";
  const n = parseFloat(v);
  if (isNaN(n)) return "—";
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const fmtUpdatedAt = (v?: string | null) => {
  if (!v) return "—";
  return new Date(v).toLocaleString();
};

export function AccountsPage() {
  const { data: accounts, isLoading } = useListAccounts();
  const { data: settings, isLoading: settingsLoading } = useGetSettings();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [name, setName] = useState("");
  const [mobileNumber, setMobileNumber] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [multiplier, setMultiplierField] = useState("1");

  const [editTarget, setEditTarget] = useState<AccountRow | null>(null);
  const [editName, setEditName] = useState("");
  const [editMobile, setEditMobile] = useState("");
  const [editApiKey, setEditApiKey] = useState("");
  const [editSecretKey, setEditSecretKey] = useState("");
  const [editMultiplier, setEditMultiplier] = useState("1");

  const createMutation = useCreateAccount();
  const deleteMutation = useDeleteAccount();
  const verifyMutation = useVerifyAccount();
  const updateMutation = useUpdateAccount();
  const updateSettingsMutation = useUpdateSettings();

  /* ── trading selection state ──────────────────────────────────────── */
  const [selection, setSelection] = useState<SelectionMap>(new Map());

  const savedSelection: SelectionMap = new Map(
    (settings?.selectedAccounts ?? []).map((s) => [s.accountId, s.multiplier])
  );

  useEffect(() => {
    if (settings?.selectedAccounts) {
      setSelection(new Map(settings.selectedAccounts.map((s) => [s.accountId, s.multiplier])));
    }
  }, [settings?.selectedAccounts]);

  // If an account becomes inactive while selected, drop it from the selection.
  useEffect(() => {
    if (!accounts) return;
    const inactiveIds = new Set(accounts.filter((a) => !a.isActive).map((a) => a.id));
    setSelection((prev) => {
      let changed = false;
      const next = new Map(prev);
      for (const id of next.keys()) {
        if (inactiveIds.has(id)) {
          next.delete(id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [accounts]);

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

  const persistSelection = (next: SelectionMap, opts?: { silent?: boolean }) => {
    const selectedAccounts = [...next.entries()].map(([accountId, multiplier]) => ({
      accountId,
      multiplier,
    }));
    updateSettingsMutation.mutate(
      { data: { selectedAccounts } },
      {
        onSuccess: () => {
          if (!opts?.silent) {
            toast({
              title: "Selection saved",
              description: `${selectedAccounts.length} account${selectedAccounts.length !== 1 ? "s" : ""} selected for trading.`,
            });
          }
          queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
        },
        onError: (err: any) => {
          toast({ title: "Failed to save selection", description: err.message, variant: "destructive" });
        },
      }
    );
  };

  const handleSaveSelection = () => persistSelection(selection);
  const handleResetSelection = () => setSelection(new Map(savedSelection));

  /* ── auto-verify all accounts once in the background on load ───────── */
  const verifiedIdsRef = useRef<Set<number>>(new Set());
  useEffect(() => {
    if (!accounts) return;
    for (const acc of accounts) {
      if (verifiedIdsRef.current.has(acc.id)) continue;
      verifiedIdsRef.current.add(acc.id);
      verifyMutation.mutate(
        { id: acc.id },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/accounts"] });
          },
        }
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts?.length]);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !mobileNumber || !apiKey || !secretKey) {
      toast({ title: "Validation Error", description: "All fields are required", variant: "destructive" });
      return;
    }
    const multiplierNum = parseFloat(multiplier);
    if (isNaN(multiplierNum) || multiplierNum < 0) {
      toast({ title: "Validation Error", description: "Multiplier must be a non-negative number", variant: "destructive" });
      return;
    }

    createMutation.mutate({ data: { name, mobileNumber, apiKey, secretKey } }, {
      onSuccess: (created) => {
        toast({ title: "Account created successfully" });
        queryClient.invalidateQueries({ queryKey: ["/api/accounts"] });

        // Auto-select the new account for trading with the given multiplier.
        const next = new Map(selection);
        next.set(created.id, multiplierNum);
        setSelection(next);
        persistSelection(next, { silent: true });

        setIsAddOpen(false);
        setName("");
        setMobileNumber("");
        setApiKey("");
        setSecretKey("");
        setMultiplierField("1");
      },
      onError: (err: any) => {
        toast({ title: "Failed to create account", description: err.message, variant: "destructive" });
      }
    });
  };

  const openEdit = (acc: AccountRow) => {
    setEditTarget(acc);
    setEditName(acc.name);
    setEditMobile(acc.mobileNumber);
    setEditApiKey("");
    setEditSecretKey("");
    setEditMultiplier(String(selection.get(acc.id) ?? 1));
  };

  const handleEditSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTarget) return;
    if (!editName || !editMobile) {
      toast({ title: "Validation Error", description: "Name and mobile number are required", variant: "destructive" });
      return;
    }
    const multiplierNum = parseFloat(editMultiplier);
    if (isNaN(multiplierNum) || multiplierNum < 0) {
      toast({ title: "Validation Error", description: "Multiplier must be a non-negative number", variant: "destructive" });
      return;
    }

    const data: Record<string, string> = { name: editName, mobileNumber: editMobile };
    if (editApiKey) data.apiKey = editApiKey;
    if (editSecretKey) data.secretKey = editSecretKey;

    updateMutation.mutate({ id: editTarget.id, data }, {
      onSuccess: () => {
        toast({ title: "Account updated" });
        queryClient.invalidateQueries({ queryKey: ["/api/accounts"] });

        // Only update the multiplier if this account is currently selected;
        // editing the multiplier here does not itself select the account.
        if (selection.has(editTarget.id)) {
          const next = new Map(selection);
          next.set(editTarget.id, multiplierNum);
          setSelection(next);
          persistSelection(next, { silent: true });
        }

        setEditTarget(null);
      },
      onError: (err: any) => {
        toast({ title: "Failed to update account", description: err.message, variant: "destructive" });
      }
    });
  };

  const handleDeleteFromEdit = () => {
    if (!editTarget) return;
    const acc = editTarget;
    if (!confirm(`Delete account "${acc.name}"? This cannot be undone.`)) return;
    const typed = prompt(`Type the account name "${acc.name}" to confirm permanent deletion:`);
    if (typed !== acc.name) {
      if (typed !== null) {
        toast({ title: "Deletion cancelled", description: "Name did not match.", variant: "destructive" });
      }
      return;
    }
    deleteMutation.mutate({ id: acc.id }, {
      onSuccess: () => {
        toast({ title: "Account deleted" });
        queryClient.invalidateQueries({ queryKey: ["/api/accounts"] });

        // Remove from selection too, if present.
        if (selection.has(acc.id)) {
          const next = new Map(selection);
          next.delete(acc.id);
          setSelection(next);
          persistSelection(next, { silent: true });
        }

        setEditTarget(null);
      },
      onError: (err: any) => {
        toast({ title: "Failed to delete account", description: err.message, variant: "destructive" });
      }
    });
  };

  const handleToggleActive = (id: number, currentStatus: boolean) => {
    updateMutation.mutate({ id, data: { isActive: !currentStatus } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/accounts"] });
      }
    });
  };

  const rows = (accounts ?? []) as AccountRow[];
  const selectableCount = rows.filter((a) => a.isActive).length;

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Broker Accounts</h1>
          <p className="text-muted-foreground">
            Manage your connected exchange accounts, and choose which ones trade in the Trade Terminal.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isDirty && (
            <Button variant="outline" onClick={handleResetSelection} disabled={updateSettingsMutation.isPending}>
              Discard Selection Changes
            </Button>
          )}
          <Button onClick={handleSaveSelection} disabled={updateSettingsMutation.isPending || !isDirty}>
            {updateSettingsMutation.isPending ? "Saving..." : "Save Selection"}
          </Button>
          <Button onClick={() => setIsAddOpen(true)}>Add Account</Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">Select</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Mobile Number</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last Balance</TableHead>
                <TableHead>Current Balance</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead className="w-24">Multiplier</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading || settingsLoading ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Loading accounts...</TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">No accounts configured.</TableCell>
                </TableRow>
              ) : (
                rows.map((acc) => {
                  const checked = selection.has(acc.id);
                  return (
                    <TableRow key={acc.id}>
                      <TableCell>
                        <Checkbox
                          checked={checked}
                          disabled={!acc.isActive}
                          onCheckedChange={(v) => toggleOne(acc.id, !!v)}
                        />
                      </TableCell>
                      <TableCell className="font-medium">{acc.name}</TableCell>
                      <TableCell className="text-sm">{acc.mobileNumber}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={acc.isActive}
                            onCheckedChange={() => handleToggleActive(acc.id, acc.isActive)}
                          />
                          {acc.isActive ? (
                            <Badge variant="outline" className="bg-success/10 text-success border-success/20">Active</Badge>
                          ) : (
                            <Badge variant="outline" className="bg-muted text-muted-foreground">Disabled</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-sm text-muted-foreground">{fmtBalance(acc.lastBalance)}</TableCell>
                      <TableCell className="font-mono text-sm">{fmtBalance(acc.currentBalance)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{fmtUpdatedAt(acc.balanceUpdatedAt)}</TableCell>
                      <TableCell className="font-mono text-sm">
                        {checked ? `${selection.get(acc.id)}×` : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="outline" size="sm" onClick={() => openEdit(acc)}>Edit</Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {selection.size}/{selectableCount} active account{selectableCount !== 1 ? "s" : ""} selected for trading.
        </span>
        {isDirty && <span>You have unsaved selection changes.</span>}
      </div>

      {/* Add dialog */}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Broker Account</DialogTitle>
            <DialogDescription>
              Enter API credentials for the sub-account. Keys are encrypted at rest.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Account Name</Label>
              <Input id="name" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. SubAccount A" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mobileNumber">Mobile Number</Label>
              <Input id="mobileNumber" value={mobileNumber} onChange={e => setMobileNumber(e.target.value)} placeholder="e.g. +1 555 0100" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="apiKey">API Key</Label>
              <Input id="apiKey" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="****" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="secretKey">Secret Key</Label>
              <Input id="secretKey" type="password" value={secretKey} onChange={e => setSecretKey(e.target.value)} placeholder="****" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="multiplier">Multiplier</Label>
              <Input
                id="multiplier"
                type="number"
                min="0"
                step="any"
                value={multiplier}
                onChange={e => setMultiplierField(e.target.value)}
                placeholder="1"
              />
              <p className="text-xs text-muted-foreground">
                This account will be auto-selected for trading with this size multiplier.
              </p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsAddOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Adding..." : "Add Account"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={editTarget != null} onOpenChange={(open) => !open && setEditTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Broker Account</DialogTitle>
            <DialogDescription>
              Leave API Key / Secret Key blank to keep them unchanged.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEditSave} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="editName">Account Name</Label>
              <Input id="editName" value={editName} onChange={e => setEditName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="editMobile">Mobile Number</Label>
              <Input id="editMobile" value={editMobile} onChange={e => setEditMobile(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="editApiKey">API Key</Label>
              <Input id="editApiKey" value={editApiKey} onChange={e => setEditApiKey(e.target.value)} placeholder="Leave blank to keep current" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="editSecretKey">Secret Key</Label>
              <Input id="editSecretKey" type="password" value={editSecretKey} onChange={e => setEditSecretKey(e.target.value)} placeholder="Leave blank to keep current" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="editMultiplier">
                Multiplier {!editTarget || !selection.has(editTarget.id) ? "(account not currently selected)" : ""}
              </Label>
              <Input
                id="editMultiplier"
                type="number"
                min="0"
                step="any"
                value={editMultiplier}
                onChange={e => setEditMultiplier(e.target.value)}
                placeholder="1"
              />
            </div>
            <DialogFooter className="flex items-center justify-between sm:justify-between w-full">
              <Button type="button" variant="outline" onClick={() => setEditTarget(null)}>Cancel</Button>
              <Button type="submit" disabled={updateMutation.isPending}>
                {updateMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>

          <div className="border-t border-border pt-4 mt-2">
            <p className="text-xs text-muted-foreground mb-2">
              Permanently delete this account. This cannot be undone.
            </p>
            <Button
              type="button"
              variant="destructive"
              className="w-full"
              onClick={handleDeleteFromEdit}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete Account"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
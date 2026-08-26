import { useState } from "react";
import {
  useListNotifications,
  useCreateNotification,
  useDeactivateNotification,
  useListAccounts,
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const fmtDate = (v: string) => new Date(v).toLocaleString();

export function NotificationsPage() {
  const { data: notifications, isLoading } = useListNotifications();
  const { data: accounts } = useListAccounts();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const createMutation = useCreateNotification();
  const deactivateMutation = useDeactivateNotification();

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [targetType, setTargetType] = useState<"ALL" | "ACCOUNT">("ALL");
  const [accountId, setAccountId] = useState<string>("");

  const resetForm = () => {
    setTitle("");
    setMessage("");
    setTargetType("ALL");
    setAccountId("");
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !message) {
      toast({ title: "Validation Error", description: "Title and message are required", variant: "destructive" });
      return;
    }
    if (targetType === "ACCOUNT" && !accountId) {
      toast({ title: "Validation Error", description: "Select an account to target", variant: "destructive" });
      return;
    }

    createMutation.mutate(
      {
        data: {
          title,
          message,
          targetType,
          accountId: targetType === "ACCOUNT" ? Number(accountId) : undefined,
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Notification sent" });
          queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
          setIsAddOpen(false);
          resetForm();
        },
        onError: (err: any) => {
          toast({ title: "Failed to create notification", description: err.message, variant: "destructive" });
        },
      },
    );
  };

  const handleDeactivate = (id: number) => {
    deactivateMutation.mutate(
      { id },
      {
        onSuccess: () => {
          toast({ title: "Notification deactivated" });
          queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
        },
        onError: (err: any) => {
          toast({ title: "Failed to deactivate", description: err.message, variant: "destructive" });
        },
      },
    );
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Notifications</h1>
          <p className="text-sm text-muted-foreground">Send announcements to all users or a specific account.</p>
        </div>
        <Button onClick={() => setIsAddOpen(true)}>New Notification</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Message</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    Loading notifications...
                  </TableCell>
                </TableRow>
              ) : !notifications || notifications.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    No notifications yet.
                  </TableCell>
                </TableRow>
              ) : (
                notifications.map((n) => (
                  <TableRow key={n.id}>
                    <TableCell className="font-medium">{n.title}</TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-xs truncate">{n.message}</TableCell>
                    <TableCell className="text-sm">
                      {n.targetType === "ALL" ? (
                        <Badge variant="outline">All users</Badge>
                      ) : (
                        <Badge variant="outline">{n.accountName ?? `Account #${n.accountId}`}</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {n.isActive ? (
                        <Badge variant="outline" className="bg-success/10 text-success border-success/20">Active</Badge>
                      ) : (
                        <Badge variant="outline" className="bg-muted text-muted-foreground">Deactivated</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{fmtDate(n.createdAt)}</TableCell>
                    <TableCell className="text-right">
                      {n.isActive && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDeactivate(n.id)}
                          disabled={deactivateMutation.isPending}
                        >
                          Deactivate
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={isAddOpen} onOpenChange={(open) => { setIsAddOpen(open); if (!open) resetForm(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Notification</DialogTitle>
            <DialogDescription>
              Send an announcement to all users, or target a single account.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="notifTitle">Title</Label>
              <Input id="notifTitle" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Scheduled maintenance" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="notifMessage">Message</Label>
              <Textarea id="notifMessage" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Details for the user..." rows={4} />
            </div>
            <div className="space-y-2">
              <Label>Target</Label>
              <Select value={targetType} onValueChange={(v) => setTargetType(v as "ALL" | "ACCOUNT")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All users</SelectItem>
                  <SelectItem value="ACCOUNT">Specific account</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {targetType === "ACCOUNT" && (
              <div className="space-y-2">
                <Label>Account</Label>
                <Select value={accountId} onValueChange={setAccountId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select an account" />
                  </SelectTrigger>
                  <SelectContent>
                    {(accounts ?? []).map((a) => (
                      <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsAddOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Sending..." : "Send Notification"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
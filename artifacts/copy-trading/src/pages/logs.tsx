import { useGetTradeLogs, useGetSystemLogs } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";

export function LogsPage() {
  const { data: tradeLogs } = useGetTradeLogs({});
  const { data: sysLogs } = useGetSystemLogs({});

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">System & Trade Logs</h1>
        <p className="text-muted-foreground">Audit trail for all operations.</p>
      </div>

      <Card>
        <CardContent className="p-0">
          <Tabs defaultValue="trade" className="w-full">
            <div className="p-4 border-b border-border">
              <TabsList>
                <TabsTrigger value="trade">Trade Logs</TabsTrigger>
                <TabsTrigger value="system">System Logs</TabsTrigger>
              </TabsList>
            </div>
            
            <TabsContent value="trade" className="m-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead>Symbol</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Source</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(!tradeLogs?.data || tradeLogs.data.length === 0) ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-8">No trade logs.</TableCell></TableRow>
                  ) : (
                    tradeLogs.data.map(log => (
                      <TableRow key={log.id}>
                        <TableCell className="whitespace-nowrap">{new Date(log.createdAt).toLocaleString()}</TableCell>
                        <TableCell>{log.accountName}</TableCell>
                        <TableCell className="font-bold">{log.symbol}</TableCell>
                        <TableCell>
                          <span className={log.side === 'BUY' ? 'text-success' : 'text-destructive'}>
                            {log.side} {log.orderType}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge variant={log.status === 'EXECUTED' ? 'default' : log.status === 'FAILED' ? 'destructive' : 'outline'}>
                            {log.status}
                          </Badge>
                        </TableCell>
                        <TableCell>{log.firedVia}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TabsContent>

            <TabsContent value="system" className="m-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Level</TableHead>
                    <TableHead>Message</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(!sysLogs?.data || sysLogs.data.length === 0) ? (
                    <TableRow><TableCell colSpan={3} className="text-center py-8">No system logs.</TableCell></TableRow>
                  ) : (
                    sysLogs.data.map(log => (
                      <TableRow key={log.id}>
                        <TableCell className="whitespace-nowrap">{new Date(log.createdAt).toLocaleString()}</TableCell>
                        <TableCell>
                          <Badge variant={log.level === 'ERROR' ? 'destructive' : log.level === 'WARN' ? 'secondary' : 'outline'}>
                            {log.level}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-sm">{log.message}</TableCell>
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

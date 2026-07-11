// import { useEffect, useRef } from "react";
// import { useGetPositions, useSetTpsl, executeTrade, getGetPositionsQueryKey } from "@workspace/api-client-react";
// import { useToast } from "@/hooks/use-toast";
// import { repunchStore, useWatchedSlots, useAutoPunchEnabled, type WatchedSlot } from "@/lib/repunchStore";

// export function RepunchMonitor() {
//   const { toast } = useToast();
//   const tpslMut = useSetTpsl();
//   const enabled = useAutoPunchEnabled();
//   useWatchedSlots(); // subscribes this component to slot changes so it re-renders when needed

//   const { data: positions = [] } = useGetPositions(
//     {}, { query: { queryKey: getGetPositionsQueryKey({}), refetchInterval: 10_000, enabled } }
//   );

//   const prevPositionsRef = useRef<any[]>([]);
//   const positionPnlRef = useRef<Map<string, number>>(new Map());

//   const repunchSlot = async (slot: WatchedSlot) => {
//     try {
//       await executeTrade({
//         accountIds: [slot.accountId],
//         order: { symbol: slot.symbol, side: slot.side, orderType: "LIMIT", quantity: slot.quantity, price: slot.limitPrice },
//       });
//       tpslMut.mutate({ data: { accountIds: [slot.accountId], symbol: slot.symbol, tpPrice: slot.tpPrice } });
//       repunchStore.setSlots((prev) =>
//         prev.map((s) => (s.id === slot.id ? { ...s, status: "watching", repunchCount: s.repunchCount + 1 } : s))
//       );
//       toast({ title: `♻ Re-punched @ ${slot.limitPrice}` });
//     } catch (err: any) {
//       toast({ title: "Re-punch failed", description: err.message, variant: "destructive" });
//       repunchStore.setSlots((prev) => prev.map((s) => (s.id === slot.id ? { ...s, status: "watching" } : s)));
//     }
//   };

//   useEffect(() => {
//     if (!enabled) {
//       prevPositionsRef.current = [];
//       positionPnlRef.current.clear();
//       return;
//     }
//     const prevPositions = prevPositionsRef.current;
//     const positionsArr = positions as any[];

//     positionsArr.forEach((p) => {
//       const key = `${p.accountId}-${p.symbol}-${p.positionSide}`;
//       const pnl = typeof p.unrealisedPnl === "string" ? parseFloat(p.unrealisedPnl) : p.unrealisedPnl;
//       if (!isNaN(pnl)) positionPnlRef.current.set(key, pnl);
//     });

//     const currentKeys = new Set(positionsArr.map((p) => `${p.accountId}-${p.symbol}-${p.positionSide}`));

//     for (const prevPos of prevPositions) {
//       const key = `${prevPos.accountId}-${prevPos.symbol}-${prevPos.positionSide}`;
//       if (currentKeys.has(key)) continue;

//       const lastPnl = positionPnlRef.current.get(key) ?? 0;
//       positionPnlRef.current.delete(key);
//       if (lastPnl <= 0) continue;

//       const slotSide = prevPos.positionSide === "LONG" ? "BUY" : "SELL";
//       const avgEntry = typeof prevPos.avgEntryPrice === "string" ? parseFloat(prevPos.avgEntryPrice) : prevPos.avgEntryPrice;

//       const candidates = repunchStore.getSlots().filter(
//         (s) => s.accountId === prevPos.accountId && s.symbol === prevPos.symbol && s.side === slotSide && s.status === "watching"
//       );
//       if (candidates.length === 0) continue;

//       const best = candidates.reduce((a, b) => (Math.abs(a.limitPrice - avgEntry) <= Math.abs(b.limitPrice - avgEntry) ? a : b));
//       repunchStore.setSlots((prev) => prev.map((s) => (s.id === best.id ? { ...s, status: "repunching" } : s)));
//       void repunchSlot(best);
//     }

//     prevPositionsRef.current = positionsArr;
//   }, [positions, enabled]);

//   return null;
// }
import { useCallback, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetSettings,
  useUpdateSettings,
  getGetSettingsQueryKey,
  type OrderPayloadSide,
} from "@workspace/api-client-react";

export interface WatchedSlot {
  id: string;
  accountId: number;
  symbol: string;
  side: OrderPayloadSide;
  limitPrice: number;
  tpPrice: number;
  quantity: number;
  repunchCount: number;
  status: "pending_fill" | "placing_tp" | "watching" | "repunching";
  orderId?: string;       // currently-open ENTRY limit (while pending_fill)
  seenOpen?: boolean;     // has the entry limit been observed resting on the book
  tpOrderId?: string;     // currently-open EXIT limit (while watching)
  tpSeenOpen?: boolean;   // has the exit limit been observed resting on the book
}

// ─────────────────────────────────────────────────────────────
// watchedSlots now lives on the server (settings.watchedSlots),
// polled the same way positions/orders are elsewhere in the app.
// This makes the Re-punch Monitor visible across browsers/devices.
//
// IMPORTANT: the actual fill-detection / TP-placement / repunch
// EXECUTION logic no longer runs here or in TradePage.tsx — it runs
// in the backend poller (api-server/src/jobs/repunchEngine.ts).
// This file is now a thin read/write client around settings.watchedSlots,
// not a state machine. Do not add executeTrade logic back here.
// ─────────────────────────────────────────────────────────────

/**
 * Read the current watched slots. Polls the settings endpoint so changes
 * made by the backend poller (or another browser) show up automatically.
 */
export function useWatchedSlots(): WatchedSlot[] {
    const { data } = useGetSettings({
    query: { queryKey: getGetSettingsQueryKey(), refetchInterval: 5_000 },
  });
  return ((data as any)?.watchedSlots ?? []) as WatchedSlot[];
}

/**
 * Write watched slots back to the server. Accepts either a new array or
 * an updater function, mirroring the old setState-style API so call sites
 * (e.g. runAutoPunch, the "Clear all" button) don't need to change shape.
 */
export function useSetWatchedSlots() {
  const queryClient = useQueryClient();
  const { data: settings } = useGetSettings();
  const updateSettingsMut = useUpdateSettings();

  return useCallback(
    (updater: WatchedSlot[] | ((prev: WatchedSlot[]) => WatchedSlot[])) => {
      const prev = ((settings as any)?.watchedSlots ?? []) as WatchedSlot[];
      const next = typeof updater === "function" ? (updater as any)(prev) : updater;

      // Cast the whole mutate payload — `watchedSlots` isn't in the
      // generated SettingsUpdate zod type yet, only in the raw Express
      // handler. This is safe because the backend validates it independently.
      updateSettingsMut.mutate(
        ({ data: { watchedSlots: next } } as any),
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
          },
          onError: (err: any) => {
            console.error("Failed to persist watched slots", err);
          },
        }
      );
    },
    [settings, updateSettingsMut, queryClient]
  );
}

// ─────────────────────────────────────────────────────────────
// autoPunchEnabled stays a local, per-browser UI toggle. It doesn't need
// to be server-synced — it just controls whether TradePage triggers a
// NEW auto-punch after a manual trade in *this* browser. The backend
// poller only cares about slots that already exist, regardless of this flag.
// ─────────────────────────────────────────────────────────────

let autoPunchEnabled = false;
const listeners = new Set<() => void>();

export const repunchStore = {
  getEnabled: () => autoPunchEnabled,
  setEnabled: (v: boolean) => {
    autoPunchEnabled = v;
    listeners.forEach((l) => l());
  },
  subscribe: (cb: () => void) => {
    listeners.add(cb);
    return () => listeners.delete(cb);
  },
};

export function useAutoPunchEnabled() {
  return useSyncExternalStore(repunchStore.subscribe, repunchStore.getEnabled);
}




// *****************************************************11/07/2026********************************************




// import { useSyncExternalStore } from "react";
// import type { OrderPayloadSide } from "@workspace/api-client-react";

// export interface WatchedSlot {
//   id: string;
//   accountId: number;
//   symbol: string;
//   side: OrderPayloadSide;
//   limitPrice: number;
//   tpPrice: number;
//   quantity: number;
//   repunchCount: number;
//   status: "pending_fill" | "placing_tp" | "watching" | "repunching";
//   orderId?: string;
//   seenOpen?: boolean;
//   tpOrderId?: string;
//   tpSeenOpen?: boolean;
// }

// const STORAGE_KEY = "repunch-store-v1";

// interface PersistedState {
//   watchedSlots: WatchedSlot[];
//   autoPunchEnabled: boolean;
// }

// function loadPersisted(): PersistedState {
//   if (typeof window === "undefined") {
//     return { watchedSlots: [], autoPunchEnabled: false };
//   }
//   try {
//     const raw = window.localStorage.getItem(STORAGE_KEY);
//     if (!raw) return { watchedSlots: [], autoPunchEnabled: false };
//     const parsed = JSON.parse(raw);
//     return {
//       watchedSlots: Array.isArray(parsed.watchedSlots) ? parsed.watchedSlots : [],
//       autoPunchEnabled: !!parsed.autoPunchEnabled,
//     };
//   } catch (err) {
//     console.error("Failed to load repunch store from localStorage", err);
//     return { watchedSlots: [], autoPunchEnabled: false };
//   }
// }

// function persist() {
//   if (typeof window === "undefined") return;
//   try {
//     window.localStorage.setItem(
//       STORAGE_KEY,
//       JSON.stringify({ watchedSlots, autoPunchEnabled })
//     );
//   } catch (err) {
//     console.error("Failed to persist repunch store to localStorage", err);
//   }
// }

// const initial = loadPersisted();
// let watchedSlots: WatchedSlot[] = initial.watchedSlots;
// let autoPunchEnabled: boolean = initial.autoPunchEnabled;
// const listeners = new Set<() => void>();

// function emit() {
//   persist();
//   listeners.forEach((l) => l());
// }

// export const repunchStore = {
//   getSlots: () => watchedSlots,
//   getEnabled: () => autoPunchEnabled,
//   setSlots: (updater: WatchedSlot[] | ((prev: WatchedSlot[]) => WatchedSlot[])) => {
//     watchedSlots = typeof updater === "function" ? (updater as any)(watchedSlots) : updater;
//     emit();
//   },
//   setEnabled: (v: boolean) => {
//     autoPunchEnabled = v;
//     if (!v) watchedSlots = [];
//     emit();
//   },
//   subscribe: (cb: () => void) => {
//     listeners.add(cb);
//     return () => listeners.delete(cb);
//   },
// };

// export function useWatchedSlots() {
//   return useSyncExternalStore(repunchStore.subscribe, repunchStore.getSlots);
// }
// export function useAutoPunchEnabled() {
//   return useSyncExternalStore(repunchStore.subscribe, repunchStore.getEnabled);
// }
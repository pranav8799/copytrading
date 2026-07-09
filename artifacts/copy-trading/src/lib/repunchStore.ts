import { useSyncExternalStore } from "react";
import type { OrderPayloadSide } from "@workspace/api-client-react";

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
  orderId?: string;
  seenOpen?: boolean;
  tpOrderId?: string;
  tpSeenOpen?: boolean;
}

const STORAGE_KEY = "repunch-store-v1";

interface PersistedState {
  watchedSlots: WatchedSlot[];
  autoPunchEnabled: boolean;
}

function loadPersisted(): PersistedState {
  if (typeof window === "undefined") {
    return { watchedSlots: [], autoPunchEnabled: false };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { watchedSlots: [], autoPunchEnabled: false };
    const parsed = JSON.parse(raw);
    return {
      watchedSlots: Array.isArray(parsed.watchedSlots) ? parsed.watchedSlots : [],
      autoPunchEnabled: !!parsed.autoPunchEnabled,
    };
  } catch (err) {
    console.error("Failed to load repunch store from localStorage", err);
    return { watchedSlots: [], autoPunchEnabled: false };
  }
}

function persist() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ watchedSlots, autoPunchEnabled })
    );
  } catch (err) {
    console.error("Failed to persist repunch store to localStorage", err);
  }
}

const initial = loadPersisted();
let watchedSlots: WatchedSlot[] = initial.watchedSlots;
let autoPunchEnabled: boolean = initial.autoPunchEnabled;
const listeners = new Set<() => void>();

function emit() {
  persist();
  listeners.forEach((l) => l());
}

export const repunchStore = {
  getSlots: () => watchedSlots,
  getEnabled: () => autoPunchEnabled,
  setSlots: (updater: WatchedSlot[] | ((prev: WatchedSlot[]) => WatchedSlot[])) => {
    watchedSlots = typeof updater === "function" ? (updater as any)(watchedSlots) : updater;
    emit();
  },
  setEnabled: (v: boolean) => {
    autoPunchEnabled = v;
    if (!v) watchedSlots = [];
    emit();
  },
  subscribe: (cb: () => void) => {
    listeners.add(cb);
    return () => listeners.delete(cb);
  },
};

export function useWatchedSlots() {
  return useSyncExternalStore(repunchStore.subscribe, repunchStore.getSlots);
}
export function useAutoPunchEnabled() {
  return useSyncExternalStore(repunchStore.subscribe, repunchStore.getEnabled);
}
"use client";

import type { OfflineDraftPackage } from "./offline-package";
import {
  createDefaultOfflinePackage,
  parseOfflinePackage,
} from "./offline-package";
import { isSyntheticDemoPlayer } from "./sample-data";

const STORAGE_KEY = "fantasy-draft-manager:offline-package:v1";
const listeners = new Set<() => void>();
let cachedRaw: string | null | undefined;
let cachedValue: OfflineDraftPackage | null = null;
let pendingValue: OfflineDraftPackage | null = null;
let pendingWriteTimer: ReturnType<typeof setTimeout> | null = null;

function flushPendingWrite(): void {
  if (typeof window === "undefined" || !pendingValue) return;
  const raw = JSON.stringify(pendingValue);
  window.localStorage.setItem(STORAGE_KEY, raw);
  cachedRaw = raw;
  cachedValue = pendingValue;
  pendingValue = null;
  pendingWriteTimer = null;
}

function removeSyntheticDemoPlayers(
  value: OfflineDraftPackage,
): OfflineDraftPackage {
  const removedPlayerIds = new Set(
    value.players.filter(isSyntheticDemoPlayer).map((player) => player.id),
  );
  const leagueWasDemo = value.league.id === "demo-2026";
  if (removedPlayerIds.size === 0 && !leagueWasDemo) return value;
  const removedEventIds = new Set(
    value.events
      .filter(
        (event) =>
          event.type === "pick_made" &&
          removedPlayerIds.has(event.pick.playerId),
      )
      .map((event) => event.id),
  );
  return {
    ...value,
    ...(leagueWasDemo
      ? {
          league: createDefaultOfflinePackage().league,
          events: [],
        }
      : {}),
    players: value.players.filter(
      (player) => !removedPlayerIds.has(player.id),
    ),
    ...(!leagueWasDemo
      ? {
          events: value.events.filter((event) =>
            event.type === "pick_made"
              ? !removedPlayerIds.has(event.pick.playerId)
              : !removedEventIds.has(event.targetEventId),
          ),
        }
      : {}),
  };
}

function readStoredPackage(): OfflineDraftPackage | null {
  if (typeof window === "undefined") return null;
  if (pendingValue) return cachedValue;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw === cachedRaw) return cachedValue;
  cachedRaw = raw;
  if (!raw) {
    cachedValue = null;
    return null;
  }
  try {
    cachedValue = removeSyntheticDemoPlayers(parseOfflinePackage(raw));
  } catch {
    cachedValue = null;
  }
  return cachedValue;
}

function notify(): void {
  listeners.forEach((listener) => listener());
}

export function subscribeToLocalDraft(listener: () => void): () => void {
  listeners.add(listener);
  const handleStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY) return;
    cachedRaw = undefined;
    notify();
  };
  window.addEventListener("storage", handleStorage);
  window.addEventListener("pagehide", flushPendingWrite);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener("pagehide", flushPendingWrite);
  };
}

export function getLocalDraftSnapshot(): OfflineDraftPackage | null {
  return readStoredPackage();
}

export function getServerDraftSnapshot(): null {
  return null;
}

export function saveLocalDraftSnapshot(value: OfflineDraftPackage): void {
  cachedValue = value;
  pendingValue = value;
  if (pendingWriteTimer) window.clearTimeout(pendingWriteTimer);
  pendingWriteTimer = window.setTimeout(flushPendingWrite, 180);
  notify();
}

export function clearLocalDraftSnapshot(): void {
  if (pendingWriteTimer) window.clearTimeout(pendingWriteTimer);
  window.localStorage.removeItem(STORAGE_KEY);
  cachedRaw = null;
  cachedValue = null;
  pendingValue = null;
  pendingWriteTimer = null;
  notify();
}

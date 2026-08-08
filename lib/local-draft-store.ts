"use client";

import type { OfflineDraftPackage } from "./offline-package";
import { parseOfflinePackage } from "./offline-package";

const STORAGE_KEY = "fantasy-draft-manager:offline-package:v1";
const listeners = new Set<() => void>();
let cachedRaw: string | null | undefined;
let cachedValue: OfflineDraftPackage | null = null;

function readStoredPackage(): OfflineDraftPackage | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw === cachedRaw) return cachedValue;
  cachedRaw = raw;
  if (!raw) {
    cachedValue = null;
    return null;
  }
  try {
    cachedValue = parseOfflinePackage(raw);
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
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", handleStorage);
  };
}

export function getLocalDraftSnapshot(): OfflineDraftPackage | null {
  return readStoredPackage();
}

export function getServerDraftSnapshot(): null {
  return null;
}

export function saveLocalDraftSnapshot(value: OfflineDraftPackage): void {
  const raw = JSON.stringify(value);
  window.localStorage.setItem(STORAGE_KEY, raw);
  cachedRaw = raw;
  cachedValue = value;
  notify();
}

export function clearLocalDraftSnapshot(): void {
  window.localStorage.removeItem(STORAGE_KEY);
  cachedRaw = null;
  cachedValue = null;
  notify();
}

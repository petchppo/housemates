"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { HouseholdState } from "@/domain/household";
import { createInitialHouseholdState, restoreHouseholdState, serializeHouseholdState, STORAGE_KEY } from "@/domain/memory";

type Snapshot = { state: HouseholdState; ready: boolean; persistence: "pending" | "saved" | "session"; notice: string | null };
const serverSnapshot: Snapshot = {
  state: createInitialHouseholdState("2026-10-24T00:00:00.000Z"), ready: false, persistence: "pending", notice: null,
};
let snapshot = serverSnapshot;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const getSnapshot = () => snapshot;
const getServerSnapshot = () => serverSnapshot;
function emit(next: Snapshot) { snapshot = next; listeners.forEach(listener => listener()); }
function hydrate() {
  if (snapshot.ready) return;
  let restored: ReturnType<typeof restoreHouseholdState>;
  try {
    restored = restoreHouseholdState(window.localStorage.getItem(STORAGE_KEY), new Date().toISOString());
  } catch {
    emit({ state: createInitialHouseholdState(new Date().toISOString()), ready: true, persistence: "session",
      notice: "Browser storage is unavailable. You can still plan; changes will last only for this session." });
    return;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, serializeHouseholdState(restored.state));
    emit({ state: restored.state, ready: true, persistence: "saved", notice: restored.notice });
  } catch {
    emit({ state: restored.state, ready: true, persistence: "session",
      notice: "Loaded available memory, but this browser cannot save changes. New changes may not survive a refresh." });
  }
}
export function updateHousehold(transition: (state: HouseholdState) => HouseholdState) {
  if (!snapshot.ready) return;
  const state = transition(snapshot.state);
  try {
    window.localStorage.setItem(STORAGE_KEY, serializeHouseholdState(state));
    emit({ state, ready: true, persistence: "saved", notice: snapshot.persistence === "session" ? null : snapshot.notice });
  } catch {
    emit({ state, ready: true, persistence: "session", notice: "Could not save to this browser. Your current plan still works, but it may not survive a refresh." });
  }
}
export function resetHousehold() {
  const state = createInitialHouseholdState(new Date().toISOString());
  let clearFailed = false;
  try { window.localStorage.removeItem(STORAGE_KEY); } catch { clearFailed = true; }
  try {
    window.localStorage.setItem(STORAGE_KEY, serializeHouseholdState(state));
    emit({ state, ready: true, persistence: "saved", notice: null });
  } catch {
    emit({ state, ready: true, persistence: "session", notice: clearFailed
      ? "Reset this session only. Browser memory could not be erased, so old data may return on refresh. Clear this site's data in browser settings to erase it."
      : "Demo memory was cleared. Browser storage is unavailable, so new changes will last only for this session." });
  }
}
export function useHousehold() {
  const current = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  useEffect(hydrate, []);
  return current;
}

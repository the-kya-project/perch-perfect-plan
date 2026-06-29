// Captures the Android/Chrome `beforeinstallprompt` event so the app can offer a
// real "Install app" button (native install dialog) instead of instructions-only.
// iOS/Safari never fires this event, so callers fall back to instructions there.
import { useSyncExternalStore } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let deferred: BeforeInstallPromptEvent | null = null;
let initialized = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Register the capture once, as early as possible (called from the root). */
export function initInstallPrompt(): void {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // suppress Chrome's mini-infobar; we trigger install ourselves
    deferred = e as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => { deferred = null; emit(); });
}

function canInstall(): boolean { return deferred !== null; }

/** Reactively whether a native install prompt is currently available. */
export function useCanInstall(): boolean {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    canInstall,
    () => false,
  );
}

/** Trigger the native install dialog. Returns the user's choice (or unavailable). */
export async function promptInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  if (!deferred) return "unavailable";
  try {
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    deferred = null; // a prompt can only be used once
    emit();
    return outcome;
  } catch {
    return "unavailable";
  }
}

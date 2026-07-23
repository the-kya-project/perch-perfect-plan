import { useEffect, useState } from "react";
import { isNativeApp } from "./nativeApp";

// Platform/browser detection + native install-prompt handling for the
// "add to home screen" flow. One source of truth so every install surface
// (modal, checklists) shows instructions that actually work for the visitor.
//
// Key constraint: on iOS ONLY Safari can install a PWA. Chrome/Firefox/Edge on
// iPhone cannot add to the home screen, so those users are guided to Safari.

export type InstallOS = "ios" | "android" | "desktop";
export type InstallBrowser = "safari" | "chrome" | "firefox" | "edge" | "samsung" | "other";
export type InstallBranch =
  | "installed"       // already in standalone/installed mode — hide the step
  | "ios-safari"      // Share → Add to Home Screen
  | "ios-other"       // can't install here — open in Safari
  | "android-native"  // beforeinstallprompt available — offer the real button
  | "android-other"   // menu → Add to Home screen
  | "desktop-native"  // beforeinstallprompt available — offer the button
  | "desktop";        // no prompt — light note, install optional

const ua = (): string => (typeof navigator === "undefined" ? "" : navigator.userAgent || "");

export function detectOS(): InstallOS {
  const s = ua();
  if (/iPhone|iPad|iPod/.test(s)) return "ios";
  // iPadOS 13+ reports as desktop Safari ("MacIntel") but has a touch screen.
  if (typeof navigator !== "undefined" && navigator.platform === "MacIntel" && (navigator.maxTouchPoints ?? 0) > 1) return "ios";
  if (/Android/.test(s)) return "android";
  return "desktop";
}

export function detectBrowser(): InstallBrowser {
  const s = ua();
  // Order matters: the iOS wrapper tokens (CriOS/FxiOS/EdgiOS) and Samsung/Edge
  // all also contain "Safari"/"Chrome", so check the specific ones first.
  if (/EdgiOS|Edg\//.test(s)) return "edge";
  if (/CriOS|Chrome\//.test(s) && !/SamsungBrowser/.test(s)) return "chrome";
  if (/FxiOS|Firefox\//.test(s)) return "firefox";
  if (/SamsungBrowser/.test(s)) return "samsung";
  if (/Safari/.test(s)) return "safari";
  return "other";
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  // The App Store / Play Store shell IS the installed app: every surface that
  // hides install steps for a standalone PWA must hide them there too.
  if (isNativeApp()) return true;
  // @ts-expect-error iOS-only Safari flag
  if (typeof navigator !== "undefined" && typeof navigator.standalone === "boolean" && navigator.standalone) return true;
  return window.matchMedia?.("(display-mode: standalone)").matches ?? false;
}

// ---- Native beforeinstallprompt capture (module singleton) ------------------
// The event fires once, early, and can only be used later. Capture it at module
// load and on appinstalled clear it. Components subscribe via the hook.

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

let deferredPrompt: BIPEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // stop Chrome's mini-infobar; we drive the prompt ourselves
    deferredPrompt = e as BIPEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    installed = true;
    notify();
  });
}

/** Subscribe to native-prompt availability + install state. */
export function useInstallPrompt() {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);

  const canPrompt = !!deferredPrompt;
  async function promptInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
    if (!deferredPrompt) return "unavailable";
    const evt = deferredPrompt;
    await evt.prompt();
    const { outcome } = await evt.userChoice;
    deferredPrompt = null; // a prompt can only be used once
    notify();
    return outcome;
  }
  return { canPrompt, promptInstall, installed };
}

/** The install branch + everything a surface needs to render it. Reactive to
 *  the native prompt arriving and to appinstalled. */
export function useInstallState() {
  const { canPrompt, promptInstall } = useInstallPrompt();
  const [env, setEnv] = useState<{ os: InstallOS; browser: InstallBrowser; standalone: boolean } | null>(null);
  useEffect(() => {
    setEnv({ os: detectOS(), browser: detectBrowser(), standalone: isStandalone() });
  }, []);

  const os = env?.os ?? "desktop";
  const browser = env?.browser ?? "other";
  const standalone = env?.standalone ?? false;

  let branch: InstallBranch;
  if (standalone || installed) branch = "installed";
  else if (os === "ios") branch = browser === "safari" ? "ios-safari" : "ios-other";
  else if (os === "android") branch = canPrompt ? "android-native" : "android-other";
  else branch = canPrompt ? "desktop-native" : "desktop";

  // `ready` guards against a first-paint flash of the wrong branch before the
  // client-only detection runs (SSR/hydration renders env=null).
  return { branch, os, browser, canPrompt, promptInstall, ready: env !== null };
}

// The native DuoBridge plugin (iOS app 1.2, ios/App/App/DuoBridgePlugin.swift):
// what a foldable iPhone tells the web app about its screen and fold.
//
// Only the 1.2+ iOS app has the plugin. Everywhere else (Safari, the PWA,
// Android, older App Store builds, which get this web code too) the store
// stays null and lib/duo.ts keeps its space-based CSS rule.
import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";

export type DuoFold = { x: number; y: number; width: number; height: number; active: boolean };
export type NativeDuoState = {
  verticalBarEdge: "left" | "right" | null;
  hingeStatus: "closed" | "partiallyOpen" | "fullyOpen" | null;
  hingeAngleDegrees: number | null;
  fold: DuoFold | null;
};

interface DuoBridgePlugin {
  getState(): Promise<NativeDuoState>;
  addListener(event: "duoChange", fn: (s: NativeDuoState) => void): Promise<PluginListenerHandle>;
}

const EMPTY: NativeDuoState = { verticalBarEdge: null, hingeStatus: null, hingeAngleDegrees: null, fold: null };

/** Anything off the bridge, made safe: unknown values read as null. */
export function normalizeNativeDuoState(raw: unknown): NativeDuoState {
  const r = (raw ?? {}) as Record<string, unknown>;
  const edge = r.verticalBarEdge === "left" || r.verticalBarEdge === "right" ? r.verticalBarEdge : null;
  const hinge = r.hingeStatus === "closed" || r.hingeStatus === "partiallyOpen" || r.hingeStatus === "fullyOpen" ? r.hingeStatus : null;
  const angle = typeof r.hingeAngleDegrees === "number" && Number.isFinite(r.hingeAngleDegrees) ? r.hingeAngleDegrees : null;
  const f = r.fold as Record<string, unknown> | null | undefined;
  const fold = f && ["x", "y", "width", "height"].every((k) => typeof f[k] === "number")
    ? { x: f.x as number, y: f.y as number, width: f.width as number, height: f.height as number, active: f.active === true }
    : null;
  return { verticalBarEdge: edge, hingeStatus: hinge, hingeAngleDegrees: angle, fold };
}

// ── The store ────────────────────────────────────────────────────────────────
// null = no plugin here (or not answered yet); otherwise its latest state.
let current: NativeDuoState | null = null;
let started = false;
const listeners = new Set<() => void>();

function set(next: NativeDuoState) {
  current = next;
  applyToHtml(next);
  listeners.forEach((fn) => fn());
}

function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "ios" || !Capacitor.isPluginAvailable("DuoBridge")) return;
  const plugin = registerPlugin<DuoBridgePlugin>("DuoBridge");
  void plugin.addListener("duoChange", (s) => set(normalizeNativeDuoState(s))).catch(() => {});
  void plugin.getState().then((s) => set(normalizeNativeDuoState(s)), () => set(EMPTY));
}

export function subscribeNativeDuo(fn: () => void): () => void {
  start();
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getNativeDuo(): NativeDuoState | null {
  return current;
}

/** Test hook: stand in for the plugin. */
export function setNativeDuoForTest(state: NativeDuoState | null) {
  current = state;
  listeners.forEach((fn) => fn());
}

/**
 * The plugin's state on <html>, for screens built on it later (weigh station,
 * tripod mode): data-vertical-bar="left|right", data-hinge="closed|
 * partiallyOpen|fullyOpen", and --fold-x / --fold-width (CSS px) while the
 * fold is active. Each is absent when its value is null.
 */
export function applyToHtml(s: NativeDuoState, root: { setAttribute(n: string, v: string): void; removeAttribute(n: string): void; style: { setProperty(n: string, v: string): void; removeProperty(n: string): void } } | null =
  typeof document === "undefined" ? null : document.documentElement) {
  if (!root) return;
  if (s.verticalBarEdge) root.setAttribute("data-vertical-bar", s.verticalBarEdge);
  else root.removeAttribute("data-vertical-bar");
  if (s.hingeStatus) root.setAttribute("data-hinge", s.hingeStatus);
  else root.removeAttribute("data-hinge");
  if (s.fold?.active) {
    root.style.setProperty("--fold-x", `${s.fold.x}px`);
    root.style.setProperty("--fold-width", `${s.fold.width}px`);
  } else {
    root.style.removeProperty("--fold-x");
    root.style.removeProperty("--fold-width");
  }
}

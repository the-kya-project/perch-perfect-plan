// The native DuoBridge plugin (iOS app 1.2, ios/App/App/DuoBridgePlugin.swift):
// what a foldable iPhone tells the web app about its screen and fold.
//
// Only the 1.2+ iOS app has the plugin. Everywhere else (Safari, the PWA,
// Android, older App Store builds, which get this web code too) the store
// stays null and lib/duo.ts keeps its space-based CSS rule.
import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";

/** A rect in CSS px (the web view isn't zoomed, so its points are CSS px). */
export type DuoRegion = { x: number; y: number; width: number; height: number; active: boolean };
/** @deprecated name kept for the fold; same shape as DuoRegion. */
export type DuoFold = DuoRegion;
export type DuoInsets = { top: number; left: number; bottom: number; right: number };
export type NativeDuoState = {
  verticalBarEdge: "left" | "right" | null;
  hingeStatus: "closed" | "partiallyOpen" | "fullyOpen" | null;
  hingeAngleDegrees: number | null;
  /** The crease (.division reserved region). */
  fold: DuoRegion | null;
  /** The web view's safe-area insets. */
  safeArea: DuoInsets | null;
  /** UIStatusBarManager's frame. On the Duo's vertical bar it's a 2px strip
   *  across the top, so it's passed on but not used for layout. */
  statusBar: DuoRegion | null;
  /** .occlusion reserved regions: the camera cutout, and on the Duo the block
   *  the vertical status bar's time and Wi-Fi sit in. */
  occlusions: DuoRegion[];
};

interface DuoBridgePlugin {
  getState(): Promise<NativeDuoState>;
  addListener(event: "duoChange", fn: (s: NativeDuoState) => void): Promise<PluginListenerHandle>;
}

const EMPTY: NativeDuoState = { verticalBarEdge: null, hingeStatus: null, hingeAngleDegrees: null, fold: null, safeArea: null, statusBar: null, occlusions: [] };

function region(raw: unknown): DuoRegion | null {
  const f = raw as Record<string, unknown> | null | undefined;
  return f && ["x", "y", "width", "height"].every((k) => typeof f[k] === "number" && Number.isFinite(f[k]))
    ? { x: f.x as number, y: f.y as number, width: f.width as number, height: f.height as number, active: f.active === true }
    : null;
}

/** Anything off the bridge, made safe: unknown values read as null. */
export function normalizeNativeDuoState(raw: unknown): NativeDuoState {
  const r = (raw ?? {}) as Record<string, unknown>;
  const edge = r.verticalBarEdge === "left" || r.verticalBarEdge === "right" ? r.verticalBarEdge : null;
  const hinge = r.hingeStatus === "closed" || r.hingeStatus === "partiallyOpen" || r.hingeStatus === "fullyOpen" ? r.hingeStatus : null;
  const angle = typeof r.hingeAngleDegrees === "number" && Number.isFinite(r.hingeAngleDegrees) ? r.hingeAngleDegrees : null;
  const i = r.safeArea as Record<string, unknown> | null | undefined;
  const safeArea = i && ["top", "left", "bottom", "right"].every((k) => typeof i[k] === "number" && Number.isFinite(i[k]))
    ? { top: i.top as number, left: i.left as number, bottom: i.bottom as number, right: i.right as number }
    : null;
  const occlusions = Array.isArray(r.occlusions) ? r.occlusions.map(region).filter((x): x is DuoRegion => !!x) : [];
  return { verticalBarEdge: edge, hingeStatus: hinge, hingeAngleDegrees: angle, fold: region(r.fold), safeArea, statusBar: region(r.statusBar), occlusions };
}

// ── The store ────────────────────────────────────────────────────────────────
// null = no plugin here (or not answered yet); otherwise its latest state.
let current: NativeDuoState | null = null;
let started = false;
let lastOcclusionCount = 0;
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
  // The geometry is measured against the viewport, which can settle after the
  // native event (a rotation): measure again when it does.
  window.addEventListener("resize", () => { if (current) applyToHtml(current); });
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

export type BarGeometry = {
  /** Distance from the bar edge to the center line of the system status
   *  items (time, Wi-Fi). */
  axisOffset: number;
  /** That center line, in px from the left of the viewport. */
  axisX: number;
  /** Where the column's controls may start: below the status items and any
   *  camera cutout in the column. */
  topClear: number;
  /** Room to keep at the bottom: the safe area, or an active occlusion. */
  bottomClear: number;
  /** Where the line came from: a camera cutout inside the status strip (the
   *  status items are drawn on its line), else the middle of the strip's
   *  occlusion region, else (when the system reports none) half the
   *  safe-area inset on that edge. */
  source: "camera" | "occlusion" | "safeArea";
};

/**
 * Where the side column's controls go, from what the system reports. The
 * status bar's own frame isn't usable on a vertical bar (UIKit reports a 2px
 * strip across the top), so the center line comes from the active .occlusion
 * regions against the bar edge: a camera cutout inside that strip if there is
 * one (the time and Wi-Fi are drawn on its line), else the strip's middle,
 * else half the safe-area inset on that edge. Null when the system names no
 * edge or reports no geometry.
 */
export function barGeometry(s: NativeDuoState, viewport: { width: number; height: number }): BarGeometry | null {
  const edge = s.verticalBarEdge;
  if (!edge || !s.safeArea) return null;
  const inset = s.safeArea[edge];
  const touchesEdge = (r: DuoRegion) => (edge === "right" ? r.x + r.width >= viewport.width - 2 : r.x <= 2);
  const active = s.occlusions.filter((r) => r.active);
  // The status items' block against the bar edge: at the top, or at the
  // bottom when the screen is turned the other way (the cover screen held
  // sideways).
  const strip = active.find((r) => touchesEdge(r) && r.width <= Math.max(inset, 1) * 1.5);
  // The status items are drawn on the camera's line where the camera sits in
  // the strip (the Duo's cover screen), which isn't the strip's middle.
  const camera = strip && active.find((r) => r !== strip && r.width < strip.width && r.x >= strip.x && r.x + r.width <= strip.x + strip.width);
  const fromEdge = (r: DuoRegion) => (edge === "right" ? viewport.width - (r.x + r.width / 2) : r.x + r.width / 2);
  const axisOffset = camera ? fromEdge(camera) : strip ? strip.width / 2 : inset > 0 ? inset / 2 : 0;
  if (axisOffset <= 0) return null;
  const axisX = edge === "right" ? viewport.width - axisOffset : axisOffset;
  // Anything active the column overlaps: the status items, a corner camera.
  const columnWidth = Math.max(axisOffset * 2, inset);
  const inColumn = (r: DuoRegion) => (edge === "right" ? r.x + r.width > viewport.width - columnWidth : r.x < columnWidth);
  const top = active.filter((r) => inColumn(r) && r.y < viewport.height / 2);
  const bottom = active.filter((r) => inColumn(r) && r.y >= viewport.height / 2);
  return {
    axisOffset,
    axisX,
    topClear: Math.max(s.safeArea.top, ...top.map((r) => r.y + r.height)),
    bottomClear: Math.max(s.safeArea.bottom, ...bottom.map((r) => viewport.height - r.y)),
    source: camera ? "camera" : strip ? "occlusion" : "safeArea",
  };
}

/**
 * The plugin's state on <html>, for screens built on it later (weigh station,
 * tripod mode): data-vertical-bar="left|right", data-hinge="closed|
 * partiallyOpen|fullyOpen", and --fold-x / --fold-width (CSS px) while the
 * fold is active. Each is absent when its value is null.
 */
export function applyToHtml(s: NativeDuoState, root: { setAttribute(n: string, v: string): void; removeAttribute(n: string): void; style: { setProperty(n: string, v: string): void; removeProperty(n: string): void } } | null =
  typeof document === "undefined" ? null : document.documentElement, viewport?: { width: number; height: number }) {
  if (!root) return;
  const vp = viewport ?? (typeof window === "undefined" ? { width: 0, height: 0 } : { width: window.innerWidth, height: window.innerHeight });
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
  // The side column's geometry (see barGeometry): data-bar-geometry plus
  // --bar-axis-x / --bar-axis-offset / --bar-top-clear / --bar-bottom-clear,
  // and each active occlusion as --occlusion-N-x / -y / -width / -height.
  const g = barGeometry(s, vp);
  const vars = ["--bar-axis-x", "--bar-axis-offset", "--bar-top-clear", "--bar-bottom-clear"];
  if (g) {
    root.setAttribute("data-bar-geometry", g.source);
    root.style.setProperty("--bar-axis-x", `${g.axisX}px`);
    root.style.setProperty("--bar-axis-offset", `${g.axisOffset}px`);
    root.style.setProperty("--bar-top-clear", `${g.topClear}px`);
    root.style.setProperty("--bar-bottom-clear", `${g.bottomClear}px`);
  } else {
    root.removeAttribute("data-bar-geometry");
    vars.forEach((v) => root.style.removeProperty(v));
  }
  const active = s.occlusions.filter((r) => r.active);
  for (let n = 0; n < Math.max(active.length, lastOcclusionCount); n++) {
    for (const k of ["x", "y", "width", "height"] as const) {
      if (n < active.length) root.style.setProperty(`--occlusion-${n}-${k}`, `${active[n][k]}px`);
      else root.style.removeProperty(`--occlusion-${n}-${k}`);
    }
  }
  lastOcclusionCount = active.length;
  if (active.length) root.setAttribute("data-occlusions", String(active.length));
  else root.removeAttribute("data-occlusions");
}

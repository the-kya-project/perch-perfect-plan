/**
 * Detection for the Capacitor native shell (App Store / Play Store builds).
 *
 * The native apps load the production site in a webview, and Capacitor
 * injects `window.Capacitor` into every page — including in remote-URL mode.
 * We read the injected global rather than importing @capacitor/core so the
 * web bundle stays free of Capacitor code.
 *
 * Inside the shell, PWA-isms must not apply: no "add to home screen"
 * prompts (you ARE the installed app), no service worker, and no web-push
 * (native push replaces it).
 */
type CapacitorGlobal = { isNativePlatform?: () => boolean; getPlatform?: () => string };

export function isNativeApp(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (window as { Capacitor?: CapacitorGlobal }).Capacitor;
  return cap?.isNativePlatform?.() === true;
}

/** "ios" | "android" | "web" — the shell platform. */
export function nativePlatform(): string {
  if (typeof window === "undefined") return "web";
  const cap = (window as { Capacitor?: CapacitorGlobal }).Capacitor;
  return cap?.getPlatform?.() ?? "web";
}

/** Sign in with Apple only makes sense on iOS (Android needs the heavier
 *  web-based Services-ID flow, and Apple-account users are on iOS anyway). */
export function isIOSApp(): boolean {
  return nativePlatform() === "ios";
}

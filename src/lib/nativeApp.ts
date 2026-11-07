/**
 * Detection for the Capacitor native shell (App Store / Play Store builds).
 *
 * The native apps load the production site in a webview, and Capacitor
 * injects `window.Capacitor` into every page — including in remote-URL mode.
 * We read the injected global rather than importing @capacitor/core so the
 * web bundle stays free of Capacitor code.
 *
 * Inside the shell, PWA-isms must not apply: no "add to home screen"
 * prompts (you ARE the installed app) and no web-push (native push replaces
 * it). The service worker runs in the Android shell only: WKWebView offers
 * none to an app without app-bound domains, so the iOS app has no worker and
 * notices releases through its version check instead (sw-register.ts,
 * releaseCheck.ts).
 */
type CapacitorGlobal = {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  isPluginAvailable?: (name: string) => boolean;
};

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

/**
 * Whether the installed native build has this plugin. Same answer as
 * Capacitor.isPluginAvailable (that is this injected global in remote-URL
 * mode), read without importing @capacitor/core. Web code reaches every
 * installed build at once, so a call into a plugin a build lacks must be
 * guarded: the plugin's proxy otherwise rejects with "… is not implemented".
 */
export function nativePluginAvailable(name: string): boolean {
  if (!isNativeApp()) return false;
  try {
    const cap = (window as { Capacitor?: CapacitorGlobal }).Capacitor;
    return cap?.isPluginAvailable?.(name) === true;
  } catch {
    return false;
  }
}

/** Sign in with Apple only makes sense on iOS (Android needs the heavier
 *  web-based Services-ID flow, and Apple-account users are on iOS anyway). */
export function isIOSApp(): boolean {
  return nativePlatform() === "ios";
}

/** Where "Continue with Apple" is offered: the iOS app (native sheet) and every
 *  browser (Supabase's web flow, through the Services ID). Not the Android app,
 *  whose native sign-in has no Apple setup. Without the web option, someone who
 *  signed up with Apple in the app had no way in once an email link opened Safari. */
export function appleSignInAvailable(): boolean {
  return !isNativeApp() || isIOSApp();
}

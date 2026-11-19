/**
 * The installed native app's own version and build, for analytics tags.
 *
 * `app_version` on our events is the web bundle's version (package.json),
 * which every installed build loads at once in remote-URL mode, so it can't
 * tell App Store builds apart. These tags come from the native shell itself
 * through Capacitor's App.getInfo(): `native_app_version` is the marketing
 * version (CFBundleShortVersionString / versionName, e.g. "1.2.0") and
 * `native_build` the build number (CFBundleVersion / versionCode, e.g. "13").
 *
 * The App plugin has been in every store build since the first native shell
 * (July 2026), so this works on builds already installed. A build without it,
 * or a plain browser, gets null and its events carry no native tags.
 */
import { isNativeApp, nativePluginAvailable } from "./nativeApp";

export type NativeAppTags = { native_app_version: string; native_build: string };

const MAX_LEN = 32;

function clean(v: unknown): string | null {
  if (typeof v !== "string" && typeof v !== "number") return null;
  const s = String(v).trim();
  if (!s || s.length > MAX_LEN) return null;
  // Version strings only: digits, letters, dots, dashes, plus, underscore.
  return /^[0-9A-Za-z.+_-]+$/.test(s) ? s : null;
}

/** App.getInfo()'s result → tags, or null when either value is missing or odd. */
export function nativeAppTagsFrom(info: unknown): NativeAppTags | null {
  if (!info || typeof info !== "object") return null;
  const { version, build } = info as { version?: unknown; build?: unknown };
  const v = clean(version);
  const b = clean(build);
  return v && b ? { native_app_version: v, native_build: b } : null;
}

let pending: Promise<NativeAppTags | null> | null = null;

/**
 * Read the tags once per page load. Never throws; resolves null on the web,
 * on a build without the App plugin, on failure, or after `timeoutMs`.
 */
export function loadNativeAppTags(timeoutMs = 1500): Promise<NativeAppTags | null> {
  if (pending) return pending;
  if (!isNativeApp() || !nativePluginAvailable("App")) {
    pending = Promise.resolve(null);
    return pending;
  }
  const read = (async () => {
    try {
      const { App } = await import("@capacitor/app");
      return nativeAppTagsFrom(await App.getInfo());
    } catch {
      return null;
    }
  })();
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs));
  pending = Promise.race([read, timeout]);
  return pending;
}

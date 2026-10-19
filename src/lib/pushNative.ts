/**
 * Native push registration (APNs on iOS, FCM on Android).
 *
 * The web path in `push.ts` stays exactly as it was -- this is the parallel
 * path the Capacitor shell uses. `detectPushSupport()` still returns
 * `native-app` for the shell, so the two never both register for one device.
 *
 * The plugin is imported DYNAMICALLY. It must not be pulled into the web
 * bundle, where `@capacitor/push-notifications` has no implementation and the
 * import would cost bytes for nothing.
 */
import { isNativeApp } from "./nativeApp";

export type NativeRegisterResult =
  | { ok: true; token: string; transport: "apns" | "fcm" }
  | { ok: false; reason: "not-native" | "denied" | "no-token" | "error"; detail?: string };

/** iOS gets APNs tokens, Android FCM registration tokens. */
function transportForPlatform(platform: string): "apns" | "fcm" {
  return platform === "ios" ? "apns" : "fcm";
}

/**
 * Is the push plugin actually IN this binary?
 *
 * This matters because web code ships independently of the native shell: a
 * Vercel deploy reaches every already-installed app instantly, including the
 * builds that predate native push. Without this check those users would get an
 * "enable push" button that can only ever fail, because the plugin they'd be
 * calling does not exist in their binary. They keep the "coming soon" message
 * until they update.
 */
export async function nativePushAvailable(): Promise<boolean> {
  if (!isNativeApp()) return false;
  try {
    const { Capacitor } = await import("@capacitor/core");
    return Capacitor.isPluginAvailable("PushNotifications");
  } catch {
    return false;
  }
}

/**
 * Ask the OS for notification permission and resolve with the device token.
 *
 * Capacitor delivers the token through an EVENT, not the return value of
 * `register()`, so this wraps the listener pair in a promise with a timeout --
 * otherwise a device that never fires either event would hang the settings UI
 * forever.
 */
export async function registerForNativePush(): Promise<NativeRegisterResult> {
  if (!isNativeApp()) return { ok: false, reason: "not-native" };

  try {
    const [{ PushNotifications }, { Capacitor }] = await Promise.all([
      import("@capacitor/push-notifications"),
      import("@capacitor/core"),
    ]);

    let perm = await PushNotifications.checkPermissions();
    if (perm.receive === "prompt" || perm.receive === "prompt-with-rationale") {
      perm = await PushNotifications.requestPermissions();
    }
    // "denied" is terminal: iOS will not re-prompt, so the only way back is the
    // system settings app. The caller surfaces that rather than retrying.
    if (perm.receive !== "granted") return { ok: false, reason: "denied" };

    const transport = transportForPlatform(Capacitor.getPlatform());

    const token = await new Promise<string | null>((resolve) => {
      let settled = false;
      const done = (value: string | null) => {
        if (settled) return;
        settled = true;
        // Remove only our two listeners; other push listeners stay attached.
        regHandle.then((h) => h.remove()).catch(() => {});
        errHandle.then((h) => h.remove()).catch(() => {});
        resolve(value);
      };

      const regHandle = PushNotifications.addListener("registration", (t) => done(t.value));
      const errHandle = PushNotifications.addListener("registrationError", (e) => {
        console.error("[push] native registration error", e);
        done(null);
      });

      setTimeout(() => done(null), 15_000);
      void PushNotifications.register();
    });

    if (!token) return { ok: false, reason: "no-token" };
    return { ok: true, token, transport };
  } catch (err) {
    return { ok: false, reason: "error", detail: String(err) };
  }
}

/** Current OS permission state for the shell, without prompting. */
export async function nativePushPermission(): Promise<"granted" | "denied" | "prompt" | "unknown"> {
  if (!isNativeApp()) return "unknown";
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    const p = await PushNotifications.checkPermissions();
    if (p.receive === "granted") return "granted";
    if (p.receive === "denied") return "denied";
    return "prompt";
  } catch {
    return "unknown";
  }
}

/**
 * Per-device "I turned push off" marker.
 *
 * Switching push off unregisters and drops the server row, but iOS permission
 * stays "granted" -- so without this, the silent re-sync below would quietly
 * turn push back on at the next launch. localStorage is per-install, which is
 * the right scope: a reinstall starts fresh, as the OS permission does.
 */
const OPT_OUT_KEY = "kya_native_push_opted_out";

export function setNativePushOptedOut(optedOut: boolean): void {
  try {
    if (optedOut) window.localStorage.setItem(OPT_OUT_KEY, "1");
    else window.localStorage.removeItem(OPT_OUT_KEY);
  } catch {
    /* storage unavailable: worst case the next launch re-syncs */
  }
}

export function nativePushOptedOut(): boolean {
  try {
    return window.localStorage.getItem(OPT_OUT_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Re-send this device's current token to the server, without prompting.
 *
 * APNs/FCM tokens change on reinstall, restore to a new phone, or a switch
 * between TestFlight and App Store builds, and Apple keeps answering 200 for
 * the old token for a while -- so a stale row looks like a successful send
 * while nothing reaches the phone. Run at launch and on sign-in so the row
 * always points at the token this install actually has.
 *
 * No-op unless permission is already granted and the user has not switched
 * push off on this device. `save` is passed in so this module stays free of
 * server-function imports.
 */
export async function syncNativePushToken(
  save: (token: string, transport: "apns" | "fcm") => Promise<unknown>,
): Promise<void> {
  if (!isNativeApp() || nativePushOptedOut()) return;
  if (!(await nativePushAvailable())) return;
  if ((await nativePushPermission()) !== "granted") return;
  const res = await registerForNativePush();
  if (!res.ok) return;
  try {
    await save(res.token, res.transport);
  } catch (err) {
    console.error("[push] native token sync failed", err);
  }
}

/** Stop receiving on this device (used when the toggle is switched off). */
export async function unregisterNativePush(): Promise<void> {
  if (!isNativeApp()) return;
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    await PushNotifications.unregister();
  } catch (err) {
    console.error("[push] native unregister failed", err);
  }
}

/**
 * Wire up tap handling once, at app boot.
 *
 * The server sends a `url` alongside the alert (see pushSender.server.ts), so a
 * tapped notification lands on the relevant screen instead of just opening the
 * app. Navigation is delegated so this module stays router-agnostic.
 */
export async function attachNativePushHandlers(navigate: (url: string) => void): Promise<void> {
  if (!isNativeApp()) return;
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    await PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
      const data = action.notification.data as Record<string, unknown> | undefined;
      const url = typeof data?.url === "string" ? data.url : "";
      // Only ever follow in-app paths. A push payload is remote input; sending
      // the shell to an arbitrary origin off the back of one is not acceptable.
      if (url.startsWith("/")) navigate(url);
    });
  } catch (err) {
    console.error("[push] could not attach native push handlers", err);
  }
}

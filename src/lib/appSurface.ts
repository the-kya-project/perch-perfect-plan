/**
 * Which surface the owner is on, and what the reminders step should say there.
 *
 * Shared by the two getting-started checklists so they cannot drift apart, and
 * deliberately the same vocabulary as the Settings callout: inside the app we
 * ask for push, on a phone browser we point at the store, on a desktop we leave
 * web push alone because it genuinely works there.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getLocalUser } from "@/integrations/supabase/currentUser";
import { isNativeApp } from "./nativeApp";
import { detectWebPlatform } from "./storeLinks";
import { nativePushPermission } from "./pushNative";

export type AppSurface = "native" | "mobile-web" | "desktop";

export interface SurfaceState {
  surface: AppSurface;
  /** Phone browsers only: which store to point at. */
  storePlatform: "ios" | "android";
  /** In the app: the real OS permission. "prompt" covers not-yet-asked. */
  nativePermission: "granted" | "denied" | "prompt";
  /**
   * Phone browsers only: has this ACCOUNT ever registered a device token? It is
   * the closest thing to "they have the app", and it is the honest answer to
   * "is this step done" — the browser cannot see whether an app is installed.
   */
  hasNativeDevice: boolean;
  /** False until the async reads land, so a row does not flicker done/undone. */
  ready: boolean;
}

export function useAppSurface(): SurfaceState {
  const native = isNativeApp();
  const webPlatform = detectWebPlatform();
  const surface: AppSurface = native ? "native" : webPlatform === "desktop" ? "desktop" : "mobile-web";

  const [nativePermission, setNativePermission] = useState<"granted" | "denied" | "prompt">("prompt");
  const [hasNativeDevice, setHasNativeDevice] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (native) {
        const p = await nativePushPermission();
        // "unknown" means the shell could not answer — treat it as not-yet-asked,
        // the same as Settings, so the owner gets a working button rather than
        // a silent row.
        if (!cancelled) setNativePermission(p === "granted" || p === "denied" ? p : "prompt");
      } else if (surface === "mobile-web") {
        const { data: u } = await getLocalUser();
        if (u.user) {
          // RLS limits this to the reader's own rows.
          const { data } = await supabase
            .from("push_subscriptions")
            .select("id")
            .eq("user_id", u.user.id)
            .in("transport", ["apns", "fcm"])
            .limit(1);
          if (!cancelled) setHasNativeDevice((data?.length ?? 0) > 0);
        }
      }
      if (!cancelled) setReady(true);
    })();

    // Coming back from the OS settings screen should clear a denied row.
    const recheck = async () => {
      if (!native) return;
      const p = await nativePushPermission();
      if (!cancelled) setNativePermission(p === "granted" || p === "denied" ? p : "prompt");
    };
    window.addEventListener("focus", recheck);
    window.addEventListener("visibilitychange", recheck);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", recheck);
      window.removeEventListener("visibilitychange", recheck);
    };
    // Mount-once: neither `native` nor `surface` can change within a session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    surface,
    storePlatform: webPlatform === "android" ? "android" : "ios",
    nativePermission,
    hasNativeDevice,
    ready,
  };
}

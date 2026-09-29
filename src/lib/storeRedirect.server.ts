/**
 * Where a store link should actually land, and recording that it was tapped.
 *
 * Shared by /get-app and /review. Both are opened from an inbox, so the reader
 * is usually signed out and often inside a mail app's in-app browser — the
 * user agent is the only signal available, and it is enough to tell an iPhone
 * from an Android from a laptop.
 */
export const APP_STORE_ID = "6795267221";
export const ANDROID_PACKAGE = "com.thekyaproject.app";

export const STORE = {
  ios: `https://apps.apple.com/app/id${APP_STORE_ID}`,
  android: `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`,
  iosReview: `https://apps.apple.com/app/id${APP_STORE_ID}?action=write-review`,
  androidReview: `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}&showAllReviews=true`,
};

export type Resolved = "ios" | "android" | "chooser";

/**
 * iPadOS reports itself as a Mac, so the touch hint is checked too — an iPad
 * should reach the App Store, not the desktop chooser. A `store` override from
 * the badge links wins outright: those always go straight to their own store,
 * whatever the reader is holding.
 */
export function resolveTarget(userAgent: string, storeOverride?: string | null): Resolved {
  if (storeOverride === "ios") return "ios";
  if (storeOverride === "android") return "android";
  const ua = userAgent || "";
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Macintosh/i.test(ua) && /Mobile|Touch/i.test(ua)) return "ios"; // iPadOS
  if (/Android/i.test(ua)) return "android";
  return "chooser";
}

/**
 * Record the tap. Never throws and never blocks the redirect: a reader tapping
 * a store badge must reach the store even if logging is broken.
 */
export async function logClick(o: {
  path: "get-app" | "review";
  url: URL;
  userAgent: string;
  resolved: Resolved;
}): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // app_launch_clicks postdates the generated types, same as the monthly
    // hook's tables do.
    await (supabaseAdmin as any).from("app_launch_clicks").insert({
      path: o.path,
      utm_content: o.url.searchParams.get("utm_content"),
      utm_source: o.url.searchParams.get("utm_source"),
      utm_campaign: o.url.searchParams.get("utm_campaign"),
      resolved: o.resolved,
      user_agent: o.userAgent.slice(0, 400) || null,
    });
  } catch {
    /* the redirect matters more than the metric */
  }
}

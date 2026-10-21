/**
 * Native shell only: open a Universal Link / App Link on the screen it points
 * to. Which links reach the app at all is decided in appLinks.ts.
 *
 * Two ways a link arrives, and both are needed:
 *   - getLaunchUrl(): the link that cold-started the app. The shell boots on
 *     the home page (server.url), so without this the person would land on
 *     home rather than the screen they tapped.
 *   - appUrlOpen: a link tapped while the app is running or suspended.
 * On a cold start iOS can report the same link through both, so a repeat of
 * the link just handled is ignored. That matters for tracked email links,
 * where a second load would log the click twice.
 *
 * The plugin is imported DYNAMICALLY, as in pushNative.ts, so the web bundle
 * carries no Capacitor code.
 */
import { incomingLink } from "./appLinks";
import { isNativeApp } from "./nativeApp";

const REPEAT_MS = 5_000;
const LAUNCH_KEY = "kya-launch-link";

export async function attachAppLinkHandler(navigate: (href: string) => void): Promise<void> {
  if (!isNativeApp()) return;
  let last: { url: string; at: number } | null = null;

  const open = (url: string | undefined) => {
    if (!url) return;
    const now = Date.now();
    if (last && last.url === url && now - last.at < REPEAT_MS) return;
    last = { url, at: now };
    const link = incomingLink(url);
    if (!link) return;
    if (link.kind === "route") navigate(link.href);
    // A tracked email link: load it as a page so the server logs the click and
    // redirects to the screen. Same origin as the shell, so it stays in-app.
    else window.location.assign(link.href);
  };

  try {
    const { App } = await import("@capacitor/app");
    await App.addListener("appUrlOpen", (event) => open(event.url));
    // getLaunchUrl keeps returning the link that started the app for as long
    // as the app runs, so after any full page load (a tracked link, a reload)
    // it would be handled again — and a tracked link loads a page, which
    // would loop. Handle each launch link once per app run.
    const launch = await App.getLaunchUrl();
    if (launch?.url) {
      let seen = false;
      try {
        seen = sessionStorage.getItem(LAUNCH_KEY) === launch.url;
        sessionStorage.setItem(LAUNCH_KEY, launch.url);
      } catch { /* storage blocked: the 5s repeat guard still applies */ }
      if (!seen) open(launch.url);
    }
  } catch (err) {
    console.error("[app-links] could not attach the link handler", err);
  }
}

// The native shell's status-bar strip (`html.native-app body::before` in
// styles.css) is forest by default, because nearly every screen opens with a
// forest header. A screen with no forest header under the clock calls
// useStatusBarColor() with the color at the top of the page so the strip
// matches it; leaving the screen puts it back to forest. In the browser and
// the PWA the strip doesn't exist, so this only changes a CSS variable.
import { useEffect } from "react";

/** Tint the native status-bar strip `color` while this screen is shown. */
export function useStatusBarColor(color: string) {
  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    root.style.setProperty("--status-bar-bg", color);
    return () => {
      // Only reset if no later screen has set its own color in the meantime.
      if (root.style.getPropertyValue("--status-bar-bg") === color) root.style.removeProperty("--status-bar-bg");
    };
  }, [color]);
}

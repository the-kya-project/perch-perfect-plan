/**
 * Which notifications callout applies. Pure, and kept out of the component
 * file so it can be read and tested without rendering anything.
 */
import type { WebPlatform } from "@/lib/storeLinks";

export type CalloutState =
  | { kind: "native-prompt" }
  | { kind: "native-denied"; canOpenSettings: boolean }
  | { kind: "native-granted" }
  | { kind: "web-mobile"; platform: "ios" | "android" }
  | { kind: "web-desktop" };

export function calloutState(o: {
  native: boolean;
  permission: "granted" | "denied" | "default";
  webPlatform: WebPlatform;
  canOpenSettings: boolean;
}): CalloutState {
  if (o.native) {
    if (o.permission === "granted") return { kind: "native-granted" };
    if (o.permission === "denied") return { kind: "native-denied", canOpenSettings: o.canOpenSettings };
    return { kind: "native-prompt" };
  }
  if (o.webPlatform === "desktop") return { kind: "web-desktop" };
  return { kind: "web-mobile", platform: o.webPlatform };
}

// Open a private Storage object in a new tab, from any surface.
//
// The subtlety this exists to hold in ONE place: the blank tab must be opened
// SYNCHRONOUSLY inside the click handler, then pointed at the signed URL once
// it resolves. Signing is async, so a window.open after the await is not
// attributable to a user gesture and Safari blocks it as a popup. The journal
// editor and the entry read view both open files this way; a second copy of
// this would drift, and would drift silently because the failure only shows up
// in one browser.
import { useState } from "react";
import { toast } from "sonner";

export function useOpenSignedFile() {
  // Which control is mid-signature, so the caller can spin that row only.
  const [openingKey, setOpeningKey] = useState<string | null>(null);

  /**
   * @param key    identifies the tapped control (attachment id, "photo", …)
   * @param resolve returns the signed URL; a nullish result is reported as a
   *                failure rather than navigating the tab to nothing.
   */
  async function openSigned(key: string, resolve: () => Promise<string | null | undefined>) {
    if (openingKey) return; // one at a time — a double tap shouldn't spawn two tabs
    setOpeningKey(key);
    const tab = window.open("", "_blank");
    try {
      const url = await resolve();
      if (!url) throw new Error("That file couldn't be opened.");
      if (tab) tab.location.href = url;
      else window.location.assign(url); // popup blocked outright — use this tab
    } catch (err: any) {
      tab?.close();
      toast.error(err?.message ?? "That file couldn't be opened.");
    } finally {
      setOpeningKey(null);
    }
  }

  return { openingKey, openSigned };
}

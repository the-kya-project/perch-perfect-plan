// Populate profiles.locale from the browser language on sign-in, once, if it's
// never been set. This is the ONLY place a user's language is captured for
// server-side email rendering (emails run where navigator.language doesn't
// exist). Overridable later in account settings.
//
// Best-effort and idempotent: null locale simply means English emails, so any
// failure here is harmless. `en` is a real value (means "detected English"), so
// a populated row is never re-touched.

import { supabase } from "@/integrations/supabase/client";
import { pickLocale } from "@/lib/i18n/config";

let ran = false;

export async function ensureProfileLocale(userId: string): Promise<void> {
  if (ran || typeof navigator === "undefined") return;
  ran = true;
  try {
    const { data } = await supabase.from("profiles").select("locale").eq("id", userId).maybeSingle();
    // Only set when the row exists and locale is still null ("never set").
    if (data && (data as { locale?: string | null }).locale == null) {
      const locale = pickLocale(navigator.language);
      await supabase.from("profiles").update({ locale } as never).eq("id", userId);
    }
  } catch {
    /* best-effort — a missing locale falls back to English on send */
  }
}

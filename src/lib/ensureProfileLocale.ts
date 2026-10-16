// Populate profiles.locale from the browser language on sign-in, once, if it's
// never been set. This is the ONLY place a user's language is captured for
// server-side email rendering (emails run where navigator.language doesn't
// exist). Overridable later in account settings.
//
// Best-effort and idempotent: null locale simply means English emails, so any
// failure here is harmless. `en` is a real value (means "detected English"), so
// a populated row is never re-touched.
//
// Also applies the saved locale to the owner app (applyOwnerLocale — a no-op
// until OWNER_I18N_ENABLED), so the in-app language follows the same value.

import { supabase } from "@/integrations/supabase/client";
import { pickLocale } from "@/lib/i18n/config";
import { applyOwnerLocale } from "@/lib/i18n/ownerLocale";

let ranFor: string | null = null; // once per signed-in account

export async function ensureProfileLocale(userId: string): Promise<void> {
  if (ranFor === userId || typeof navigator === "undefined") return;
  ranFor = userId;
  try {
    const { data } = await supabase.from("profiles").select("locale").eq("id", userId).maybeSingle();
    const saved = (data as { locale?: string | null } | null)?.locale ?? null;
    // Only set when the row exists and locale is still null ("never set").
    if (data && saved == null) {
      const locale = pickLocale(navigator.language);
      await supabase.from("profiles").update({ locale } as never).eq("id", userId);
    }
    applyOwnerLocale(saved);
  } catch {
    /* best-effort — a missing locale falls back to English on send */
  }
}

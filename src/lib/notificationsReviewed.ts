import { getLocalUser } from "@/integrations/supabase/currentUser";

// Records that the owner has reviewed their notification preferences (called
// from the settings page). The flag lives in localStorage scoped BY ACCOUNT
// (`<key>:<uid>`) so a second account on a shared browser starts fresh.
const NOTIF_KEY = "ppc_owner_notif_reviewed";

export async function markNotificationsReviewed() {
  try {
    const { data: u } = await getLocalUser();
    if (u.user) window.localStorage.setItem(`${NOTIF_KEY}:${u.user.id}`, "1");
  } catch { /* ignore */ }
}

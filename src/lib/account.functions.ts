// Permanent account deletion. The authenticated caller can wipe only their
// own data; service-role is loaded inside the handler so it never enters
// the client bundle.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const deleteMyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const userId = context.userId;

    // Best-effort wipe of storage objects owned by this user, then DB rows,
    // then the auth user itself. ON DELETE CASCADE on related tables takes
    // care of children of birds/sits/care_plans, but we delete explicitly
    // so anything without a cascade still goes.
    const { data: birds } = await supabaseAdmin
      .from("birds")
      .select("id")
      .eq("owner_id", userId);
    const birdIds = (birds ?? []).map((b: any) => b.id as string);

    // Remove any storage objects under the user's photo prefix.
    try {
      const { data: files } = await supabaseAdmin.storage
        .from("bird-photos")
        .list(userId, { limit: 1000 });
      if (files && files.length) {
        await supabaseAdmin.storage
          .from("bird-photos")
          .remove(files.map((f: any) => `${userId}/${f.name}`));
      }
    } catch {
      // non-fatal — proceed with row deletes
    }

    if (birdIds.length) {
      // Children of birds
      await supabaseAdmin.from("photo_logs").delete().in("bird_id", birdIds);
      await supabaseAdmin.from("weight_logs").delete().in("bird_id", birdIds);
      await supabaseAdmin.from("daily_logs").delete().in("bird_id", birdIds);
      await supabaseAdmin.from("emergency_contacts").delete().in("bird_id", birdIds);

      const { data: plans } = await supabaseAdmin
        .from("care_plans")
        .select("id")
        .in("bird_id", birdIds);
      const planIds = (plans ?? []).map((p: any) => p.id as string);
      if (planIds.length) {
        await supabaseAdmin.from("routine_tasks").delete().in("care_plan_id", planIds);
      }
      await supabaseAdmin.from("care_plans").delete().in("bird_id", birdIds);
      await supabaseAdmin.from("sit_birds").delete().in("bird_id", birdIds);
    }

    // Sits owned by this user
    const { data: sits } = await supabaseAdmin
      .from("sits")
      .select("id")
      .eq("owner_id", userId);
    const sitIds = (sits ?? []).map((s: any) => s.id as string);
    if (sitIds.length) {
      await supabaseAdmin.from("task_completions").delete().in("sit_id", sitIds);
      await supabaseAdmin.from("sit_checklist_items").delete().in("sit_id", sitIds);
      await supabaseAdmin.from("sit_birds").delete().in("sit_id", sitIds);
      await supabaseAdmin.from("photo_logs").delete().in("sit_id", sitIds);
      await supabaseAdmin.from("daily_logs").delete().in("sit_id", sitIds);
    }
    await supabaseAdmin.from("sits").delete().eq("owner_id", userId);
    await supabaseAdmin.from("birds").delete().eq("owner_id", userId);
    await supabaseAdmin.from("owner_emergency_defaults").delete().eq("owner_id", userId);

    // Marketing-contact record + profile
    await supabaseAdmin.from("profiles").delete().eq("id", userId);

    // Finally, delete the auth user (also revokes all sessions).
    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (error) throw new Error(error.message);

    return { ok: true };
  });

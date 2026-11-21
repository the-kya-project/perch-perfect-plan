// Community waitlist signup (WaitlistCard: Explore, Duo Explore, and "Get
// launch news" on /founding once it's full).
//
// Until Nov 2026 this replayed the hosted Brevo form's POST. Brevo was then
// the only record, and an audit found its list empty with no way to recover
// who had joined. Now, server-side:
//   1. Save the person in public.waitlist_signups (service role; admins read).
//   2. Add them to Brevo list 4 "TKP Waitlist" (BREVO_WAITLIST_LIST_ID,
//      Production only) with their name, chapter answers and
//      SOURCE=waitlist-app, through addContactToListReported, so a missing
//      setting or a Brevo error raises a save-error alert.
//   3. Write what happened to the row's brevo_status, so a backfill can find
//      anyone Brevo missed.
// Consent: the card says "we'll email you when the community opens", so list
// 4 only, never the marketing list.
//
// The person sees success when either our copy or Brevo has them. Only when
// both fail do they see "Couldn't add you just now."

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type WaitlistResult = { ok: boolean; error?: "save-failed" };

const WaitlistInput = z.object({
  email: z.string().trim().email().max(254),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  chapterLeadInterest: z.enum(["1", "2"]),
  primaryChapter: z.enum(["1", "2", "3", "4", "5", "6", "7", "8", "9"]),
});

export const joinWaitlist = createServerFn({ method: "POST" })
  .inputValidator((d: {
    email: string;
    firstName: string;
    lastName: string;
    chapterLeadInterest: "1" | "2";
    primaryChapter: string;
  }) => WaitlistInput.parse(d))
  .handler(async ({ data }): Promise<WaitlistResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { addContactToListReported, listAddStatus, recordServerSaveError } = await import("./serverSaveErrors.server");
    const { classifySaveError } = await import("./saveErrors");
    // The table postdates the generated types.
    const db = supabaseAdmin as unknown as { from: (t: string) => any };

    const lead = Number(data.chapterLeadInterest) as 1 | 2;
    const chapter = Number(data.primaryChapter);

    // 1. Our own copy. One row per address: joining again updates it.
    let saved = false;
    const { error: saveErr } = await db.from("waitlist_signups").upsert(
      {
        email: data.email,
        first_name: data.firstName,
        last_name: data.lastName,
        chapter_lead_interest: lead,
        primary_chapter: chapter,
        source: "waitlist-app",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "email_normalized" },
    );
    if (saveErr) {
      console.error("[waitlist] saving our copy failed", saveErr.message);
      const shape = classifySaveError(saveErr) ?? { category: "database" as const, sqlstate: null, target: null, operation: null };
      await recordServerSaveError({ ...shape, target: "waitlist_signups", operation: "write" }, "/waitlist");
    } else {
      saved = true;
    }

    // 2. Brevo list 4.
    const result = await addContactToListReported(
      "BREVO_WAITLIST_LIST_ID",
      {
        email: data.email,
        firstName: data.firstName,
        lastName: data.lastName,
        source: "waitlist-app",
        chapterLeadInterest: lead,
        primaryChapter: chapter,
      },
      { route: "/waitlist" },
    );

    // 3. What Brevo did, on our copy.
    if (saved) {
      const { error: statusErr } = await db
        .from("waitlist_signups")
        .update({ brevo_status: listAddStatus(result), brevo_synced_at: result.ok ? new Date().toISOString() : null })
        .eq("email_normalized", data.email.trim().toLowerCase());
      if (statusErr) console.error("[waitlist] brevo_status not saved", statusErr.message);
    }

    // A preview never reaches Brevo by design: our copy is the success there.
    if (saved || result.ok) return { ok: true };
    return { ok: false, error: "save-failed" };
  });

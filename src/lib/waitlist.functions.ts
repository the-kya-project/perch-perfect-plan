// Community waitlist signup → The Kya Project's Brevo form.
//
// Runs server-side (createServerFn) and replicates the hosted Brevo form's own
// POST (multipart/form-data to its /v2/serve endpoint). Going through the form
// means Brevo handles the list assignment, double opt-in, and category-attribute
// mapping exactly as the public form does — no API key or list id needed here.
// The form token is public (it's embedded in the marketing site).
//
// Fields mirror the Brevo form: EMAIL, FIRSTNAME, LASTNAME, CHAPTER_LEAD_INTEREST
// (1=Yes, 2=No), PRIMARY_CHAPTER (1–9 region ids). `email_address_check` is the
// form's honeypot and must be sent empty.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const BREVO_WAITLIST_FORM =
  "https://f02c1e04.sibforms.com/v2/serve/MUIFAKCPkPCAPuuR23EylSkqStad72B2X4wwnloJW_CbAW7Rdpt1H59RVK2Ec8e6TwVrU8D8Q1cHhWS8aDYLdwVFFNxaoEYzw_U0HNQVQ3aE3X5JZOhvfZ-N4dTGa_E_8p2DhYJY3kDv5nyilZPUillkKJMp1b1koWMICP7Fj0Yj5CfcMpyPQobYb-SQDrhMwB-MngLQaOmcvhJBsg==";

export type WaitlistResult = { ok: boolean; error?: "brevo-rejected" | "network" };

export const joinWaitlist = createServerFn({ method: "POST" })
  .inputValidator((d: {
    email: string;
    firstName: string;
    lastName: string;
    chapterLeadInterest: "1" | "2";
    primaryChapter: string;
  }) =>
    z
      .object({
        email: z.string().email(),
        firstName: z.string().trim().min(1).max(80),
        lastName: z.string().trim().min(1).max(80),
        chapterLeadInterest: z.enum(["1", "2"]),
        primaryChapter: z.enum(["1", "2", "3", "4", "5", "6", "7", "8", "9"]),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<WaitlistResult> => {
    const form = new FormData();
    form.set("EMAIL", data.email.trim());
    form.set("FIRSTNAME", data.firstName.trim());
    form.set("LASTNAME", data.lastName.trim());
    form.set("CHAPTER_LEAD_INTEREST", data.chapterLeadInterest);
    form.set("PRIMARY_CHAPTER", data.primaryChapter);
    form.set("email_address_check", ""); // honeypot — must stay empty
    form.set("locale", "en");

    try {
      const res = await fetch(BREVO_WAITLIST_FORM, { method: "POST", body: form });
      const json = (await res.json().catch(() => null)) as { success?: boolean } | null;
      if (res.ok && json?.success === true) return { ok: true };
      console.error("[waitlist] Brevo form rejected", res.status, JSON.stringify(json));
      return { ok: false, error: "brevo-rejected" };
    } catch (err) {
      console.error("[waitlist] network error", err);
      return { ok: false, error: "network" };
    }
  });

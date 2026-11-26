// Rescue partner codes (backlog 1.16). Data and the pure helpers
// scripts/flock-shell.test.ts pins. Every read and write goes through database
// functions (20261126130000_flock_rescue_codes.sql), which check the Flock
// gate (adopters) or admin (partners and review). Flock code only: the join
// screen, /flock/rescue, /admin/rescues and /admin/review import it, and the
// redeem page loads its link only once flock_enabled() is true.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const sb = supabase as any;
function must<T>(r: { data: T; error: unknown }): T {
  if (r.error) throw r.error;
  return r.data;
}
const asArray = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

/** Why a code can't be used, as the database answers. */
export type RescueReason = "founder" | "already_redeemed" | "rate_limited" | "invalid";
export type RescueStatus = "pending" | "approved" | "declined";

export type MyRescue = {
  redemption_id: string | null;
  status: RescueStatus | null;
  partner_name: string | null;
  bird_name: string | null;
  species: string | null;
  adopted_on: string | null;
  created_at: string | null;
  starts_at: string | null;
  ends_at: string | null;
  seen: boolean;
  has_founding: boolean;
};

export type RescuePartner = {
  partner_id: string; name: string; code: string; use_limit: number | null; paused: boolean;
  approved: number; pending: number; created_at: string;
};

export type RescueRedemption = {
  redemption_id: string; partner_id: string; partner_name: string; bird_name: string; species: string;
  adopted_on: string; account_name: string | null; status: RescueStatus; created_at: string;
  reviewed_at: string | null; has_founding: boolean;
};

/** Field limits, the same as the tables' checks. */
export const RESCUE_LIMITS = { birdName: 60, species: 80, partnerName: 120, codeMin: 4, codeMax: 30 } as const;
/** How long an approved adoption lasts. The database's private.rescue_months(). */
export const RESCUE_MONTHS = 6;

export const rescueKeys = {
  mine: ["flock", "rescue", "mine"] as const,
  partners: ["flock", "rescue", "partners"] as const,
  review: (status: RescueStatus) => ["flock", "review", "rescues", status] as const,
};

// ---- Pure helpers -----------------------------------------------------------------------

/** Capitals, letters and digits only, the same as private.rescue_code_clean. */
export function cleanRescueCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function rescueCodeLooksValid(code: string): boolean {
  const c = cleanRescueCode(code);
  return c.length >= RESCUE_LIMITS.codeMin && c.length <= RESCUE_LIMITS.codeMax;
}

/** Today in the Flock's time zone (Eastern), as YYYY-MM-DD: the latest
 *  adoption date the form accepts. */
export function flockTodayIso(now: Date = new Date()): string {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  return p;
}

/** The form's own checks, before anything is sent: which field is missing or wrong. */
export function adoptionProblem(d: { birdName: string; species: string; adoptedOn: string }, today = flockTodayIso()): "bird_name" | "species" | "adopted_on" | null {
  const name = d.birdName.trim();
  if (!name || name.length > RESCUE_LIMITS.birdName) return "bird_name";
  const species = d.species.trim();
  if (!species || species.length > RESCUE_LIMITS.species) return "species";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.adoptedOn) || d.adoptedOn > today || d.adoptedOn < "1950-01-01") return "adopted_on";
  return null;
}

/** What the adopter's rescue screen shows. */
export type RescueStep = "code" | "pending" | "welcome" | "declined" | "founder";
export function rescueStep(mine: MyRescue | null | undefined): RescueStep {
  if (!mine) return "code";
  if (mine.status === "pending") return "pending";
  if (mine.status === "approved") return "welcome";
  if (mine.has_founding) return "founder";
  if (mine.status === "declined" && !mine.seen) return "declined";
  return "code";
}

/** A pasted or typed use limit: blank = no limit, otherwise a whole number 1 to 100,000. */
export function parseUseLimit(v: string): number | null | "bad" {
  const t = v.trim();
  if (!t) return null;
  if (!/^\d+$/.test(t)) return "bad";
  const n = Number(t);
  return n >= 1 && n <= 100000 ? n : "bad";
}

export function rescueErrorKind(e: unknown): string {
  const msg = String((e as { message?: string })?.message ?? "");
  for (const k of ["bird_name", "species", "adopted_on", "code_taken", "already_reviewed", "founder", "use_limit", "name", "code"]) {
    if (msg === k || msg.includes(k)) return k;
  }
  if ((e as { code?: string })?.code === "42501") return "closed";
  return "other";
}

/** An Eastern date for copy: "January 6, 2028". */
export function rescueDate(iso: string | null, lang = "en-US"): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString(lang, { month: "long", day: "numeric", year: "numeric", timeZone: "America/New_York" });
}

/** A stored adoption date (YYYY-MM-DD) for the admin card: "Nov 15". */
export function adoptedLabel(day: string, lang = "en-US"): string {
  const [y, m, d] = day.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, 12));
  const sameYear = y === new Date().getUTCFullYear();
  return date.toLocaleDateString(lang, { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }), timeZone: "UTC" });
}

// ---- Adopters ---------------------------------------------------------------------------

export function useMyRescue(enabled = true) {
  return useQuery({
    queryKey: rescueKeys.mine,
    enabled,
    staleTime: 30_000,
    queryFn: async (): Promise<MyRescue | null> => {
      const row = asArray<MyRescue>(must(await sb.rpc("flock_rescue_status")))[0];
      return row && row.redemption_id ? row : row ? { ...row, status: null } as MyRescue : null;
    },
  });
}

export async function checkRescueCode(code: string): Promise<{ ok: true; partner: string } | { ok: false; reason: RescueReason }> {
  const row = asArray<{ ok: boolean; partner_name: string | null; reason: RescueReason | null }>(
    must(await sb.rpc("flock_rescue_check", { p_code: cleanRescueCode(code) })),
  )[0];
  if (row?.ok && row.partner_name) return { ok: true, partner: row.partner_name };
  return { ok: false, reason: row?.reason ?? "invalid" };
}

export async function redeemRescueCode(input: { code: string; birdName: string; species: string; adoptedOn: string }):
  Promise<{ ok: true } | { ok: false; reason: RescueReason }> {
  const row = asArray<{ ok: boolean; reason: RescueReason | null }>(must(await sb.rpc("flock_rescue_redeem", {
    p_code: cleanRescueCode(input.code), p_bird_name: input.birdName.trim(), p_species: input.species.trim(), p_adopted_on: input.adoptedOn,
  })))[0];
  return row?.ok ? { ok: true } : { ok: false, reason: row?.reason ?? "invalid" };
}

export async function markRescueSeen(id: string): Promise<void> {
  must(await sb.rpc("flock_rescue_seen", { p_id: id }));
}

// ---- Admins -----------------------------------------------------------------------------

export function useRescuePartners(enabled: boolean) {
  return useQuery({
    queryKey: rescueKeys.partners,
    enabled,
    staleTime: 10_000,
    queryFn: async (): Promise<RescuePartner[]> => asArray<RescuePartner>(must(await sb.rpc("admin_rescue_partners"))),
  });
}

export function useRescueRedemptions(status: RescueStatus, enabled: boolean) {
  return useQuery({
    queryKey: rescueKeys.review(status),
    enabled,
    staleTime: 10_000,
    queryFn: async (): Promise<RescueRedemption[]> => asArray<RescueRedemption>(must(await sb.rpc("admin_rescue_redemptions", { p_status: status }))),
  });
}

export async function saveRescuePartner(d: { id: string | null; name: string; code: string; useLimit: number | null; paused: boolean }): Promise<string> {
  return must(await sb.rpc("admin_rescue_partner_save", {
    p_id: d.id, p_name: d.name.trim(), p_code: cleanRescueCode(d.code), p_use_limit: d.useLimit, p_paused: d.paused,
  }));
}

export async function pauseRescuePartner(id: string, paused: boolean): Promise<void> {
  must(await sb.rpc("admin_rescue_partner_pause", { p_id: id, p_paused: paused }));
}

export async function reviewRescue(id: string, decision: "approve" | "decline"): Promise<void> {
  must(await sb.rpc("admin_rescue_review", { p_id: id, p_decision: decision }));
}

export function useInvalidateRescue() {
  const qc = useQueryClient();
  return () => Promise.all([
    qc.invalidateQueries({ queryKey: ["flock", "rescue"] }),
    qc.invalidateQueries({ queryKey: ["flock", "review"] }),
  ]);
}

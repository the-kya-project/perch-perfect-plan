// Shared pieces for the sitter tab screens (Home, Today, Around the house):
// the one-bird rule, the greeting and sit line, the walkthrough pill, the
// "Around the house" card and the vet-care note.
import { createContext, useContext } from "react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { ChevronRight, Home as HomeIcon, PlayCircle } from "lucide-react";
import { K, KyaIconTile } from "@/components/kya";
import { BirdPhotoCrop } from "@/components/BirdPhotoCrop";
import { replaySitterOnboarding } from "@/components/SitterOnboarding";
import { has, joinUnique } from "@/components/carePlanCards";
import { firstName } from "@/lib/memberDisplay";
import { dateInTimeZone, sitPhase } from "@/lib/sitTimeZone";
import { birdNames } from "@/lib/birdNames";

// ---- One-bird rule ----------------------------------------------------------
// The tab set is decided ONCE per app open (the layout's first context load)
// and held for the rest of that open. A sit with one bird has no Home tab and
// opens on Today; if the owner adds a bird mid-sit, Home appears the next time
// the sitter opens the link, and the app opens on Home from then on.
export type SitterShell = {
  /** Home tab shown (the sit had 2+ birds when the app opened). */
  multi: boolean;
  /** One-bird sits: the bird the app opened on, so a bird added mid-open
   *  (newest first) can't silently take over Today. */
  pinnedBirdId?: string;
};
export const SitterShellContext = createContext<SitterShell>({ multi: false });
export function useSitterShell(): SitterShell {
  return useContext(SitterShellContext);
}

// ---- Names ------------------------------------------------------------------
const PREVIEW_SITTER_NAME = "__preview__";
const OWNER_FALLBACK = "the owner";

/** Sitter's first name, or null (no name, or an owner's bird preview). */
export function sitterFirstName(ctx: any): string | null {
  const raw = (ctx?.sit?.sitter_name ?? "").toString().trim();
  if (!raw || raw === PREVIEW_SITTER_NAME) return null;
  return firstName(raw);
}

/** Owner's first name for mid-sentence use; the localized "the owner" when the
 *  server had no name for them. */
export function ownerFirstName(ctx: any, t: TFunction): string {
  const raw = (ctx?.ownerName ?? "").toString().trim();
  if (!raw || raw === OWNER_FALLBACK) return t("sitter.common.theOwner", "the owner");
  return firstName(raw);
}

export function isBirdPreview(ctx: any): boolean {
  return (ctx?.sit?.sitter_name ?? "") === PREVIEW_SITTER_NAME;
}

// ---- Greeting and sit line --------------------------------------------------
export function greeting(t: TFunction, name: string | null, now = new Date()): string {
  const h = now.getHours();
  if (h < 12) return name ? t("sitter.greeting.morningName", "Good morning, {{name}}", { name }) : t("sitter.greeting.morning", "Good morning");
  if (h < 18) return name ? t("sitter.greeting.afternoonName", "Good afternoon, {{name}}", { name }) : t("sitter.greeting.afternoon", "Good afternoon");
  return name ? t("sitter.greeting.eveningName", "Good evening, {{name}}", { name }) : t("sitter.greeting.evening", "Good evening");
}

function parseISODate(s: string | null | undefined): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s ?? "");
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

/** "Willow" / "Willow and Moxie" / "3 birds" */
export function caringForNames(t: TFunction, names: string[]): string {
  const n = names.filter(Boolean);
  if (n.length === 0) return t("nameList.yourBird", "your bird");
  return birdNames(t, n);
}

/**
 * The line under the greeting:
 *   "Day 2 of 3 caring for Willow · Sam is back Sun, Oct 26"
 *   before the sit: "Your sit starts Fri, Oct 24"
 *   on the last day: "Last day · Sam is back today"
 * An owner's bird preview has no real sit dates, and a sit whose end date has
 * passed has no day to count: "Caring for Willow".
 *
 * "Today" is the date in the sit's time zone (the owner's, saved with the sit)
 * when known, else this device's — so the line matches the day the link ends.
 */
export function sitLine(ctx: any, t: TFunction, lang: string): string {
  const names = (ctx?.birds ?? []).map((b: any) => (b?.name ?? "").toString().trim());
  const who = caringForNames(t, names);
  const caringFor = () => t("sitter.sitLine.caringFor", "Caring for {{names}}", { names: who });
  if (isBirdPreview(ctx)) return caringFor();
  const owner = ownerFirstName(ctx, t);
  const start = parseISODate(ctx?.sit?.start_date);
  const end = parseISODate(ctx?.sit?.end_date);
  const phase = sitPhase(dateInTimeZone(ctx?.sit?.time_zone), ctx?.sit?.start_date, ctx?.sit?.end_date);
  if (!start || !end) return caringFor();
  const loc = lang === "nl" ? "nl-NL" : "en-US";
  const fmt = (d: Date) => d.toLocaleDateString(loc, { weekday: "short", month: "short", day: "numeric" });
  switch (phase.kind) {
    case "before":
      return t("sitter.sitLine.startsOn", "Your sit starts {{date}}", { date: fmt(start) });
    case "lastDay":
      return t("sitter.sitLine.lastDayToday", "Last day · {{owner}} is back today", { owner });
    case "during": {
      const back = phase.daysLeft === 1 ? t("sitter.sitLine.tomorrow", "tomorrow") : fmt(end);
      return t("sitter.sitLine.dayOf", "Day {{n}} of {{total}} caring for {{names}} · {{owner}} is back {{date}}", { n: phase.day, total: phase.total, names: who, owner, date: back });
    }
    default:
      return caringFor();
  }
}

/** Small darker-forest pill under the greeting: replays the walkthrough. */
export function WalkthroughPill() {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={replaySitterOnboarding}
      className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-full px-4 text-[14px] font-[700] text-white active:scale-95"
      style={{ background: K.forestDeep }}
    >
      <PlayCircle className="size-[18px]" style={{ color: K.lime }} aria-hidden="true" />
      {t("sitter.walkthroughPill", "Take the 1-minute walkthrough")}
    </button>
  );
}

// ---- Around the house -------------------------------------------------------
export type AroundItem = { key: string; label: string; value: string };

/** What the sitter can see about the house: carrier and first-aid kit (merged
 *  emergency info), plus cleaning products, off-limits areas and other pets
 *  (the plan, already merged with the owner's "Your home"). */
export function aroundHouseItems(ctx: any, t: TFunction): AroundItem[] {
  const c = ctx?.contacts ?? {};
  const p = ctx?.plan ?? {};
  const out: AroundItem[] = [];
  if (has(c.carrier_location)) out.push({ key: "carrier", label: t("sitter.around.carrier", "Carrier"), value: String(c.carrier_location) });
  if (has(c.first_aid_kit_location)) out.push({ key: "firstAid", label: t("sitter.around.firstAid", "First-aid kit"), value: String(c.first_aid_kit_location) });
  if (has(p.cleaning_instructions)) out.push({ key: "cleaning", label: t("sitter.around.cleaning", "Cleaning products"), value: String(p.cleaning_instructions) });
  if (has(p.off_limits) || has(p.off_limits_rooms)) out.push({ key: "offLimits", label: t("sitter.around.offLimits", "Off-limits areas"), value: joinUnique([p.off_limits, p.off_limits_rooms]) });
  if (has(p.other_pets)) out.push({ key: "otherPets", label: t("sitter.around.otherPets", "Other pets"), value: String(p.other_pets) });
  return out;
}

/** The "Around the house" card. Renders nothing when there's nothing to show. */
export function AroundHouseCard({ ctx, token }: { ctx: any; token: string }) {
  const { t } = useTranslation();
  if (aroundHouseItems(ctx, t).length === 0) return null;
  return (
    <Link
      to="/sitter/$token/around"
      params={{ token }}
      className="flex min-h-[76px] items-center gap-3 rounded-[20px] bg-white px-4 py-3 active:bg-black/[0.03]"
      style={{ color: K.forest }}
    >
      <KyaIconTile size={44}><HomeIcon className="size-5" /></KyaIconTile>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-[700]">{t("sitter.around.title", "Around the house")}</span>
        <span className="mt-0.5 block text-[13px]" style={{ color: K.quiet }}>{t("sitter.around.cardLine", "Carrier, first-aid kit, and house notes")}</span>
      </span>
      <ChevronRight className="size-[18px] shrink-0" style={{ color: K.quiet }} aria-hidden="true" />
    </Link>
  );
}

/** The vet-care note, plain and quiet at the bottom of a screen. */
export function VetNote() {
  const { t } = useTranslation();
  return (
    <p className="m-0 px-1 text-[12.5px] leading-[1.5]" style={{ color: K.quiet }}>
      {t("disclaimer.compactBody", "Not a substitute for veterinary care. Call a vet for any medical concern.")}
    </p>
  );
}

/** Round (or rounded) bird photo, falling back to the initial. */
export function BirdAvatar({ bird, size, radius }: { bird: any; size: number; radius?: number }) {
  const initial = (bird?.name?.slice(0, 1) ?? "?").toUpperCase();
  const r = radius ?? size / 2;
  return bird?.photo_url ? (
    <span className="relative block shrink-0 overflow-hidden" style={{ width: size, height: size, borderRadius: r }}>
      <BirdPhotoCrop url={bird.photo_url} original={bird.photo_url} position={bird.photo_position ?? "50% 20%"} alt="" eager />
    </span>
  ) : (
    <span className="grid shrink-0 place-items-center font-[700] text-white" style={{ width: size, height: size, borderRadius: r, background: K.moss, fontSize: Math.round(size * 0.4) }} aria-hidden="true">
      {initial}
    </span>
  );
}

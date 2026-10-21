import { useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { ClipPlayer } from "@/components/ClipPlayer";
import { ViewOnlyTag } from "@/components/MemberContextBanner";
import { InSetupFrame } from "@/components/setup/SetupFrame";
import { K, SERIF, KyaHeading, KyaIconTile, KyaLink } from "@/components/kya";
import { normalizeFeedTimes, type FeedTime } from "@/lib/feedTimes";
import { clipSlotLabel } from "@/lib/clipSlotLabels";
import {
  waterFreqLabel,
  treatsFreqLabel,
  outOfCageLabel,
  bowlWashLabel,
  formatAmountUnitDisplay,
  formatRemovalMinutesDisplay,
} from "@/lib/labels";
// Only the pure helpers come from carePlanCards. The Kya-look primitives this
// view renders with live below.
import { has, joinUnique, mealPillLabel, RichText } from "@/components/carePlanCards";
import {
  ShieldAlert, Phone, Pencil, AlertTriangle, AlertOctagon,
  Soup, Hand, Home as HomeIcon, Heart, Sun, Video, Siren,
} from "lucide-react";

// THE owner / household read-only care-plan view, in the Kya look: a row of
// section chips (scroll-spy + tap-to-scroll), then one white card per section
// (forest icon tile + Newsreader title) holding labeled rows — a 13.5px bold
// muted label above (or beside) the value. Amber callouts for soft rules, red
// for true danger, deep-link-to-section. Purely presentational: it takes the
// plan DATA + context as props and never fetches. Rendered by the owner /
// member page (/birds/$birdId/care-plan) and the walkthrough's Review step.
// The sitter care sheet (/sitter/$token/care-sheet) renders it too, read-only,
// with the sitter-only props (chipsOnForest, separateNeverFeed, ownerName,
// tipsTitle/tipsLine); owner surfaces never pass those.
//
// The six cards follow the care-plan overview: Food, Health, Behavior, Tips
// (the owner's clips), Day (the routine) and Your home (home & safety, with
// the emergency details nested inside it).
//
// Section anchors carry BOTH a stable `id` (food/behavior/home/health/routine/
// emergency/tips, for deep-linking and the Review step's tap-to-fix) and the
// sitter-onboarding `data-coach` keys (cp-food / cp-handling / cp-home /
// cp-health / cp-emergency).

export const CARE_PLAN_SECTIONS = ["food", "behavior", "home", "health", "routine", "emergency", "tips"] as const;
export type CareSection = (typeof CARE_PLAN_SECTIONS)[number];

export type CarePlanData = {
  bird: any;
  plan: any;
  tasks?: any[];
  contacts?: Record<string, string | null>;
  watchClips?: { key: string; label: string; url: string }[];
  baselineClipUrl?: string | null;
};

const TIME_LABEL: Record<string, string> = {
  morning: "Morning", midday: "Midday", afternoon: "Afternoon", evening: "Evening", night: "Night", anytime: "Anytime",
};
const TIME_ORDER = ["morning", "midday", "afternoon", "evening", "night", "anytime"];

const CONTACT_ROWS: { key: string; label: string }[] = [
  { key: "owner_phone", label: "Owner" },
  { key: "backup_name", label: "Backup contact" },
  { key: "backup_phone", label: "Backup phone" },
  { key: "avian_vet_name", label: "Avian vet" },
  { key: "avian_vet_phone", label: "Avian vet phone" },
  { key: "avian_vet_address", label: "Avian vet address" },
  { key: "emergency_vet_name", label: "Emergency vet" },
  { key: "emergency_vet_phone", label: "Emergency vet phone" },
  { key: "emergency_vet_address", label: "Emergency vet address" },
  { key: "poison_control", label: "Poison control" },
  { key: "carrier_location", label: "Carrier location" },
  { key: "first_aid_kit_location", label: "First-aid kit" },
];

// The six cards, in the overview's order. "home" is the Your home card, which
// also holds the emergency details.
type CardKey = "food" | "health" | "behavior" | "tips" | "routine" | "home";
const NAV: { id: CardKey; label: string }[] = [
  { id: "food", label: "Food" },
  { id: "health", label: "Health" },
  { id: "behavior", label: "Behavior" },
  { id: "tips", label: "Tips" },
  { id: "routine", label: "Day" },
  { id: "home", label: "Your home" },
];

// data-coach anchors the sitter onboarding points at (CP_TARGET in
// SitterOnboarding). Routine and Tips have no coach step.
const COACH: Partial<Record<CareSection, string>> = {
  food: "cp-food", behavior: "cp-handling", home: "cp-home", health: "cp-health", emergency: "cp-emergency",
};

// Display labels for the constant lists above (time of day, contacts, nav). The
// constants stay English; this only changes what's shown.
function displayLabel(t: TFunction, en: string): string {
  switch (en) {
    case "Morning": return t("carePlan.label.morning", "Morning");
    case "Midday": return t("carePlan.label.midday", "Midday");
    case "Afternoon": return t("carePlan.label.afternoon", "Afternoon");
    case "Evening": return t("carePlan.label.evening", "Evening");
    case "Night": return t("carePlan.label.night", "Night");
    case "Anytime": return t("carePlan.label.anytime", "Anytime");
    case "Owner": return t("carePlan.label.owner", "Owner");
    case "Backup contact": return t("carePlan.label.backupContact", "Backup contact");
    case "Backup phone": return t("carePlan.label.backupPhone", "Backup phone");
    case "Avian vet": return t("carePlan.label.avianVet", "Avian vet");
    case "Avian vet phone": return t("carePlan.label.avianVetPhone", "Avian vet phone");
    case "Avian vet address": return t("carePlan.label.avianVetAddress", "Avian vet address");
    case "Emergency vet": return t("carePlan.label.emergencyVet", "Emergency vet");
    case "Emergency vet phone": return t("carePlan.label.emergencyVetPhone", "Emergency vet phone");
    case "Emergency vet address": return t("carePlan.label.emergencyVetAddress", "Emergency vet address");
    case "Poison control": return t("carePlan.label.poisonControl", "Poison control");
    case "Carrier location": return t("carePlan.label.carrierLocation", "Carrier location");
    case "First-aid kit": return t("carePlan.label.firstAidKit", "First-aid kit");
    case "Food": return t("carePlan.label.food", "Food");
    case "Behavior": return t("carePlan.label.behavior", "Behavior");
    case "Health": return t("carePlan.label.health", "Health");
    case "Tips": return t("carePlan.label.tips", "Tips");
    case "Day": return t("carePlan.label.day", "Day");
    case "Your home": return t("carePlan.label.yourHome", "Your home");
    default: return en;
  }
}

// ---- Kya-look primitives ----------------------------------------------------

const LABEL = "m-0 text-[13.5px] font-[700]";

/** One section card: forest icon tile + Newsreader title (+ a quiet line),
 *  then its rows. White, 20px corners. */
function Card({ id, coach, setRef, icon, title, line, children }: {
  id?: string;
  coach?: string;
  setRef?: (el: HTMLElement | null) => void;
  icon: ReactNode;
  title: string;
  line?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} data-coach={coach} ref={setRef} className="scroll-mt-2 rounded-[20px] bg-white px-4 pb-2 pt-4" style={{ color: K.forest }}>
      <div className="flex items-center gap-3">
        <KyaIconTile size={40}>{icon}</KyaIconTile>
        <div className="min-w-0">
          <KyaHeading size={21}>{title}</KyaHeading>
          {line && <p className="m-0 mt-0.5 text-[13.5px] leading-[1.35]" style={{ color: K.quiet }}>{line}</p>}
        </div>
      </div>
      <div className="mt-2 flex flex-col [&>.cp-row+.cp-row]:border-t [&>.cp-row+.cp-row]:border-[#e3ebe2]">{children}</div>
    </section>
  );
}

/** A labeled row: muted label above the value. Empty values render nothing. */
function Row({ label, children }: { label: string; children: ReactNode }) {
  if (!has(children as any)) return null;
  return (
    <div className="cp-row py-3">
      <p className={LABEL} style={{ color: K.quiet }}>{label}</p>
      <div className="mt-1 whitespace-pre-line text-[15px] leading-[1.45]" style={{ color: K.ink }}>{children}</div>
    </div>
  );
}

/** Short label:value pairs side by side (frequencies, contacts). */
function PairRows({ rows }: { rows: { label: string; value: ReactNode }[] }) {
  const shown = rows.filter((r) => has(r.value as any));
  if (!shown.length) return null;
  return (
    <div className="flex flex-col">
      {shown.map((r, i) => (
        <div key={r.label} className={`flex items-baseline justify-between gap-4 py-1.5 ${i > 0 ? "border-t" : ""}`} style={{ borderColor: K.line }}>
          <span className="shrink-0 text-[13.5px] font-[700]" style={{ color: K.quiet }}>{r.label}</span>
          <span className="min-w-0 whitespace-pre-line text-right text-[15px] font-[600]" style={{ color: K.forest }}>{r.value}</span>
        </div>
      ))}
    </div>
  );
}

/** Lime chips (diet types, fresh foods, feeding times). */
function Chips({ items }: { items: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((s) => <span key={s} className="rounded-full px-2.5 py-1 text-[13px] font-[600]" style={{ background: K.lime, color: K.forest }}>{s}</span>)}
    </div>
  );
}

function DangerChips({ items }: { items: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((s) => <span key={s} className="rounded-full px-2.5 py-1 text-[13px] font-[600] text-white" style={{ background: K.red }}>{s}</span>)}
    </div>
  );
}

/** Amber callout: soft rules and warnings. */
function Callout({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <div className="cp-callout my-2 flex items-start gap-2.5 rounded-[14px] p-3" style={{ background: K.amberBg, color: K.amberText }}>
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        {label && <p className={LABEL}>{label}</p>}
        <div className={`whitespace-pre-line text-[14.5px] leading-[1.45] ${label ? "mt-1" : ""}`}>{children}</div>
      </div>
    </div>
  );
}

/** Red callout: true danger (toxic foods, hazards, bite risk). */
function DangerCallout({ title, icon, children }: { title: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <div className="cp-callout my-2 rounded-[14px] border-[1.5px] p-3" style={{ background: "#fbeeee", borderColor: "#ecc9c9", color: K.red }}>
      <p className={`${LABEL} flex items-center gap-1.5`}>{icon ?? <AlertOctagon className="size-4" aria-hidden="true" />}{title}</p>
      <div className="mt-2">{children}</div>
    </div>
  );
}

/** One food: name left, amount right, feeding times as lime pills. */
function FeedingItem({ typeLabel, name, amountStr, times, freeFed, note }: {
  typeLabel: string; name: string; amountStr: string; times: FeedTime[]; freeFed: boolean; note: string;
}) {
  const { t } = useTranslation();
  return (
    <div className="rounded-[14px] p-3" style={{ background: K.mist }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="m-0 text-[15px] font-[700]" style={{ color: K.forest }}>{name || typeLabel}</p>
          {name && <p className="m-0 mt-0.5 text-[13px]" style={{ color: K.quiet }}>{typeLabel}</p>}
        </div>
        {amountStr && <p className="m-0 shrink-0 text-[17px] font-[700] leading-tight" style={{ color: K.moss }}>{amountStr}</p>}
      </div>
      {(times.length > 0 || freeFed) && (
        <div className="mt-2">
          <Chips items={[...times.map(mealPillLabel), ...(freeFed ? [t("careCards.freeFed", "Free-fed")] : [])]} />
        </div>
      )}
      {note && <p className="m-0 mt-2 whitespace-pre-line text-[14px]" style={{ color: K.ink }}>{note}</p>}
    </div>
  );
}

/** Step-up answer as a tag + the owner's exact qualifier verbatim. */
function StepUpRow({ stepUp, notes }: { stepUp?: string | null; notes?: string | null }) {
  const { t } = useTranslation();
  const raw = (stepUp ?? "").trim().toLowerCase();
  const qualifier = (notes ?? "").trim();
  const base = raw === "yes" ? t("careCards.stepUpYes", "Yes") : raw === "no" ? t("careCards.stepUpNo", "No") : raw === "sometimes" ? t("careCards.stepUpSometimes", "Sometimes") : null;
  if (!base && !qualifier) return null;
  const label = base ? (qualifier ? t("careCards.stepUpWithCaveats", "{{base}}, with caveats", { base }) : base) : null;
  const cautionary = !base || raw === "no" || !!qualifier;
  return (
    <div className="cp-row py-3">
      <p className={LABEL} style={{ color: K.quiet }}>{t("careCards.stepUp", "Step up")}</p>
      {label && (
        <span className="mt-1.5 inline-flex items-center rounded-full px-2.5 py-1 text-[13px] font-[700]" style={cautionary ? { background: K.amberBg, color: K.amberText } : { background: K.lime, color: K.forest }}>{label}</span>
      )}
      {qualifier && <p className="m-0 mt-1.5 whitespace-pre-line text-[15px] leading-[1.45]" style={{ color: K.ink }}>{qualifier}</p>}
    </div>
  );
}

/** A clip with its caption under it. */
function ClipTile({ src, label, audience, ownerName }: { src: string; label: string; audience?: "owner" | "sitter"; ownerName?: string }) {
  return (
    <div className="overflow-hidden rounded-[14px]" style={{ background: K.mist }}>
      <ClipPlayer src={src} label={label} className="aspect-video" audience={audience} ownerName={ownerName} />
      <p className="m-0 px-3 py-2 text-[14px] font-[700] leading-tight" style={{ color: K.forest }}>{label}</p>
    </div>
  );
}

export function CarePlanView({
  data,
  visibleSections = CARE_PLAN_SECTIONS,
  showEmergencyContacts = true,
  canEdit = false,
  onEdit,
  targetSection,
  stickyTopPx = 0,
  header,
  footer,
  contextBanner,
  showViewOnlyTag = false,
  chipsOnForest = false,
  separateNeverFeed = false,
  ownerName,
  audience = "owner",
  tipsTitle,
  tipsLine,
}: {
  data: CarePlanData;
  /** Which sections this surface may show (in addition to data-presence gating). */
  visibleSections?: readonly CareSection[];
  /** Include the emergency contacts list in the Emergency details (Review step: false). */
  showEmergencyContacts?: boolean;
  /** Show an edit entry (UX only; RLS enforces). */
  canEdit?: boolean;
  onEdit?: () => void;
  /** Deep-link target — scrolls this section into view on mount. */
  targetSection?: CareSection;
  /** Where the sticky chip row pins, when another sticky bar sits above it. */
  stickyTopPx?: number;
  /** Optional header content rendered inside the sticky block, above the chips. */
  header?: ReactNode;
  /** Optional content rendered after the section cards. */
  footer?: ReactNode;
  /** Optional context banner (member "you help here") rendered atop the content. */
  contextBanner?: ReactNode;
  /** When the viewer lacks edit access, show a quiet "View only" tag where the
   *  Edit entry would be (member surfaces only). */
  showViewOnlyTag?: boolean;
  /** Sitter care sheet: the chip row sits on a forest band that continues the
   *  page header, with the mist body's rounded top under it. Place the view
   *  straight under the header (it pulls itself up into the header's
   *  bottom padding). Owner surfaces leave this off. */
  chipsOnForest?: boolean;
  /** Sitter care sheet: the never-feed list gets its own amber card
   *  ("Never feed [bird]") instead of the red callout inside Food. */
  separateNeverFeed?: boolean;
  /** Sitter care sheet: the owner's first name, used in "Don't introduce new
   *  foods while [owner] is away." Leave unset for the owner's own wording. */
  ownerName?: string;
  /** Who is reading. The sitter's care sheet says "[Owner]'s home" instead of
   *  "Your home" and tells the sitter to ask the owner when a clip won't load. */
  audience?: "owner" | "sitter";
  /** Sitter care sheet: title / line for the Tips card. */
  tipsTitle?: string;
  tipsLine?: string;
}) {
  const { t } = useTranslation();
  // Inside the walkthrough the view sits on SetupFrame's white body, so the
  // white cards go in a mist container (like the Review checklist's cards).
  const inFrame = useContext(InSetupFrame);
  const bird = (data.bird ?? {}) as any;
  const plan = (data.plan ?? {}) as any;
  const name = (bird.name ?? "this bird") as string;
  const tasks = (data.tasks ?? []) as any[];
  const contacts = (data.contacts ?? {}) as Record<string, string | null>;
  const watchClips = (data.watchClips ?? []) as { key: string; label: string; url: string }[];
  const baselineClipUrl = data.baselineClipUrl ?? null;
  const canShow = (id: CareSection) => visibleSections.includes(id);

  // ---- derived content ------------------------------------------------------
  const diet = (plan.diet_types ?? []) as string[];
  const dietDetails = (plan.diet_details ?? {}) as Record<string, any[]>;
  const freshFoods = (plan.fresh_foods ?? []) as string[];
  const neverFeed = (plan.never_feed ?? []) as string[];
  const hazards = (plan.hazards ?? []) as string[];
  const feedingTimes = (plan.feeding_times ?? []) as string[];

  const foodRows = Object.entries(dietDetails).flatMap(([type, items]) =>
    (Array.isArray(items) ? items : []).map((it: any) => ({
      type,
      name: (it?.name ?? "").toString().trim(),
      amount: it?.amount,
      unit: it?.unit,
      times: normalizeFeedTimes(it?.times),
      freeFed: !!it?.freeFed,
      note: (it?.note ?? "").toString().trim(),
    })),
  ).filter((f) => f.name || has(f.amount) || f.times.length || f.note);
  const hasPerFoodDetails = foodRows.length > 0;
  const hasStructuredFood =
    diet.length > 0 || has(plan.diet_other) || hasPerFoodDetails || has(plan.food_brand) ||
    has(plan.amount_value) || feedingTimes.length > 0 || freshFoods.length > 0 ||
    has(plan.fresh_foods_other) || has(plan.treats_notes) || has(plan.water_frequency) ||
    has(plan.water_notes) || has(plan.food_storage);

  const showFeeding = !!(diet.length || plan.food_brand || plan.amount_value || feedingTimes.length || freshFoods.length || plan.fresh_foods_other || plan.treats_notes || plan.treats_frequency || plan.water_frequency || plan.water_notes || plan.food_storage || plan.food_hygiene_notes || plan.food_instructions || plan.water_instructions || plan.fresh_food_removal_minutes);
  const showHandling = has(plan.step_up) || has(plan.step_up_notes) || has(plan.handlers) || has(plan.likes) || has(plan.fears_triggers) || has(plan.bite_risk) || has(plan.handling_rules) || has(plan.known_triggers);
  const showHome = has(plan.cage_location) || has(plan.out_of_cage_mode) || has(plan.out_of_cage_notes) || has(plan.out_of_cage_rules) || hazards.length > 0 || has(plan.hazards_other) || has(plan.off_limits) || has(plan.off_limits_rooms) || has(plan.safety_rules) || has(plan.other_pets) || has(plan.cleaning_instructions);
  const showHealth = has(bird.normal_weight) || has(bird.normal_weight_min) || has(bird.normal_weight_max) || has(plan.whats_normal) || has(plan.normal_appetite) || has(plan.normal_droppings) || has(plan.normal_noise) || has(plan.normal_activity) || has(plan.normal_sleep) || has(plan.normal_behavior_with_strangers) || has(bird.medical_conditions) || has(bird.medications) || has(plan.medication_schedule) || !!baselineClipUrl;

  const handlingDangerous = /\b(no|do not|don'?t|never|owner.?only)\b/i.test(`${plan.step_up ?? ""} ${plan.step_up_notes ?? ""} ${plan.handlers ?? ""}`);

  const weightStr = (() => {
    if (has(bird.normal_weight_min) && has(bird.normal_weight_max)) return `${bird.normal_weight_min}–${bird.normal_weight_max} g`;
    if (has(bird.normal_weight)) return `${bird.normal_weight} g`;
    return null;
  })();

  const groups = TIME_ORDER
    .map((time) => ({ time, items: tasks.filter((x) => (x.time_of_day || "anytime") === time) }))
    .filter((g) => g.items.length > 0);
  const ungrouped = tasks.filter((x) => !TIME_ORDER.includes(x.time_of_day || "anytime"));
  if (ungrouped.length) groups.push({ time: "anytime", items: ungrouped });

  // Contacts only when the surface includes them (the Review step omits them).
  const contactRows = showEmergencyContacts ? CONTACT_ROWS.filter((r) => (contacts[r.key] ?? "").toString().trim()) : [];
  const hasWhenToCall = has(plan.when_to_call_owner) || has(plan.when_to_call_vet);

  // present = has content AND the surface allows the section.
  const present: Record<CareSection, boolean> = {
    food: canShow("food") && (showFeeding || (!separateNeverFeed && neverFeed.length > 0)),
    behavior: canShow("behavior") && showHandling,
    home: canShow("home") && showHome,
    health: canShow("health") && showHealth,
    routine: canShow("routine") && groups.length > 0,
    emergency: canShow("emergency") && (contactRows.length > 0 || hasWhenToCall),
    tips: canShow("tips") && watchClips.length > 0,
  };
  // The Your home card shows for either of its parts.
  const cardPresent: Record<CardKey, boolean> = {
    food: present.food, health: present.health, behavior: present.behavior, tips: present.tips, routine: present.routine,
    home: present.home || present.emergency,
  };
  const presentNav = NAV.filter((n) => cardPresent[n.id]);
  const presentKey = presentNav.map((n) => n.id).join(",");

  // ---- sticky-chip offset, scroll-spy, tap-to-scroll, deep-link ------------
  const topRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const [active, setActive] = useState<CardKey | null>(null);
  const deepLinked = useRef(false);

  // The chip row pins below the safe area, so read its resolved `top`.
  const offsetOf = () => {
    const el = topRef.current;
    if (!el) return stickyTopPx + 8;
    return (parseFloat(getComputedStyle(el).top) || stickyTopPx) + el.offsetHeight + 8;
  };

  const scrollToSection = (id: string, behavior: ScrollBehavior = "smooth") => {
    const el = sectionRefs.current[id];
    if (!el) return;
    const y = el.getBoundingClientRect().top + window.scrollY - offsetOf();
    window.scrollTo({ top: y, behavior });
  };

  useEffect(() => {
    if (!presentKey) return;
    const ids = presentKey.split(",") as CardKey[];
    const onScroll = () => {
      const off = offsetOf() + 4;
      let current: CardKey = ids[0];
      for (const id of ids) {
        const el = sectionRefs.current[id];
        if (el && el.getBoundingClientRect().top - off <= 1) current = id;
      }
      setActive(current);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presentKey, stickyTopPx]);

  // Deep-link: jump to the target section once, on mount (data is already here).
  useEffect(() => {
    if (deepLinked.current) return;
    deepLinked.current = true;
    if (!targetSection || !present[targetSection]) return;
    requestAnimationFrame(() => scrollToSection(targetSection, "auto"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setRef = (id: string) => (el: HTMLElement | null) => { sectionRefs.current[id] = el; };
  const stickyHasContent = !!header || presentNav.length > 1 || chipsOnForest;
  const neverFeedCard = separateNeverFeed && canShow("food") && neverFeed.length > 0;
  const tileIcon = "size-5";
  const sitter = audience === "sitter";
  // "Your home" is the owner's own wording; a sitter reads it as the owner's.
  const homeTitle = !sitter
    ? t("carePlan.yourHome", "Your home")
    : ownerName
    ? t("carePlan.ownerHome", "{{owner}}'s home", { owner: ownerName })
    : t("carePlan.theOwnersHome", "The owner's home");
  const navLabel = (n: { id: CardKey; label: string }) => (n.id === "home" ? homeTitle : displayLabel(t, n.label));

  return (
    <div className={`flex flex-col gap-4 ${inFrame ? "rounded-[20px] p-2.5" : ""} ${chipsOnForest ? "-mt-[46px]" : ""}`} style={inFrame ? { background: K.mist } : undefined}>
      {stickyHasContent && chipsOnForest ? (
        // Forest band continuing the page header: chips, then the mist body's
        // rounded top. Full-bleed like KyaHeader.
        <div
          ref={topRef}
          style={{ top: `calc(env(safe-area-inset-top) + ${stickyTopPx}px)`, background: K.forest }}
          className="sticky z-20 -mb-2.5 mx-[calc(50%-50vw)]"
        >
          <div className="mx-auto max-w-md">
            {header && <div className="px-4 pb-2">{header}</div>}
            {presentNav.length > 1 && (
              <div className="flex gap-2 overflow-x-auto px-4 pb-3 pt-4 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {presentNav.map((n) => {
                  const on = active === n.id;
                  return (
                    <button
                      key={n.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => scrollToSection(n.id)}
                      className="inline-flex min-h-[44px] shrink-0 items-center rounded-full px-4 text-[14.5px] font-[700] transition-colors"
                      style={on ? { background: K.lime, color: K.forest } : { background: K.forestDeep, color: "#fff" }}
                    >
                      {navLabel(n)}
                    </button>
                  );
                })}
              </div>
            )}
            <div className="h-[26px] rounded-t-[26px]" style={{ background: K.mist }} aria-hidden="true" />
          </div>
        </div>
      ) : stickyHasContent && (
        <div
          ref={topRef}
          style={{ top: `calc(env(safe-area-inset-top) + ${stickyTopPx}px)`, background: K.mist }}
          className={`sticky z-20 ${inFrame ? "-mx-2.5 px-2.5" : "-mx-4 px-4"} py-2`}
        >
          {header && <div className="pb-2">{header}</div>}
          {presentNav.length > 1 && (
            <div className="flex gap-2 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {presentNav.map((n) => {
                const on = active === n.id;
                return (
                  <button
                    key={n.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => scrollToSection(n.id)}
                    className="inline-flex min-h-[44px] shrink-0 items-center rounded-full border-[1.5px] px-4 text-[14.5px] font-[700] transition-colors"
                    style={on ? { background: K.forest, borderColor: K.forest, color: "#fff" } : { background: "#fff", borderColor: "#d5dfd5", color: K.forest }}
                  >
                    {navLabel(n)}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {contextBanner}
      {canEdit && onEdit ? (
        <div className="-my-2 flex justify-end">
          <KyaLink onClick={onEdit}><Pencil className="size-4" aria-hidden="true" />{t("carePlan.editCarePlan", "Edit care plan")}</KyaLink>
        </div>
      ) : showViewOnlyTag ? (
        <div className="-mb-1 flex justify-end">
          <ViewOnlyTag />
        </div>
      ) : null}

      {/* ------------------------------------------- NEVER FEED (sitter) */}
      {neverFeedCard && (
        <section className="rounded-[20px] p-4" style={{ background: K.amberBg, color: K.amberText }}>
          <div className="flex items-center gap-2">
            <AlertOctagon className="size-5 shrink-0" aria-hidden="true" />
            <KyaHeading size={21}>{t("carePlan.neverFeedNamed", "Never feed {{name}}", { name })}</KyaHeading>
          </div>
          <ul className="m-0 mt-3 flex list-none flex-wrap gap-1.5 p-0">
            {neverFeed.map((s) => (
              <li key={s} className="rounded-full bg-white px-3 py-1.5 text-[14px] font-[700]" style={{ color: K.amberText }}>{s}</li>
            ))}
          </ul>
          <p className="m-0 mt-3 text-[14px] font-[600]">{t("carePlan.keepTheseCompletelyOutOf", "Keep these completely out of reach.")}</p>
        </section>
      )}

      {/* ------------------------------------------------------------ FOOD */}
      {present.food && (
        <Card id="food" coach={COACH.food} setRef={setRef("food")} icon={<Soup className={tileIcon} />} title={t("carePlan.food", "Food")} line={t("carePlan.whatEats", "What {{name}} eats", { name })}>
          {!separateNeverFeed && neverFeed.length > 0 && (
            <DangerCallout title={t("carePlan.neverFeedToxicToThis", "Never feed · toxic to this bird")}>
              <DangerChips items={neverFeed} />
              <p className="m-0 mt-2 text-[13.5px] font-[600]">{t("carePlan.keepTheseCompletelyOutOf", "Keep these completely out of reach.")}</p>
            </DangerCallout>
          )}
          {showFeeding && (
            <Callout>
              {ownerName
                ? t("carePlan.noNewFoodsNamed", "Don't introduce new foods while {{owner}} is away.", { owner: ownerName })
                : t("carePlan.donTIntroduceNewFoods", "Don't introduce new foods while the owner is away.")}
            </Callout>
          )}
          {!hasStructuredFood && has(plan.food_instructions) && <Row label={t("carePlan.dietOverview", "Diet overview")}><RichText text={plan.food_instructions} /></Row>}
          {diet.length > 0 && <Row label={t("carePlan.dietTypes", "Diet types")}><Chips items={diet} /></Row>}
          {has(plan.diet_other) && <Row label={t("carePlan.otherDiet", "Other diet")}>{plan.diet_other}</Row>}
          {hasPerFoodDetails ? (
            <div className="cp-row flex flex-col gap-2 py-3">
              {foodRows.map((f, i) => (
                <FeedingItem
                  key={`${f.type}-${i}`}
                  typeLabel={f.type.charAt(0).toUpperCase() + f.type.slice(1).replace(/_/g, " ")}
                  name={f.name}
                  amountStr={has(f.amount) ? (f.unit ? formatAmountUnitDisplay(f.amount, f.unit, t) : String(f.amount)) : ""}
                  times={f.times}
                  freeFed={f.freeFed}
                  note={f.note}
                />
              ))}
            </div>
          ) : (
            (has(plan.food_brand) || has(plan.amount_value)) && (
              <Row label={t("carePlan.brandAmount", "Brand & amount")}>{`${plan.food_brand ?? ""}${has(plan.amount_value) ? ` · ${formatAmountUnitDisplay(plan.amount_value, plan.amount_unit, t)}` : ""}`.trim()}</Row>
            )
          )}
          {!foodRows.some((f) => f.times.length > 0) && feedingTimes.length > 0 && (
            <Row label={t("carePlan.feedingTimes", "Feeding times")}><Chips items={feedingTimes} /></Row>
          )}
          {freshFoods.length > 0 && <Row label={t("carePlan.freshFoods", "Fresh foods")}><Chips items={freshFoods} /></Row>}
          {has(plan.fresh_foods_other) && <Row label={t("carePlan.otherFreshFoods", "Other fresh foods")}>{plan.fresh_foods_other}</Row>}
          {(has(plan.treats_notes) || has(plan.treats_frequency)) && (
            <Row label={t("carePlan.treats", "Treats")}>
              {has(plan.treats_frequency) && (
                <PairRows rows={[{ label: t("carePlan.frequency", "Frequency"), value: treatsFreqLabel(plan.treats_frequency, t) }]} />
              )}
              {has(plan.treats_notes) && (
                <p className={`m-0 whitespace-pre-line ${has(plan.treats_frequency) ? "mt-1" : ""}`}>{plan.treats_notes}</p>
              )}
            </Row>
          )}
          {(has(plan.water_frequency) || has(plan.water_notes) || has(plan.water_instructions)) && (
            <Row label={t("carePlan.water", "Water")}>
              {has(plan.water_frequency) && (
                <PairRows rows={[{ label: t("carePlan.changeWater", "Change water"), value: waterFreqLabel(plan.water_frequency, t) }]} />
              )}
              {(has(plan.water_notes) || (!has(plan.water_frequency) && has(plan.water_instructions))) && (
                <p className={`m-0 whitespace-pre-line ${has(plan.water_frequency) ? "mt-1" : ""}`}>
                  {has(plan.water_notes) ? plan.water_notes : plan.water_instructions}
                </p>
              )}
            </Row>
          )}
          <Row label={t("carePlan.freshnessHygiene", "Freshness & hygiene")}>
            <PairRows
              rows={[
                { label: t("carePlan.removeFreshFood", "Remove fresh food"), value: t("carePlan.withinDuration", "Within {{duration}}", { duration: formatRemovalMinutesDisplay(plan.fresh_food_removal_minutes, t) }) },
                { label: t("carePlan.washFoodBowls", "Wash food bowls"), value: bowlWashLabel(plan.food_bowl_wash_cadence, t) },
                { label: t("carePlan.washWaterBowl", "Wash water bowl"), value: bowlWashLabel(plan.water_bowl_wash_cadence, t) },
              ]}
            />
            {has(plan.food_hygiene_notes) && <p className="m-0 mt-1 whitespace-pre-line text-[14px]" style={{ color: K.quiet }}>{plan.food_hygiene_notes}</p>}
          </Row>
          {has(plan.food_storage) && <Row label={t("carePlan.foodStorage", "Food storage")}>{plan.food_storage}</Row>}
        </Card>
      )}

      {/* ---------------------------------------------------------- HEALTH */}
      {present.health && (
        <Card id="health" coach={COACH.health} setRef={setRef("health")} icon={<Heart className={tileIcon} />} title={t("carePlan.health", "Health")} line={t("carePlan.whatsNormal", "What's normal for {{name}}", { name })}>
          {weightStr && (
            <div className="cp-row py-3">
              <p className={LABEL} style={{ color: K.quiet }}>{t("carePlan.normalWeight", "Normal weight")}</p>
              <p className="m-0 mt-1 text-[26px] font-[700] leading-none" style={{ color: K.forest, fontFamily: SERIF }}>{weightStr}</p>
            </div>
          )}
          {has(plan.whats_normal) && <Row label={t("carePlan.whatSNormalOverall", "What's normal (overall)")}>{plan.whats_normal}</Row>}
          {has(plan.normal_appetite) && <Row label={t("carePlan.normalAppetite", "Normal appetite")}>{plan.normal_appetite}</Row>}
          {has(plan.normal_droppings) && <Row label={t("carePlan.normalDroppings", "Normal droppings")}>{plan.normal_droppings}</Row>}
          {has(plan.normal_noise) && <Row label={t("carePlan.normalNoise", "Normal noise")}>{plan.normal_noise}</Row>}
          {has(plan.normal_activity) && <Row label={t("carePlan.normalActivity", "Normal activity")}>{plan.normal_activity}</Row>}
          {has(plan.normal_sleep) && <Row label={t("carePlan.normalSleep", "Normal sleep")}>{plan.normal_sleep}</Row>}
          {has(plan.normal_behavior_with_strangers) && <Row label={t("carePlan.withStrangers", "With strangers")}>{plan.normal_behavior_with_strangers}</Row>}
          {has(bird.medical_conditions) && <Row label={t("carePlan.medicalConditions", "Medical conditions")}>{bird.medical_conditions}</Row>}
          {(has(bird.medications) || has(plan.medication_schedule)) && (
            <Row label={t("carePlan.medications", "Medications")}>{joinUnique([bird.medications, plan.medication_schedule])}</Row>
          )}
          {baselineClipUrl && (
            <div className="cp-row py-3">
              <ClipTile src={baselineClipUrl} label={t("carePlan.normalBehaviorClip", "Normal-behavior clip")} audience={audience} ownerName={ownerName} />
            </div>
          )}
        </Card>
      )}

      {/* -------------------------------------------------------- BEHAVIOR */}
      {present.behavior && (
        <Card id="behavior" coach={COACH.behavior} setRef={setRef("behavior")} icon={<Hand className={tileIcon} />} title={t("carePlan.behavior", "Behavior")} line={t("carePlan.handling", "Handling {{name}}", { name })}>
          {(handlingDangerous || has(plan.bite_risk)) && (
            <Callout>{t("carePlan.thisBirdHasHandlingRestrictions", "This bird has handling restrictions — read this section before any contact.")}</Callout>
          )}
          <StepUpRow stepUp={plan.step_up} notes={plan.step_up_notes} />
          {has(plan.handlers) && <Row label={t("carePlan.whoCanHandle", "Who can handle")}>{plan.handlers}</Row>}
          {!has(plan.step_up) && !has(plan.step_up_notes) && !has(plan.handlers) && has(plan.handling_rules) && (
            <Row label={t("carePlan.handlingRules", "Handling rules")}>{plan.handling_rules}</Row>
          )}
          {has(plan.likes) && <Row label={t("carePlan.likes", "Likes")}>{plan.likes}</Row>}
          {(has(plan.fears_triggers) || has(plan.known_triggers)) && (
            <Callout label={t("carePlan.fearsTriggers", "Fears & triggers")}>{joinUnique([plan.fears_triggers, plan.known_triggers])}</Callout>
          )}
          {has(plan.bite_risk) && (
            <DangerCallout title={t("carePlan.biteWarningSigns", "Bite warning signs")} icon={<ShieldAlert className="size-4" aria-hidden="true" />}>
              <p className="m-0 whitespace-pre-line text-[14.5px]">{plan.bite_risk}</p>
            </DangerCallout>
          )}
        </Card>
      )}

      {/* ------------------------------------------------------------ TIPS */}
      {present.tips && (
        <Card id="tips" setRef={setRef("tips")} icon={<Video className={tileIcon} />} title={tipsTitle ?? t("carePlan.tips", "Tips")} line={tipsLine ?? t("carePlan.tipsLine", "Short clips that show how it's done")}>
          <div className="cp-row flex flex-col gap-3 py-3">
            {watchClips.map((c) => (
              <ClipTile key={c.key} src={c.url} label={clipSlotLabel(c.key, c.label, t)} audience={audience} ownerName={ownerName} />
            ))}
          </div>
        </Card>
      )}

      {/* ---------------------------------------------------------- DAY */}
      {present.routine && (
        <Card id="routine" setRef={setRef("routine")} icon={<Sun className={tileIcon} />} title={t("carePlan.day", "Day")} line={t("carePlan.dailyRhythm", "Daily rhythm")}>
          {groups.map((g) => (
            <div key={g.time} className="cp-row py-3">
              <p className={LABEL} style={{ color: K.quiet }}>{displayLabel(t, TIME_LABEL[g.time] ?? g.time)}</p>
              <ul className="m-0 mt-1.5 flex list-none flex-col gap-2 p-0">
                {g.items.map((it) => (
                  <li key={it.id} className="text-[15px] font-[600]" style={{ color: K.forest }}>
                    {it.title}
                    {it.instructions && <span className="mt-0.5 block whitespace-pre-line text-[14px] font-[400]" style={{ color: K.ink }}>{it.instructions}</span>}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </Card>
      )}

      {/* -------------------------------------------- YOUR HOME (+ EMERGENCY) */}
      {cardPresent.home && (
        <Card
          id={present.home ? "home" : undefined}
          coach={present.home ? COACH.home : undefined}
          setRef={setRef("home")}
          icon={<HomeIcon className={tileIcon} />}
          title={homeTitle}
          line={present.home ? t("carePlan.homeSafetyTitle", "{{name}}'s home & safety", { name }) : undefined}
        >
          {present.home && (
            <>
              {hazards.length > 0 && (
                <DangerCallout title={t("carePlan.householdHazardsKeepAway", "Household hazards · keep away")}>
                  <DangerChips items={hazards} />
                  {has(plan.hazards_other) && <p className="m-0 mt-2 whitespace-pre-line text-[14.5px]">{plan.hazards_other}</p>}
                </DangerCallout>
              )}
              {has(plan.cage_location) && <Row label={t("carePlan.cageLocation", "Cage location")}>{plan.cage_location}</Row>}
              {(has(plan.out_of_cage_mode) || has(plan.out_of_cage_notes) || has(plan.out_of_cage_rules)) && (
                <Row label={t("carePlan.outOfCageRules", "Out-of-cage rules")}>
                  {has(plan.out_of_cage_mode) || has(plan.out_of_cage_notes)
                    ? joinUnique([outOfCageLabel(plan.out_of_cage_mode, t), plan.out_of_cage_notes])
                    : plan.out_of_cage_rules}
                </Row>
              )}
              {(has(plan.off_limits) || has(plan.off_limits_rooms)) && (
                <Row label={t("carePlan.offLimitsAreas", "Off-limits areas")}>{joinUnique([plan.off_limits, plan.off_limits_rooms])}</Row>
              )}
              {hazards.length === 0 && has(plan.safety_rules) && <Row label={t("carePlan.safetyRules", "Safety rules")}>{plan.safety_rules}</Row>}
              {has(plan.other_pets) && <Row label={t("carePlan.otherPets", "Other pets")}>{plan.other_pets}</Row>}
              {has(plan.cleaning_instructions) && <Row label={t("carePlan.cleaningProducts", "Cleaning products")}>{plan.cleaning_instructions}</Row>}
            </>
          )}

          {/* Emergency: its own anchor (deep link, Review tap-to-fix, coach). */}
          {present.emergency && (
            <section id="emergency" data-coach={COACH.emergency} ref={setRef("emergency")} className="cp-row scroll-mt-2 py-3">
              <p className="m-0 flex items-center gap-1.5 text-[15px] font-[700]" style={{ color: K.red }}>
                <Siren className="size-4" aria-hidden="true" />{t("carePlan.emergency", "Emergency")}
              </p>
              {hasWhenToCall && (
                <Callout label={t("carePlan.whenToCall", "When to call")}>
                  {joinUnique([
                    has(plan.when_to_call_owner) && t("carePlan.callOwner", "Call the owner: {{info}}", { info: plan.when_to_call_owner }),
                    has(plan.when_to_call_vet) && t("carePlan.callVet", "Call the vet: {{info}}", { info: plan.when_to_call_vet }),
                  ])}
                </Callout>
              )}
              {contactRows.length > 0 && (
                <div className="mt-1 flex flex-col">
                  {contactRows.map((r, i) => {
                    const v = (contacts[r.key] ?? "").toString();
                    const isPhone = /phone|control|owner/.test(r.key) && /[0-9]/.test(v);
                    return (
                      <div key={r.key} className={`flex min-h-[44px] items-center justify-between gap-4 py-1.5 ${i > 0 ? "border-t" : ""}`} style={{ borderColor: K.line }}>
                        <span className="shrink-0 text-[13.5px] font-[700]" style={{ color: K.quiet }}>{displayLabel(t, r.label)}</span>
                        <span className="min-w-0 text-right text-[15px] font-[600]" style={{ color: K.forest }}>
                          {isPhone ? (
                            <a href={`tel:${v.replace(/[^0-9+]/g, "")}`} className="inline-flex min-h-[44px] items-center gap-1.5 underline" style={{ color: K.moss }}>
                              <Phone className="size-4 shrink-0" aria-hidden="true" />{v}
                            </a>
                          ) : v}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          )}
        </Card>
      )}

      {footer}
    </div>
  );
}

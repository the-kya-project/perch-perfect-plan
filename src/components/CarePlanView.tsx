import { useEffect, useRef, useState } from "react";
import { ClipPlayer } from "@/components/ClipPlayer";
import { IconTile, CtaLink } from "@/components/system";
import { normalizeFeedTimes, feedTimeLabel } from "@/lib/feedTimes";
import {
  WATER_FREQ_LABELS,
  TREATS_FREQ_LABELS,
  OUT_OF_CAGE_LABELS,
  BOWL_WASH_LABELS,
  prettyLabel,
  formatAmountUnit,
  formatRemovalMinutes,
} from "@/lib/labels";
import {
  AlertTriangle, ShieldAlert, Phone, Pencil,
  Utensils, Smile, Home as HomeIcon, Stethoscope, CalendarClock, Siren,
} from "lucide-react";

// THE single read-only care-plan view. Redesigned "Option A" layout — sticky
// scrollable section nav (scroll-spy + tap-to-scroll), structured section cards
// (icon + title + labeled teal rows), amber callouts for soft rules and red
// callouts for true danger, deep-link-to-section. Purely presentational: it
// takes the plan DATA + context as props and never fetches. Rendered by all
// three surfaces — owner, household member/caregiver, and the external sitter
// care-sheet — each supplying its own data, visibleSections, and canEdit.
//
// Section anchors carry BOTH a stable `id` (food/behavior/home/health/routine/
// emergency, for deep-linking) and the sitter-onboarding `data-coach` keys
// (cp-food / cp-handling / cp-home / cp-health / cp-emergency).

export const CARE_PLAN_SECTIONS = ["food", "behavior", "home", "health", "routine", "emergency"] as const;
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

const NAV: { id: CareSection; label: string; icon: React.ReactNode }[] = [
  { id: "food", label: "Food", icon: <Utensils className="size-3.5" /> },
  { id: "behavior", label: "Behavior", icon: <Smile className="size-3.5" /> },
  { id: "home", label: "Home", icon: <HomeIcon className="size-3.5" /> },
  { id: "health", label: "Health", icon: <Stethoscope className="size-3.5" /> },
  { id: "routine", label: "Routine", icon: <CalendarClock className="size-3.5" /> },
  { id: "emergency", label: "Emergency", icon: <Siren className="size-3.5" /> },
];

// data-coach anchors the sitter onboarding points at (CP_TARGET in
// SitterOnboarding). Routine has no coach step.
const COACH: Partial<Record<CareSection, string>> = {
  food: "cp-food", behavior: "cp-handling", home: "cp-home", health: "cp-health", emergency: "cp-emergency",
};

function has(v: any): boolean {
  if (v == null) return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "string") return v.trim().length > 0;
  if (typeof v === "object") return Object.keys(v).length > 0;
  return true;
}
function joinUnique(parts: (string | null | undefined | false)[]): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    const v = (p ?? "").toString().trim();
    if (!v || seen.has(v.toLowerCase())) continue;
    seen.add(v.toLowerCase());
    out.push(v);
  }
  return out.join("\n");
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
}: {
  data: CarePlanData;
  /** Which sections this surface may show (in addition to data-presence gating). */
  visibleSections?: readonly CareSection[];
  /** Include the emergency contacts list in the Emergency card (sitter: false). */
  showEmergencyContacts?: boolean;
  /** Show an edit entry (UX only; RLS enforces). Never true for the sitter. */
  canEdit?: boolean;
  onEdit?: () => void;
  /** Deep-link target — scrolls this section into view on mount. */
  targetSection?: CareSection;
  /** Where the sticky nav pins, when another sticky bar sits above it (sitter). */
  stickyTopPx?: number;
  /** Optional header content rendered inside the sticky block, above the nav. */
  header?: React.ReactNode;
  /** Optional content rendered after the section cards. */
  footer?: React.ReactNode;
}) {
  const bird = (data.bird ?? {}) as any;
  const plan = (data.plan ?? {}) as any;
  const name = (bird.name ?? "this bird") as string;
  const tasks = (data.tasks ?? []) as any[];
  const contacts = (data.contacts ?? {}) as Record<string, string | null>;
  const watchClips = (data.watchClips ?? []) as { key: string; label: string; url: string }[];
  const clipByKey = (k: string) => watchClips.find((c) => c.key === k) ?? null;
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
  const showHome = has(plan.cage_location) || has(plan.out_of_cage_mode) || has(plan.out_of_cage_notes) || has(plan.out_of_cage_rules) || hazards.length > 0 || has(plan.hazards_other) || has(plan.off_limits) || has(plan.off_limits_rooms) || has(plan.safety_rules) || has(plan.other_pets);
  const showHealth = has(bird.normal_weight) || has(bird.normal_weight_min) || has(bird.normal_weight_max) || has(plan.whats_normal) || has(plan.normal_appetite) || has(plan.normal_droppings) || has(plan.normal_noise) || has(plan.normal_activity) || has(plan.normal_sleep) || has(plan.normal_behavior_with_strangers) || has(bird.medical_conditions) || has(bird.medications) || has(plan.medication_schedule) || !!baselineClipUrl;

  const handlingDangerous = /\b(no|do not|don'?t|never|owner.?only)\b/i.test(`${plan.step_up ?? ""} ${plan.step_up_notes ?? ""} ${plan.handlers ?? ""}`);

  const weightStr = (() => {
    if (has(bird.normal_weight_min) && has(bird.normal_weight_max)) return `${bird.normal_weight_min}–${bird.normal_weight_max} g`;
    if (has(bird.normal_weight)) return `${bird.normal_weight} g`;
    return null;
  })();

  const groups = TIME_ORDER
    .map((t) => ({ t, items: tasks.filter((x) => (x.time_of_day || "anytime") === t) }))
    .filter((g) => g.items.length > 0);
  const ungrouped = tasks.filter((x) => !TIME_ORDER.includes(x.time_of_day || "anytime"));
  if (ungrouped.length) groups.push({ t: "anytime", items: ungrouped });

  // Contacts only when the surface includes them (sitter shows them on its own
  // Emergency tab, so the care-sheet omits them).
  const contactRows = showEmergencyContacts ? CONTACT_ROWS.filter((r) => (contacts[r.key] ?? "").toString().trim()) : [];
  const hasWhenToCall = has(plan.when_to_call_owner) || has(plan.when_to_call_vet);

  // present = has content AND the surface allows the section.
  const present: Record<CareSection, boolean> = {
    food: canShow("food") && (showFeeding || neverFeed.length > 0),
    behavior: canShow("behavior") && showHandling,
    home: canShow("home") && showHome,
    health: canShow("health") && showHealth,
    routine: canShow("routine") && groups.length > 0,
    emergency: canShow("emergency") && (contactRows.length > 0 || hasWhenToCall),
  };
  const presentNav = NAV.filter((n) => present[n.id]);
  const presentKey = presentNav.map((n) => n.id).join(",");

  // ---- sticky-nav offset, scroll-spy, tap-to-scroll, deep-link -------------
  const topRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const [active, setActive] = useState<CareSection | null>(null);
  const deepLinked = useRef(false);

  const offsetOf = () => stickyTopPx + (topRef.current?.offsetHeight ?? 0) + 8;

  const scrollToSection = (id: CareSection, behavior: ScrollBehavior = "smooth") => {
    const el = sectionRefs.current[id];
    if (!el) return;
    const y = el.getBoundingClientRect().top + window.scrollY - offsetOf();
    window.scrollTo({ top: y, behavior });
  };

  useEffect(() => {
    if (!presentKey) return;
    const ids = presentKey.split(",") as CareSection[];
    const onScroll = () => {
      const off = offsetOf() + 4;
      let current: CareSection = ids[0];
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

  const setRef = (id: CareSection) => (el: HTMLElement | null) => { sectionRefs.current[id] = el; };
  const stickyHasContent = !!header || presentNav.length > 1;

  return (
    <>
      {stickyHasContent && (
        <div ref={topRef} style={{ top: stickyTopPx }} className="sticky z-20 border-b border-[var(--line)] bg-[var(--cream)]/95 backdrop-blur">
          {header && <div className="mx-auto max-w-md px-5 pt-safe pb-2.5">{header}</div>}
          {presentNav.length > 1 && (
            <div className="mx-auto max-w-md">
              <div className={`flex gap-2 overflow-x-auto px-5 pb-2.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${header ? "" : "pt-2.5"}`}>
                {presentNav.map((n) => {
                  const on = active === n.id;
                  return (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => scrollToSection(n.id)}
                      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
                        on ? "bg-[var(--ink)] text-white" : "bg-white text-[var(--ink)] ring-1 ring-[var(--line2)]"
                      }`}
                    >
                      {n.icon}{n.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      <main className="mx-auto max-w-md space-y-4 px-5 py-5">
        {canEdit && onEdit && (
          <div className="-mb-1 flex justify-end">
            <CtaLink label="Edit care plan" icon={<Pencil className="size-3.5" />} onPress={onEdit} />
          </div>
        )}

        {/* ------------------------------------------------------------ FOOD */}
        {present.food && (
          <SectionCard id="food" coach={COACH.food} setRef={setRef("food")} icon={<Utensils className="size-5" />} title={`What ${name} eats`}>
            {neverFeed.length > 0 && (
              <DangerCallout title="Never feed — toxic to this bird">
                <DangerChips items={neverFeed} />
                <p className="mt-2 flex items-start gap-1.5 text-xs"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" />Keep these completely out of reach.</p>
              </DangerCallout>
            )}
            {showFeeding && <Callout>Don't introduce new foods while the owner is away.</Callout>}
            {!hasStructuredFood && has(plan.food_instructions) && <Field label="Diet overview"><RichText text={plan.food_instructions} /></Field>}
            {diet.length > 0 && <Field label="Diet types"><Chips items={diet} /></Field>}
            {has(plan.diet_other) && <Field label="Other diet">{plan.diet_other}</Field>}
            {hasPerFoodDetails ? (
              foodRows.map((f, i) => (
                <div key={`${f.type}-${i}`} className="rounded-[12px] bg-[var(--cream)] p-3">
                  <p className="t-eyebrow text-[var(--teal-on-cream)]">
                    {f.type.charAt(0).toUpperCase() + f.type.slice(1).replace(/_/g, " ")}{f.name ? ` (${f.name})` : ""}
                  </p>
                  {has(f.amount) && (
                    <p className="mt-1 text-sm text-[var(--ink)]"><span className="text-[var(--mute)]">Amount: </span>{f.unit ? formatAmountUnit(f.amount, f.unit) : f.amount}{f.freeFed ? " · free-fed" : ""}</p>
                  )}
                  {f.times.length > 0 && (
                    <p className="text-sm text-[var(--ink)]"><span className="text-[var(--mute)]">When: </span>{f.times.map((ft) => feedTimeLabel(ft)).join(", ")}</p>
                  )}
                  {f.note && <p className="mt-1 text-sm text-[var(--ink)]"><span className="text-[var(--mute)]">Note: </span>{f.note}</p>}
                </div>
              ))
            ) : (
              (has(plan.food_brand) || has(plan.amount_value)) && (
                <Field label="Brand & amount">{`${plan.food_brand ?? ""}${has(plan.amount_value) ? ` — ${formatAmountUnit(plan.amount_value, plan.amount_unit)}` : ""}`.trim()}</Field>
              )
            )}
            {!foodRows.some((f) => f.times.length > 0) && feedingTimes.length > 0 && (
              <Field label="Feeding times"><Chips items={feedingTimes} /></Field>
            )}
            {freshFoods.length > 0 && <Field label="Fresh foods"><Chips items={freshFoods} /></Field>}
            {has(plan.fresh_foods_other) && <Field label="Other fresh foods">{plan.fresh_foods_other}</Field>}
            {(has(plan.treats_notes) || has(plan.treats_frequency)) && (
              <Field label="Treats">{`${plan.treats_notes ?? ""}${has(plan.treats_frequency) ? `\nFrequency: ${prettyLabel(plan.treats_frequency, TREATS_FREQ_LABELS)}` : ""}`.trim()}</Field>
            )}
            {(has(plan.water_frequency) || has(plan.water_notes) || has(plan.water_instructions)) && (
              <Field label="Water">
                {has(plan.water_frequency) || has(plan.water_notes)
                  ? joinUnique([plan.water_frequency && `Water ${prettyLabel(plan.water_frequency, WATER_FREQ_LABELS)}`, plan.water_notes])
                  : plan.water_instructions}
              </Field>
            )}
            <div className="rounded-[12px] bg-[var(--cream)] p-3">
              <p className="t-eyebrow text-[var(--teal-on-cream)]">Freshness & hygiene</p>
              <ul className="mt-1.5 space-y-1 text-sm text-[var(--ink)]">
                <li>Remove fresh food within <strong className="font-medium">{formatRemovalMinutes(plan.fresh_food_removal_minutes)}</strong> of serving.</li>
                <li>Wash food bowls: <strong className="font-medium">{prettyLabel(plan.food_bowl_wash_cadence, BOWL_WASH_LABELS) || "—"}</strong>.</li>
                <li>Wash water bowl: <strong className="font-medium">{prettyLabel(plan.water_bowl_wash_cadence, BOWL_WASH_LABELS) || "—"}</strong>.</li>
              </ul>
              {has(plan.food_hygiene_notes) && <p className="mt-2 text-xs text-[var(--mute)] whitespace-pre-line">{plan.food_hygiene_notes}</p>}
            </div>
            {has(plan.food_storage) && <Field label="Food storage">{plan.food_storage}</Field>}
            <ClipField clip={clipByKey("food_water")} />
          </SectionCard>
        )}

        {/* -------------------------------------------------------- BEHAVIOR */}
        {present.behavior && (
          <SectionCard id="behavior" coach={COACH.behavior} setRef={setRef("behavior")} icon={<Smile className="size-5" />} title={`Handling ${name}`}>
            {(handlingDangerous || has(plan.bite_risk)) && (
              <Callout><AlertTriangle className="mt-0.5 size-4 shrink-0" /><span>This bird has handling restrictions — read this section before any contact.</span></Callout>
            )}
            <StepUpField stepUp={plan.step_up} notes={plan.step_up_notes} />
            {has(plan.handlers) && <Field label="Who can handle">{plan.handlers}</Field>}
            {!has(plan.step_up) && !has(plan.step_up_notes) && !has(plan.handlers) && has(plan.handling_rules) && (
              <Field label="Handling rules">{plan.handling_rules}</Field>
            )}
            {has(plan.likes) && <Field label="Likes">{plan.likes}</Field>}
            {(has(plan.fears_triggers) || has(plan.known_triggers)) && (
              <Callout label="Fears & triggers">{joinUnique([plan.fears_triggers, plan.known_triggers])}</Callout>
            )}
            {has(plan.bite_risk) && (
              <DangerCallout title="Bite warning signs" icon={<ShieldAlert className="size-3.5" />}>
                <p className="text-sm whitespace-pre-line">{plan.bite_risk}</p>
              </DangerCallout>
            )}
            <ClipField clip={clipByKey("step_up")} />
          </SectionCard>
        )}

        {/* ------------------------------------------------------------ HOME */}
        {present.home && (
          <SectionCard id="home" coach={COACH.home} setRef={setRef("home")} icon={<HomeIcon className="size-5" />} title={`${name}'s home & safety`}>
            {hazards.length > 0 && (
              <DangerCallout title="Household hazards — keep away">
                <DangerChips items={hazards} />
                {has(plan.hazards_other) && <p className="mt-2 text-sm whitespace-pre-line">{plan.hazards_other}</p>}
              </DangerCallout>
            )}
            {has(plan.cage_location) && <Field label="Cage location">{plan.cage_location}</Field>}
            {(has(plan.out_of_cage_mode) || has(plan.out_of_cage_notes) || has(plan.out_of_cage_rules)) && (
              <Field label="Out-of-cage rules">
                {has(plan.out_of_cage_mode) || has(plan.out_of_cage_notes)
                  ? joinUnique([prettyLabel(plan.out_of_cage_mode, OUT_OF_CAGE_LABELS), plan.out_of_cage_notes])
                  : plan.out_of_cage_rules}
              </Field>
            )}
            {(has(plan.off_limits) || has(plan.off_limits_rooms)) && (
              <Field label="Off-limits areas">{joinUnique([plan.off_limits, plan.off_limits_rooms])}</Field>
            )}
            {hazards.length === 0 && has(plan.safety_rules) && <Field label="Safety rules">{plan.safety_rules}</Field>}
            {has(plan.other_pets) && <Field label="Other pets">{plan.other_pets}</Field>}
            <ClipField clip={clipByKey("locations")} />
          </SectionCard>
        )}

        {/* ---------------------------------------------------------- HEALTH */}
        {present.health && (
          <SectionCard id="health" coach={COACH.health} setRef={setRef("health")} icon={<Stethoscope className="size-5" />} title={`What's normal for ${name}`}>
            {weightStr && <Field label="Normal weight">{weightStr}</Field>}
            {has(plan.whats_normal) && <Field label="What's normal (overall)">{plan.whats_normal}</Field>}
            {has(plan.normal_appetite) && <Field label="Normal appetite">{plan.normal_appetite}</Field>}
            {has(plan.normal_droppings) && <Field label="Normal droppings">{plan.normal_droppings}</Field>}
            {has(plan.normal_noise) && <Field label="Normal noise">{plan.normal_noise}</Field>}
            {has(plan.normal_activity) && <Field label="Normal activity">{plan.normal_activity}</Field>}
            {has(plan.normal_sleep) && <Field label="Normal sleep">{plan.normal_sleep}</Field>}
            {has(plan.normal_behavior_with_strangers) && <Field label="With strangers">{plan.normal_behavior_with_strangers}</Field>}
            {has(bird.medical_conditions) && <Field label="Medical conditions">{bird.medical_conditions}</Field>}
            {(has(bird.medications) || has(plan.medication_schedule)) && (
              <Field label="Medications">{joinUnique([bird.medications, plan.medication_schedule])}</Field>
            )}
            {baselineClipUrl && (
              <div className="overflow-hidden rounded-[12px] ring-1 ring-[var(--line2)]">
                <ClipPlayer src={baselineClipUrl} label="Normal-behavior clip" className="aspect-video" />
                <p className="bg-white px-2 py-1.5 text-[11px] font-medium text-[var(--ink)]">Normal-behavior clip</p>
              </div>
            )}
          </SectionCard>
        )}

        {/* --------------------------------------------------------- ROUTINE */}
        {present.routine && (
          <SectionCard id="routine" setRef={setRef("routine")} icon={<CalendarClock className="size-5" />} title="Daily rhythm">
            {groups.map((g) => (
              <div key={g.t}>
                <p className="t-eyebrow text-[var(--teal-on-cream)]">{TIME_LABEL[g.t] ?? g.t}</p>
                <ul className="mt-1 space-y-1.5">
                  {g.items.map((it) => (
                    <li key={it.id} className="text-sm text-[var(--ink)]">
                      {it.title}
                      {it.instructions && <span className="block text-xs text-[var(--mute)] whitespace-pre-line">{it.instructions}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            <ClipField clip={clipByKey("bedtime")} />
          </SectionCard>
        )}

        {/* ------------------------------------------------------- EMERGENCY */}
        {present.emergency && (
          <SectionCard id="emergency" coach={COACH.emergency} setRef={setRef("emergency")} icon={<Siren className="size-5" />} title="Emergency" tone="red">
            {hasWhenToCall && (
              <Callout label="When to call">
                {joinUnique([
                  has(plan.when_to_call_owner) && `Call the owner: ${plan.when_to_call_owner}`,
                  has(plan.when_to_call_vet) && `Call the vet: ${plan.when_to_call_vet}`,
                ])}
              </Callout>
            )}
            {contactRows.map((r) => {
              const v = (contacts[r.key] ?? "").toString();
              const isPhone = /phone|control|owner/.test(r.key) && /[0-9]/.test(v);
              return (
                <Field key={r.key} label={r.label}>
                  {isPhone ? (
                    <a href={`tel:${v.replace(/[^0-9+]/g, "")}`} className="inline-flex items-center gap-1.5 font-medium text-[var(--ink)] underline">
                      <Phone className="size-3.5" />{v}
                    </a>
                  ) : v}
                </Field>
              );
            })}
          </SectionCard>
        )}

        {footer}
      </main>
    </>
  );
}

// ---------------------------------------------------------------------------
// Presentational primitives.
// ---------------------------------------------------------------------------
function SectionCard({
  id, coach, setRef, icon, title, tone = "ink", children,
}: {
  id: CareSection;
  coach?: string;
  setRef: (el: HTMLElement | null) => void;
  icon: React.ReactNode;
  title: string;
  tone?: "ink" | "red";
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      data-coach={coach}
      ref={setRef}
      className="scroll-mt-2 overflow-hidden rounded-[18px] bg-white p-4 ring-1 ring-[var(--line2)]"
      style={{ boxShadow: "0 1px 0 rgba(40,50,40,.02), 0 6px 14px -8px rgba(40,50,40,.08)" }}
    >
      <div className="flex items-center gap-3">
        <IconTile size={38} tone={tone === "red" ? "red" : "ink-lime"} icon={icon} />
        <h2 className="t-section">{title}</h2>
      </div>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  if (!has(children as any)) return null;
  return (
    <div>
      <p className="t-eyebrow text-[var(--teal-on-cream)]">{label}</p>
      <div className="mt-0.5 text-sm text-[var(--ink)] whitespace-pre-line">{children}</div>
    </div>
  );
}

// Amber callout — soft hard-rules / warnings (no new foods, fears, when-to-call).
function Callout({ label, children }: { label?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[12px] bg-[var(--amber-fill)] p-3 text-[var(--amber-ink)]">
      {label && <p className="t-eyebrow">{label}</p>}
      <div className={`flex items-start gap-1.5 text-sm whitespace-pre-line ${label ? "mt-1" : ""}`}>{children}</div>
    </div>
  );
}

// Red callout — true danger (toxic foods, hazards, bite risk).
function DangerCallout({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-[12px] bg-[var(--red-fill)] p-3 text-[var(--red-deep)] ring-1 ring-[var(--red-deep)]/15">
      <p className="t-eyebrow flex items-center gap-1.5">{icon}{title}</p>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function RichText({ text }: { text: string }) {
  const lines = text.split("\n");
  const blocks: React.ReactNode[] = [];
  let bullets: string[] = [];
  const flush = (key: string) => {
    if (!bullets.length) return;
    blocks.push(
      <ul key={key} className="list-disc space-y-1 pl-5 marker:text-[var(--mute)]">
        {bullets.map((b, i) => <li key={i} className="pl-0.5">{b}</li>)}
      </ul>,
    );
    bullets = [];
  };
  lines.forEach((raw, i) => {
    const m = raw.match(/^\s*•\s+(.*)$/);
    if (m) { bullets.push(m[1]); return; }
    flush(`ul-${i}`);
    if (raw.trim()) blocks.push(<p key={i}>{raw}</p>);
  });
  flush("ul-end");
  return <div className="space-y-1.5">{blocks}</div>;
}

function Chips({ items }: { items: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((s) => <span key={s} className="rounded-full bg-[var(--pale)] px-2.5 py-0.5 text-xs font-medium text-[var(--moss)]">{s}</span>)}
    </div>
  );
}

function DangerChips({ items }: { items: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((s) => <span key={s} className="rounded-full bg-[var(--red-deep)] px-2.5 py-1 text-xs font-medium text-white">{s}</span>)}
    </div>
  );
}

// Step-up outcome pill + the owner's exact qualifier verbatim.
function StepUpField({ stepUp, notes }: { stepUp?: string | null; notes?: string | null }) {
  const raw = (stepUp ?? "").trim().toLowerCase();
  const qualifier = (notes ?? "").trim();
  const base = raw === "yes" ? "Yes" : raw === "no" ? "No" : raw === "sometimes" ? "Sometimes" : null;
  if (!base && !qualifier) return null;
  const label = base ? (qualifier ? `${base}, with caveats` : base) : null;
  const cautionary = !base || raw === "no" || !!qualifier;
  return (
    <div>
      <p className="t-eyebrow text-[var(--teal-on-cream)]">Step up</p>
      {label && (
        <span className={`mt-1 inline-flex items-center rounded-full px-2.5 py-1 text-[11.5px] font-medium ${cautionary ? "bg-[var(--amber-fill)] text-[var(--amber-ink)]" : "bg-[var(--pale)] text-[var(--moss)]"}`}>{label}</span>
      )}
      {qualifier && <p className="mt-1.5 text-sm text-[var(--ink)] whitespace-pre-line">{qualifier}</p>}
    </div>
  );
}

// Contextual "show me" clip placed inside its section.
function ClipField({ clip }: { clip: { key: string; label: string; url: string } | null }) {
  if (!clip) return null;
  return (
    <div>
      <p className="t-eyebrow text-[var(--teal-on-cream)]">Show me</p>
      <div className="mt-1 overflow-hidden rounded-[12px] bg-[var(--cream)] ring-1 ring-[var(--line2)]">
        <ClipPlayer src={clip.url} label={clip.label} className="aspect-video" />
        <p className="px-2 py-1.5 text-[12px] font-medium leading-tight text-[var(--ink)]">{clip.label}</p>
      </div>
    </div>
  );
}

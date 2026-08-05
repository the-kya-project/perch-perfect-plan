import { ShieldAlert, Utensils, Smile, Home as HomeIcon, Stethoscope, Siren, Video } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ClipPlayer } from "@/components/ClipPlayer";
import { normalizeFeedTimes } from "@/lib/feedTimes";
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
  has, joinUnique, SectionCard, Field, KVList, Metric, FeedingItem,
  Callout, DangerCallout, RichText, Chips, DangerChips, StepUpField,
} from "@/components/carePlanCards";

// Read-only render of a bird's care plan for the SITTER care-sheet (token link)
// and the owner's "view as your sitter" preview. Built from the SAME shared card
// primitives as the authenticated CarePlanView (see carePlanCards.tsx), so the
// two surfaces share one card design and can't drift apart.
//
// Sitter-specific vs CarePlanView: a Basics identity card and a grouped "Tips
// from the owner" clip section at the top (the sitter's clips are shown together
// rather than threaded per-section, so no clip is dropped), and it omits the
// routine and emergency-contacts sections (the sitter has those on its own tabs).
// Pure presentational — no token/auth coupling; clip URLs arrive pre-signed.

const CARD_SHADOW = { boxShadow: "0 1px 0 rgba(40,50,40,.02), 0 6px 14px -8px rgba(40,50,40,.08)" };

export type CareSheetData = {
  bird: any;
  plan: any;
  clips: Array<{ key: string; label: string; url: string }>;
  baselineClipUrl: string | null;
};

export function CareSheetView({ data }: { data: CareSheetData }) {
  const { t } = useTranslation();
  const bird = data.bird as any;
  const plan = (data.plan ?? {}) as any;
  const clips = data.clips ?? [];
  const name = (bird?.name ?? t("careSheet.thisBird", "this bird")) as string;

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

  const showBasics = has(bird.name) || has(bird.species) || has(bird.age) || has(bird.photo_url);
  const showFeeding = diet.length || plan.food_brand || plan.amount_value || feedingTimes.length || freshFoods.length || plan.fresh_foods_other || plan.treats_notes || plan.treats_frequency || plan.water_frequency || plan.water_notes || plan.food_storage || plan.food_hygiene_notes || plan.food_instructions || plan.water_instructions || plan.fresh_food_removal_minutes;
  const showHandling = has(plan.step_up) || has(plan.step_up_notes) || has(plan.handlers) || has(plan.likes) || has(plan.fears_triggers) || has(plan.bite_risk) || has(plan.handling_rules) || has(plan.known_triggers);
  const showHome = has(plan.cage_location) || has(plan.out_of_cage_mode) || has(plan.out_of_cage_notes) || has(plan.out_of_cage_rules) || hazards.length || has(plan.hazards_other) || has(plan.off_limits) || has(plan.off_limits_rooms) || has(plan.safety_rules) || has(plan.other_pets);

  const hasStructuredFood =
    diet.length > 0 ||
    has(plan.diet_other) ||
    hasPerFoodDetails ||
    has(plan.food_brand) ||
    has(plan.amount_value) ||
    feedingTimes.length > 0 ||
    freshFoods.length > 0 ||
    has(plan.fresh_foods_other) ||
    has(plan.treats_notes) ||
    has(plan.water_frequency) ||
    has(plan.water_notes) ||
    has(plan.food_storage);
  const showHealth = has(bird.normal_weight) || has(bird.normal_weight_min) || has(bird.normal_weight_max) || has(plan.whats_normal) || has(plan.normal_appetite) || has(plan.normal_droppings) || has(plan.normal_noise) || has(plan.normal_activity) || has(plan.normal_sleep) || has(plan.normal_behavior_with_strangers) || has(bird.medical_conditions) || has(bird.medications) || has(plan.medication_schedule) || data.baselineClipUrl;

  const handlingDangerous = /\b(no|do not|don'?t|never|owner.?only)\b/i.test(
    `${plan.step_up ?? ""} ${plan.step_up_notes ?? ""} ${plan.handlers ?? ""}`,
  );

  const weightStr = (() => {
    if (has(bird.normal_weight_min) && has(bird.normal_weight_max)) return `${bird.normal_weight_min}–${bird.normal_weight_max} g`;
    if (has(bird.normal_weight)) return `${bird.normal_weight} g`;
    return null;
  })();

  return (
    <>
      {showBasics && (
        <section className="overflow-hidden rounded-[18px] bg-white p-4 ring-1 ring-[var(--line2)]" style={CARD_SHADOW}>
          <div className="flex items-center gap-4">
            {bird.photo_url ? (
              <img src={bird.photo_url} alt={bird.name} className="block size-16 shrink-0 rounded-2xl object-cover ring-1 ring-[var(--line)]" style={{ objectPosition: bird.photo_position ?? "50% 20%" }} />
            ) : (
              <div className="grid size-16 shrink-0 place-items-center rounded-2xl bg-[var(--pale2)] text-xl font-medium text-[var(--moss)]">{(bird.name ?? "?").slice(0, 1).toUpperCase()}</div>
            )}
            <div className="min-w-0">
              <p className="t-section leading-tight">{bird.name}</p>
              {has(bird.species) && <p className="text-sm text-[var(--mute)]">{bird.species}</p>}
              {has(bird.age) && <p className="text-xs text-[var(--mute)]">{bird.age}</p>}
            </div>
          </div>
        </section>
      )}

      {clips.length > 0 && (
        <SectionCard icon={<Video className="size-5" />} eyebrow={t("careSheet.tips.eyebrow", "Tips")} title={t("careSheet.tips.title", "Tips from the owner")}>
          <p className="text-sm text-[var(--mute)]">{t("careSheet.tips.subtitle", "Short clips from the owner showing how things are done.")}</p>
          <div className="space-y-3">
            {clips.map((c: any) => (
              <div key={c.key} className="overflow-hidden rounded-[12px] bg-[var(--cream)] ring-1 ring-[var(--line2)]">
                <ClipPlayer src={c.url} label={c.label} className="aspect-video" />
                <p className="px-2 py-1.5 text-[12px] font-medium leading-tight text-[var(--ink)]">{c.label}</p>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {showFeeding && (
        <SectionCard icon={<Utensils className="size-5" />} eyebrow={t("careSheet.food.eyebrow", "Food")} title={t("careSheet.food.title", "What {{name}} eats", { name })} coach="cp-food">
          {neverFeed.length > 0 && (
            <DangerCallout title={t("careSheet.food.neverFeedTitle", "Never feed · toxic to this bird")}>
              <DangerChips items={neverFeed} />
              <p className="mt-2 text-xs font-medium">{t("careSheet.food.keepOutOfReach", "Keep these completely out of reach.")}</p>
            </DangerCallout>
          )}
          <Callout>{t("careSheet.food.noNewFoods", "Don't introduce new foods while the owner is away.")}</Callout>
          {!hasStructuredFood && has(plan.food_instructions) && <Field label={t("careSheet.field.dietOverview", "Diet overview")}><RichText text={plan.food_instructions} /></Field>}
          {diet.length > 0 && <Field label={t("careSheet.field.dietTypes", "Diet types")}><Chips items={diet} /></Field>}
          {has(plan.diet_other) && <Field label={t("careSheet.field.otherDiet", "Other diet")}>{plan.diet_other}</Field>}
          {hasPerFoodDetails ? (
            <div className="space-y-2">
              {foodRows.map((f, i) => (
                <FeedingItem
                  key={`${f.type}-${i}`}
                  typeLabel={f.type.charAt(0).toUpperCase() + f.type.slice(1).replace(/_/g, " ")}
                  name={f.name}
                  amountStr={has(f.amount) ? (f.unit ? formatAmountUnit(f.amount, f.unit) : String(f.amount)) : ""}
                  times={f.times}
                  freeFed={f.freeFed}
                  note={f.note}
                />
              ))}
            </div>
          ) : (
            (has(plan.food_brand) || has(plan.amount_value)) && (
              <Field label={t("careSheet.field.brandAmount", "Brand & amount")}>{`${plan.food_brand ?? ""}${has(plan.amount_value) ? ` · ${formatAmountUnit(plan.amount_value, plan.amount_unit)}` : ""}`.trim()}</Field>
            )
          )}
          {!foodRows.some((f) => f.times.length > 0) && feedingTimes.length > 0 && (
            <Field label={t("careSheet.field.feedingTimes", "Feeding times")}><Chips items={feedingTimes} /></Field>
          )}
          {freshFoods.length > 0 && <Field label={t("careSheet.field.freshFoods", "Fresh foods")}><Chips items={freshFoods} /></Field>}
          {has(plan.fresh_foods_other) && <Field label={t("careSheet.field.otherFreshFoods", "Other fresh foods")}>{plan.fresh_foods_other}</Field>}
          {(has(plan.treats_notes) || has(plan.treats_frequency)) && (
            <Field label={t("careSheet.field.treats", "Treats")}>
              {has(plan.treats_frequency) && (
                <KVList rows={[{ label: t("careSheet.kv.frequency", "Frequency"), value: prettyLabel(plan.treats_frequency, TREATS_FREQ_LABELS) }]} />
              )}
              {has(plan.treats_notes) && (
                <p className={`text-sm text-[var(--ink)] whitespace-pre-line ${has(plan.treats_frequency) ? "mt-2" : ""}`}>{plan.treats_notes}</p>
              )}
            </Field>
          )}
          {(has(plan.water_frequency) || has(plan.water_notes) || has(plan.water_instructions)) && (
            <Field label={t("careSheet.field.water", "Water")}>
              {has(plan.water_frequency) && (
                <KVList rows={[{ label: t("careSheet.kv.changeWater", "Change water"), value: prettyLabel(plan.water_frequency, WATER_FREQ_LABELS) }]} />
              )}
              {(has(plan.water_notes) || (!has(plan.water_frequency) && has(plan.water_instructions))) && (
                <p className={`text-sm text-[var(--ink)] whitespace-pre-line ${has(plan.water_frequency) ? "mt-2" : ""}`}>
                  {has(plan.water_notes) ? plan.water_notes : plan.water_instructions}
                </p>
              )}
            </Field>
          )}
          <Field label={t("careSheet.field.freshnessHygiene", "Freshness & hygiene")}>
            <KVList
              rows={[
                { label: t("careSheet.kv.removeFreshFood", "Remove fresh food"), value: t("careSheet.value.within", "Within {{duration}}", { duration: formatRemovalMinutes(plan.fresh_food_removal_minutes) }) },
                { label: t("careSheet.kv.washFoodBowls", "Wash food bowls"), value: prettyLabel(plan.food_bowl_wash_cadence, BOWL_WASH_LABELS) },
                { label: t("careSheet.kv.washWaterBowl", "Wash water bowl"), value: prettyLabel(plan.water_bowl_wash_cadence, BOWL_WASH_LABELS) },
              ]}
            />
            {has(plan.food_hygiene_notes) && <p className="mt-2 text-xs text-[var(--mute)] whitespace-pre-line">{plan.food_hygiene_notes}</p>}
          </Field>
          {has(plan.food_storage) && <Field label={t("careSheet.field.foodStorage", "Food storage")}>{plan.food_storage}</Field>}
        </SectionCard>
      )}

      {showHandling && (
        <SectionCard icon={<Smile className="size-5" />} eyebrow={t("careSheet.behavior.eyebrow", "Behavior")} title={t("careSheet.behavior.title", "Handling {{name}}", { name })} coach="cp-handling">
          {(handlingDangerous || has(plan.bite_risk)) && (
            <Callout>{t("careSheet.behavior.restrictions", "This bird has handling restrictions — read this section before any contact.")}</Callout>
          )}
          <StepUpField stepUp={plan.step_up} notes={plan.step_up_notes} />
          {has(plan.handlers) && <Field label={t("careSheet.field.whoCanHandle", "Who can handle")}>{plan.handlers}</Field>}
          {!has(plan.step_up) && !has(plan.step_up_notes) && !has(plan.handlers) && has(plan.handling_rules) && (
            <Field label={t("careSheet.field.handlingRules", "Handling rules")}>{plan.handling_rules}</Field>
          )}
          {has(plan.likes) && <Field label={t("careSheet.field.likes", "Likes")}>{plan.likes}</Field>}
          {(has(plan.fears_triggers) || has(plan.known_triggers)) && (
            <Callout label={t("careSheet.callout.fearsTriggers", "Fears & triggers")}>{joinUnique([plan.fears_triggers, plan.known_triggers])}</Callout>
          )}
          {has(plan.bite_risk) && (
            <DangerCallout title={t("careSheet.behavior.biteWarning", "Bite warning signs")} icon={<ShieldAlert className="size-3.5" />}>
              <p className="text-sm whitespace-pre-line">{plan.bite_risk}</p>
            </DangerCallout>
          )}
        </SectionCard>
      )}

      {showHome && (
        <SectionCard icon={<HomeIcon className="size-5" />} eyebrow={t("careSheet.home.eyebrow", "Home & safety")} title={t("careSheet.home.title", "{{name}}'s home & safety", { name })} coach="cp-home">
          {hazards.length > 0 && (
            <DangerCallout title={t("careSheet.home.hazardsTitle", "Household hazards · keep away")}>
              <DangerChips items={hazards} />
              {has(plan.hazards_other) && <p className="mt-2 text-sm whitespace-pre-line">{plan.hazards_other}</p>}
            </DangerCallout>
          )}
          {has(plan.cage_location) && <Field label={t("careSheet.field.cageLocation", "Cage location")}>{plan.cage_location}</Field>}
          {(has(plan.out_of_cage_mode) || has(plan.out_of_cage_notes) || has(plan.out_of_cage_rules)) && (
            <Field label={t("careSheet.field.outOfCageRules", "Out-of-cage rules")}>
              {has(plan.out_of_cage_mode) || has(plan.out_of_cage_notes)
                ? joinUnique([prettyLabel(plan.out_of_cage_mode, OUT_OF_CAGE_LABELS), plan.out_of_cage_notes])
                : plan.out_of_cage_rules}
            </Field>
          )}
          {(has(plan.off_limits) || has(plan.off_limits_rooms)) && (
            <Field label={t("careSheet.field.offLimitsAreas", "Off-limits areas")}>{joinUnique([plan.off_limits, plan.off_limits_rooms])}</Field>
          )}
          {hazards.length === 0 && has(plan.safety_rules) && <Field label={t("careSheet.field.safetyRules", "Safety rules")}>{plan.safety_rules}</Field>}
          {has(plan.other_pets) && <Field label={t("careSheet.field.otherPets", "Other pets")}>{plan.other_pets}</Field>}
        </SectionCard>
      )}

      {showHealth && (
        <SectionCard icon={<Stethoscope className="size-5" />} eyebrow={t("careSheet.health.eyebrow", "Health")} title={t("careSheet.health.title", "What's normal for {{name}}", { name })} coach="cp-health">
          {weightStr && <Metric value={weightStr} caption={t("careSheet.metric.normalWeight", "Normal weight")} />}
          {has(plan.whats_normal) && <Field label={t("careSheet.field.whatsNormalOverall", "What's normal (overall)")}>{plan.whats_normal}</Field>}
          {has(plan.normal_appetite) && <Field label={t("careSheet.field.normalAppetite", "Normal appetite")}>{plan.normal_appetite}</Field>}
          {has(plan.normal_droppings) && <Field label={t("careSheet.field.normalDroppings", "Normal droppings")}>{plan.normal_droppings}</Field>}
          {has(plan.normal_noise) && <Field label={t("careSheet.field.normalNoise", "Normal noise")}>{plan.normal_noise}</Field>}
          {has(plan.normal_activity) && <Field label={t("careSheet.field.normalActivity", "Normal activity")}>{plan.normal_activity}</Field>}
          {has(plan.normal_sleep) && <Field label={t("careSheet.field.normalSleep", "Normal sleep")}>{plan.normal_sleep}</Field>}
          {has(plan.normal_behavior_with_strangers) && <Field label={t("careSheet.field.withStrangers", "With strangers")}>{plan.normal_behavior_with_strangers}</Field>}
          {has(bird.medical_conditions) && <Field label={t("careSheet.field.medicalConditions", "Medical conditions")}>{bird.medical_conditions}</Field>}
          {(has(bird.medications) || has(plan.medication_schedule)) && (
            <Field label={t("careSheet.field.medications", "Medications")}>{joinUnique([bird.medications, plan.medication_schedule])}</Field>
          )}
          {data.baselineClipUrl && (
            <div className="overflow-hidden rounded-[12px] ring-1 ring-[var(--line2)]">
              <ClipPlayer src={data.baselineClipUrl} label={t("careSheet.health.normalBehaviorClip", "Normal-behavior clip")} className="aspect-video" />
              <p className="bg-white px-2 py-1.5 text-[11px] font-medium text-[var(--ink)]">{t("careSheet.health.normalBehaviorClip", "Normal-behavior clip")}</p>
            </div>
          )}
        </SectionCard>
      )}

      {(has(plan.when_to_call_owner) || has(plan.when_to_call_vet)) && (
        <SectionCard icon={<Siren className="size-5" />} eyebrow={t("careSheet.emergency.eyebrow", "Emergency")} title={t("careSheet.emergency.whenToCall", "When to call")} tone="red" coach="cp-emergency">
          <Callout label={t("careSheet.emergency.whenToCall", "When to call")}>
            {joinUnique([
              has(plan.when_to_call_owner) && t("careSheet.emergency.callOwner", "Call the owner: {{info}}", { info: plan.when_to_call_owner }),
              has(plan.when_to_call_vet) && t("careSheet.emergency.callVet", "Call the vet: {{info}}", { info: plan.when_to_call_vet }),
            ])}
          </Callout>
        </SectionCard>
      )}
    </>
  );
}

import { useCallback } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { ChevronRight } from "lucide-react";
import { useSitterContext } from "./route";
import { K, KyaHeading } from "@/components/kya";
import { PageHeader, useGoBack } from "@/components/headers";
import { VetCallRow, PersonCallRow } from "@/components/sitter/CallRows";

export const Route = createFileRoute("/sitter/$token/emergency")({
  component: Emergency,
});

type Pron = "m" | "f" | "n";
/** From birds.sex ("Male" / "Female" / null): first letter m / f, else they. */
function pronFor(sex: unknown): Pron {
  const c = typeof sex === "string" ? sex.trim().charAt(0).toLowerCase() : "";
  return c === "m" ? "m" : c === "f" ? "f" : "n";
}

/** The four rules. `name` null = several birds share this screen ("your bird"). */
function rules(t: TFunction, name: string | null, p: Pron): string[] {
  const warm = name === null
    ? t("sitter.emergency.rule2_your", "Keep your bird warm: about 85–90°F if they seem sick or in shock. Heat on one side only.")
    : p === "m" ? t("sitter.emergency.rule2_m", "Keep {{name}} warm: about 85–90°F if he seems sick or in shock. Heat on one side only.", { name })
    : p === "f" ? t("sitter.emergency.rule2_f", "Keep {{name}} warm: about 85–90°F if she seems sick or in shock. Heat on one side only.", { name })
    : t("sitter.emergency.rule2_n", "Keep {{name}} warm: about 85–90°F if they seem sick or in shock. Heat on one side only.", { name });
  const quiet = name === null
    ? t("sitter.emergency.rule3_your", "Keep your bird somewhere quiet and dim, and handle them as little as possible.")
    : p === "m" ? t("sitter.emergency.rule3_m", "Keep him somewhere quiet and dim, and handle him as little as possible.")
    : p === "f" ? t("sitter.emergency.rule3_f", "Keep her somewhere quiet and dim, and handle her as little as possible.")
    : t("sitter.emergency.rule3_n", "Keep them somewhere quiet and dim, and handle them as little as possible.");
  return [
    t("sitter.emergency.rule1", "Stay calm."),
    warm,
    quiet,
    t("sitter.emergency.rule4_go", "Call the avian vet and get ready to go."),
  ];
}

function Emergency() {
  const { t } = useTranslation();
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const { data: ctx } = useSitterContext(token);
  const c: Record<string, string | undefined> = (ctx.contacts ?? {}) as any;
  const goBack = useGoBack(useCallback(() => navigate({ to: "/sitter/$token", params: { token } }), [navigate, token]));
  const playbooks = [
    {
      title: t("sitter.emergency.pb_breathing_title", "Trouble breathing / open-mouth"),
      signs: t("sitter.emergency.pb_breathing_signs", "Open-mouth breathing, tail bobbing at rest, wheezing or clicking, wings held away, weakness."),
      steps: [
        t("sitter.emergency.pb_breathing_step1", "Stop handling — birds need chest movement to breathe."),
        t("sitter.emergency.pb_breathing_step2", "Move the bird away from fumes, smoke, heat, and stress to fresh air."),
        t("sitter.emergency.pb_breathing_step3", "Keep warm (~85–90°F if shocky, heat on ONE side only), quiet, and dim."),
        t("sitter.emergency.pb_breathing_step4", "Don't mist, bathe, or force water."),
        t("sitter.emergency.pb_breathing_step5", "Call the avian vet and prepare to transport."),
      ],
    },
    {
      title: t("sitter.emergency.pb_bleeding_title", "Bleeding"),
      signs: t("sitter.emergency.pb_bleeding_signs", "Active blood from a nail, feather, skin, or beak."),
      steps: [
        t("sitter.emergency.pb_bleeding_step1", "Stay calm."),
        t("sitter.emergency.pb_bleeding_step2", "Apply gentle, steady pressure with clean gauze."),
        t("sitter.emergency.pb_bleeding_step3", "Use cornstarch or styptic powder on NAILS or FEATHERS only — never in mouth, eyes, or on skin."),
        t("sitter.emergency.pb_bleeding_step4", "Keep warm and quiet."),
        t("sitter.emergency.pb_bleeding_step5", "A broken blood feather can bleed heavily — don't pull it yourself unless a vet instructs."),
        t("sitter.emergency.pb_bleeding_step6", "Call the vet if bleeding doesn't stop in 5–10 minutes or the bird seems weak."),
      ],
    },
    {
      title: t("sitter.emergency.pb_poison_title", "Suspected poisoning"),
      signs: t("sitter.emergency.pb_poison_signs", "Chewed metal, paint, plant, medication, household chemical, or toxic food."),
      steps: [
        t("sitter.emergency.pb_poison_step1", "Remove the bird from the substance and the substance from reach."),
        t("sitter.emergency.pb_poison_step2", "Do NOT make the bird vomit."),
        t("sitter.emergency.pb_poison_step3", "Save or photograph the packaging or material."),
        t("sitter.emergency.pb_poison_step4", "Note what was eaten or chewed and when."),
        t("sitter.emergency.pb_poison_step5", "Call the avian vet or ASPCA Animal Poison Control: (888) 426-4435."),
      ],
    },
    {
      title: t("sitter.emergency.pb_fumes_title", "Fumes or smoke"),
      signs: t("sitter.emergency.pb_fumes_signs", "Nonstick cookware overheated, smoke, aerosol, candle, essential oil, cleaner, burnt food."),
      steps: [
        t("sitter.emergency.pb_fumes_step1", "Move the bird to fresh air immediately if safe to do so."),
        t("sitter.emergency.pb_fumes_step2", "Turn off the source."),
        t("sitter.emergency.pb_fumes_step3", "Ventilate the home."),
        t("sitter.emergency.pb_fumes_step4", "Keep the bird calm and warm."),
        t("sitter.emergency.pb_fumes_step5", "Call the avian vet even if the bird looks okay."),
      ],
    },
    {
      title: t("sitter.emergency.pb_bite_title", "Cat or dog bite or scratch"),
      signs: t("sitter.emergency.pb_bite_signs", "Any contact between a cat/dog and the bird — even with no visible wound."),
      steps: [
        t("sitter.emergency.pb_bite_step1", "Treat as life-threatening — bacteria from cat/dog mouths and claws can kill a bird within hours."),
        t("sitter.emergency.pb_bite_step2", "Separate the animals."),
        t("sitter.emergency.pb_bite_step3", "Keep the bird warm and quiet."),
        t("sitter.emergency.pb_bite_step4", "Don't assume the bird is fine."),
        t("sitter.emergency.pb_bite_step5", "Call the avian vet immediately — antibiotics within hours are critical."),
      ],
    },
    {
      title: t("sitter.emergency.pb_seizure_title", "Seizure"),
      signs: t("sitter.emergency.pb_seizure_signs", "Uncontrolled movement, loss of balance, unresponsive episode."),
      steps: [
        t("sitter.emergency.pb_seizure_step1", "Don't restrain the bird."),
        t("sitter.emergency.pb_seizure_step2", "Clear nearby hazards from the cage floor."),
        t("sitter.emergency.pb_seizure_step3", "Dim the room and keep it quiet."),
        t("sitter.emergency.pb_seizure_step4", "Note how long the seizure lasts."),
        t("sitter.emergency.pb_seizure_step5", "Keep the bird warm afterward."),
        t("sitter.emergency.pb_seizure_step6", "Call the avian vet."),
      ],
    },
    {
      title: t("sitter.emergency.pb_overheating_title", "Overheating"),
      signs: t("sitter.emergency.pb_overheating_signs", "Open-mouth breathing, wings held away from body, panting, weakness."),
      steps: [
        t("sitter.emergency.pb_overheating_step1", "Move the bird to shade or a cooler room."),
        t("sitter.emergency.pb_overheating_step2", "Offer cool water."),
        t("sitter.emergency.pb_overheating_step3", "Lightly mist the FEET if tolerated."),
        t("sitter.emergency.pb_overheating_step4", "Don't use ice water."),
        t("sitter.emergency.pb_overheating_step5", "Call the vet if the bird doesn't recover quickly."),
      ],
    },
    {
      title: t("sitter.emergency.pb_eggbinding_title", "Egg binding (life-threatening)"),
      signs: t("sitter.emergency.pb_eggbinding_signs", "Straining, sitting low, wide stance, tail bobbing, weakness, not passing droppings, swollen lower belly."),
      steps: [
        t("sitter.emergency.pb_eggbinding_step1", "Keep warm and calm."),
        t("sitter.emergency.pb_eggbinding_step2", "Don't press on the abdomen."),
        t("sitter.emergency.pb_eggbinding_step3", "Don't try to pull an egg."),
        t("sitter.emergency.pb_eggbinding_step4", "Call the avian vet urgently."),
      ],
    },
    {
      title: t("sitter.emergency.pb_escaped_title", "Escaped outside"),
      signs: t("sitter.emergency.pb_escaped_signs", "Flighted parrot has flown out of an open door or window."),
      steps: [
        t("sitter.emergency.pb_escaped_step1", "Don't panic. Don't chase wildly."),
        t("sitter.emergency.pb_escaped_step2", "Don't take your eyes off the bird — note exactly where it lands."),
        t("sitter.emergency.pb_escaped_step3", "Call to the bird using familiar words and its name."),
        t("sitter.emergency.pb_escaped_step4", "Bring the cage outside if safe, with favorite food in view."),
        t("sitter.emergency.pb_escaped_step5", "Play recordings of the bird or familiar household sounds."),
        t("sitter.emergency.pb_escaped_step6", "Call the owner immediately."),
        t("sitter.emergency.pb_escaped_step7", "Search high (trees, roofs, poles) and wide. Birds often quiet at dusk and call at first light — keep looking."),
        t("sitter.emergency.pb_escaped_step8", "Post in local lost-pet and bird groups; contact nearby vets, shelters, animal control, and Parrot Alert."),
      ],
    },
    {
      title: t("sitter.emergency.pb_transport_title", "Transport to the vet"),
      signs: t("sitter.emergency.pb_transport_signs", "Any emergency requiring travel."),
      steps: [
        t("sitter.emergency.pb_transport_step1", "Use a small carrier or box lined with a towel — not loose bedding."),
        t("sitter.emergency.pb_transport_step2", "Warm to ~85–90°F using a wrapped warm water bottle or heat pack on ONE side only."),
        t("sitter.emergency.pb_transport_step3", "Cover the carrier to keep it dark and quiet."),
        t("sitter.emergency.pb_transport_step4", "Bring the owner's care sheet, any medications, photos of abnormal droppings, and anything the bird ate or chewed (with packaging)."),
        t("sitter.emergency.pb_transport_step5", "Secure in the car. Drive calmly. No blasting music or vents at the bird."),
        t("sitter.emergency.pb_transport_step6", "Call ahead so the vet is ready when you arrive."),
      ],
    },
  ];

  const birds = (ctx.birds ?? []) as any[];
  // One shared screen unless a bird has its own emergency details; then a
  // switcher picks whose vet and notes show (ctx reloads that bird's merged
  // contacts from ?birdId).
  const showSwitcher = birds.length > 1 && birds.some((b) => !!b.emergencyDifferent);
  const ruleName = birds.length > 1 && !showSwitcher ? null : (ctx.bird.name as string);
  const ownerName = ((ctx as any).ownerName ?? "") as string;
  const tiles = [
    { label: t("sitter.emergency.carrier", "Carrier"), value: c.carrier_location },
    { label: t("sitter.emergency.firstAidKit", "First-aid kit"), value: c.first_aid_kit_location },
    { label: t("sitter.emergency.spendingLimit", "Spending limit"), value: c.spending_limit },
  ].filter((x) => !!x.value?.trim());

  return (
    <div className="setup-frame min-h-screen" style={{ background: K.forest, color: "#fff" }}>
      <PageHeader
        title={t("sitter.emergency.pageTitle", "Emergency")}
        line={t("sitter.emergency.subtitle", "Take a breath. Here's exactly what to do.")}
        onBack={goBack}
      >
        {showSwitcher && (
          <div className="mt-5 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group" aria-label={t("sitter.emergency.whichBird", "Which bird")}>
            {birds.map((b) => {
              const active = b.id === ctx.activeBirdId;
              return (
                <button
                  key={b.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => navigate({ to: "/sitter/$token/emergency", params: { token }, search: { birdId: b.id }, replace: true })}
                  className="inline-flex h-12 shrink-0 items-center gap-2 rounded-full pl-[5px] pr-4 text-[15px] font-[700] active:scale-95"
                  style={active ? { background: K.lime, color: K.forest } : { background: K.forestDeep, color: "#fff" }}
                >
                  <span className="size-[38px] shrink-0 overflow-hidden rounded-full" style={{ background: active ? "#fff" : K.forest }}>
                    {b.photo_url && <img src={b.photo_url} alt="" className="size-full object-cover" style={{ objectPosition: b.photo_position || "center" }} />}
                  </span>
                  {b.name}
                </button>
              );
            })}
          </div>
        )}
      </PageHeader>

      <main className="mx-auto -mt-[30px] flex max-w-md flex-col gap-3 px-4 pb-32">
        {showSwitcher && birds.find((b) => b.id === ctx.activeBirdId)?.emergencyDifferent && (
          <p className="m-0 px-1 text-[13.5px] font-[700]" style={{ color: K.lime }}>
            {t("sitter.emergency.differentFor", "Different for {{name}}", { name: ctx.bird.name })}
          </p>
        )}

        <VetCallRow label={t("sitter.calls.avianVet", "Avian vet")} name={c.avian_vet_name} phone={c.avian_vet_phone} />
        <VetCallRow label={t("sitter.calls.emergencyVet", "After-hours emergency vet")} name={c.emergency_vet_name} phone={c.emergency_vet_phone} />
        <PersonCallRow label={t("sitter.calls.owner", "Owner")} name={ownerName && ownerName !== "the owner" ? ownerName : null} phone={c.owner_phone} />
        {c.backup_phone && <PersonCallRow label={t("sitter.calls.backup", "Backup contact")} name={c.backup_name} phone={c.backup_phone} />}
        <PersonCallRow
          label={t("sitter.emergency.poisonControl", "Poison control")}
          name={c.poison_control ? undefined : "ASPCA Animal Poison Control"}
          phone={c.poison_control || "8884264435"}
        />

        <section className="mt-3 rounded-[20px] p-5" style={{ background: K.forestDeep }}>
          <KyaHeading size={20} className="text-[#f2b33d]">{t("sitter.emergency.whileYouWait", "While you wait for the vet")}</KyaHeading>
          <ol className="m-0 mt-3 flex list-none flex-col gap-2.5 p-0">
            {rules(t, ruleName, pronFor((ctx.bird as any).sex)).map((r, i) => (
              <li key={i} className="flex gap-3 text-[15px] leading-[1.45] text-white">
                <span className="w-4 shrink-0 font-[700]" style={{ color: K.sunflower }}>{i + 1}.</span>
                <span className="min-w-0 flex-1">{r}</span>
              </li>
            ))}
          </ol>
          <p className="m-0 mt-3 text-[14.5px] font-[700] leading-[1.45]" style={{ color: K.teal }}>
            {t("sitter.emergency.callSoonNever", "You'll never be in trouble for calling too soon.")}
          </p>
        </section>

        <KyaHeading size={20} className="mt-4 px-1 text-white">{t("sitter.emergency.whatsHappening", "What's happening?")}</KyaHeading>
        <div className="flex flex-col gap-2">
          {playbooks.map((p) => (
            <details key={p.title} className="group rounded-[16px]" style={{ background: K.forestDeep }}>
              <summary className="flex min-h-[56px] cursor-pointer list-none items-center gap-3 px-4 py-3 text-[15px] font-[700] text-white [&::-webkit-details-marker]:hidden">
                <span className="min-w-0 flex-1">{p.title}</span>
                <ChevronRight className="size-[18px] shrink-0 transition-transform group-open:rotate-90" style={{ color: K.teal }} aria-hidden="true" />
              </summary>
              <div className="px-4 pb-4 text-[14.5px] leading-[1.5] text-white">
                {p.signs && (
                  <p className="m-0" style={{ color: K.paleGreen }}>
                    <span className="font-[700]">{t("sitter.emergency.signsLabel", "Signs")}:</span> {p.signs}
                  </p>
                )}
                <ol className="m-0 mt-2 flex list-decimal flex-col gap-1.5 pl-5">
                  {p.steps.map((s, i) => <li key={i}>{s}</li>)}
                </ol>
              </div>
            </details>
          ))}
        </div>

        {tiles.length > 0 && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            {tiles.map((x) => (
              <div key={x.label} className="rounded-[16px] p-4" style={{ background: K.forestDeep }}>
                <p className="m-0 text-[12.5px]" style={{ color: K.teal }}>{x.label}</p>
                <p className="m-0 mt-1 break-words text-[15px] font-[700] leading-[1.35] text-white">{x.value}</p>
              </div>
            ))}
          </div>
        )}

        <p className="m-0 pt-3 text-center text-[12px]" style={{ color: "rgba(255,255,255,0.5)" }}>
          {t("sitter.emergency.footer", "Care guidance from The Kya Project · Parrot Care Bible for Pet Sitters.")}
        </p>
      </main>
    </div>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useSitterContext } from "./route";
import { ArrowLeft, Phone, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/sitter/$token/emergency")({
  component: Emergency,
});

function Emergency() {
  const { t } = useTranslation();
  const { token } = Route.useParams();
  const { data: ctx } = useSitterContext(token);
  const c: Record<string, string | undefined> = (ctx.contacts ?? {}) as any;
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
  return (
    <div className="min-h-screen bg-[#1a3d2e] text-white">
      <header className="sticky top-0 border-b border-white/10 bg-[#1a3d2e]">
        <div className="mx-auto flex max-w-md items-center gap-3 px-5 py-3">
          <Link to="/sitter/$token" params={{ token }} className="rounded p-1 text-white/70"><ArrowLeft className="size-5" /></Link>
          <div>
            <h1 className="flex items-center gap-2 text-sm font-medium"><AlertTriangle className="size-4 text-warn-amber" /> {t("sitter.emergency.title", "Emergency mode")}</h1>
            <p className="mt-0.5 text-xs leading-relaxed text-white/70">{t("sitter.emergency.subtitle", "Take a breath. Here's exactly what to do.")}</p>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-md space-y-4 px-5 py-5 pb-28">
        <section className="rounded-2xl border border-warn-amber/40 bg-warn-amber/10 p-4">
          <p className="text-[11px] font-medium uppercase tracking-widest text-warn-amber">{t("sitter.emergency.rulesLabel", "The four emergency rules")}</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-white">
            <li>{t("sitter.emergency.rule1", "Stay calm.")}</li>
            <li>{t("sitter.emergency.rule2", "Keep {{name}} warm — about 85–90°F if sick or shocky. Heat on one side only.", { name: ctx.bird.name })}</li>
            <li>{t("sitter.emergency.rule3", "Keep the bird quiet, dim, and minimally handled.")}</li>
            <li>{t("sitter.emergency.rule4", "Call the avian vet and prepare to transport.")}</li>
          </ol>
          <p className="mt-2 text-xs text-white/70">{t("sitter.emergency.callSoon", "You will never be in trouble for calling too soon.")}</p>
        </section>

        <CallBtn label={t("sitter.emergency.callAvianVet", "Call avian vet")} name={c.avian_vet_name} phone={c.avian_vet_phone} urgent />
        <CallBtn label={t("sitter.emergency.callEmergencyVet", "Call emergency vet")} name={c.emergency_vet_name} phone={c.emergency_vet_phone} urgent />
        <CallBtn label={t("sitter.emergency.callOwner", "Call owner")} phone={c.owner_phone} />
        <CallBtn label={t("sitter.emergency.callBackup", "Call backup contact")} name={c.backup_name} phone={c.backup_phone} />
        <CallBtn label={t("sitter.emergency.poisonControl", "Poison control")} name={c.poison_control ? undefined : "ASPCA Animal Poison Control"} phone={c.poison_control || "8884264435"} />

        <section className="rounded-2xl bg-white/5 p-4">
          <p className="text-[11px] font-medium uppercase tracking-widest text-white/60">{t("sitter.emergency.criticalInfo", "Critical info")}</p>
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <Info label={t("sitter.emergency.carrier", "Carrier")} value={c.carrier_location} />
            <Info label={t("sitter.emergency.firstAidKit", "First-aid kit")} value={c.first_aid_kit_location} />
            <Info label={t("sitter.emergency.spendingLimit", "Spending limit")} value={c.spending_limit} />
          </div>
        </section>

        <section className="space-y-3">
          <p className="text-[11px] font-medium uppercase tracking-widest text-white/60">{t("sitter.emergency.quickPlaybooks", "Quick playbooks")}</p>
          {playbooks.map((p) => (
            <details key={p.title} className="rounded-2xl bg-white/5 p-4">
              <summary className="cursor-pointer text-sm font-medium">{p.title}</summary>
              {p.signs && (
                <p className="mt-2 text-xs italic text-white/60"><span className="font-medium not-italic uppercase tracking-widest">{t("sitter.emergency.signs", "Signs:")}</span> {p.signs}</p>
              )}
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-white/80">
                {p.steps.map((s, i) => <li key={i}>{s}</li>)}
              </ol>
            </details>
          ))}
        </section>

        <p className="pt-2 text-center text-[11px] text-white/40">
          {t("sitter.emergency.footer", "Care guidance from The Kya Project · Parrot Care Bible for Pet Sitters.")}
        </p>
      </main>
    </div>
  );
}

function formatPhone(raw?: string): string {
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  // Unknown shape: return original trimmed so it stays human-readable.
  return raw.trim();
}

function telHref(raw?: string): string {
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  return digits ? `tel:${digits}` : `tel:${raw.trim()}`;
}

function CallBtn({ label, name, phone, urgent }: { label: string; name?: string; phone?: string; urgent?: boolean }) {
  const { t } = useTranslation();
  if (!phone) return (
    <div className="rounded-2xl bg-white/5 p-4 text-sm text-white/50">{label}: {t("sitter.emergency.notProvided", "not provided by owner.")}</div>
  );
  const display = formatPhone(phone);
  return (
    <a href={telHref(phone)} className={`flex items-center justify-between rounded-2xl p-4 ${urgent ? "bg-warn-red" : "bg-white"} ${urgent ? "text-white" : "text-[#1a3d2e]"} active:scale-[0.99]`}>
      <div>
        <p className="text-[10px] font-medium uppercase tracking-widest opacity-70">{label}</p>
        {name && <p className="text-xs opacity-80">{name}</p>}
        <p className="text-lg font-medium">{display}</p>
      </div>
      <Phone className="size-5" />
    </a>
  );
}

function Info({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <p className="text-[10px] font-medium uppercase text-white/40">{label}</p>
      <p className="text-sm text-white">{value || "—"}</p>
    </div>
  );
}

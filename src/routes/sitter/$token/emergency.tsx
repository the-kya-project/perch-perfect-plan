import { createFileRoute, Link } from "@tanstack/react-router";
import { useSitterContext } from "./route";
import { ArrowLeft, Phone, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/sitter/$token/emergency")({
  component: Emergency,
});

function Emergency() {
  const { token } = Route.useParams();
  const { data: ctx } = useSitterContext(token);
  const c: Record<string, string | undefined> = (ctx.contacts ?? {}) as any;
  const playbooks = [
    {
      title: "Trouble breathing / open-mouth",
      signs: "Open-mouth breathing, tail bobbing at rest, wheezing or clicking, wings held away, weakness.",
      steps: [
        "Stop handling — birds need chest movement to breathe.",
        "Move the bird away from fumes, smoke, heat, and stress to fresh air.",
        "Keep warm (~85–90°F if shocky, heat on ONE side only), quiet, and dim.",
        "Don't mist, bathe, or force water.",
        "Call the avian vet and prepare to transport.",
      ],
    },
    {
      title: "Bleeding",
      signs: "Active blood from a nail, feather, skin, or beak.",
      steps: [
        "Stay calm.",
        "Apply gentle, steady pressure with clean gauze.",
        "Use cornstarch or styptic powder on NAILS or FEATHERS only — never in mouth, eyes, or on skin.",
        "Keep warm and quiet.",
        "A broken blood feather can bleed heavily — don't pull it yourself unless a vet instructs.",
        "Call the vet if bleeding doesn't stop in 5–10 minutes or the bird seems weak.",
      ],
    },
    {
      title: "Suspected poisoning",
      signs: "Chewed metal, paint, plant, medication, household chemical, or toxic food.",
      steps: [
        "Remove the bird from the substance and the substance from reach.",
        "Do NOT make the bird vomit.",
        "Save or photograph the packaging or material.",
        "Note what was eaten or chewed and when.",
        "Call the avian vet or ASPCA Animal Poison Control: (888) 426-4435.",
      ],
    },
    {
      title: "Fumes or smoke",
      signs: "Nonstick cookware overheated, smoke, aerosol, candle, essential oil, cleaner, burnt food.",
      steps: [
        "Move the bird to fresh air immediately if safe to do so.",
        "Turn off the source.",
        "Ventilate the home.",
        "Keep the bird calm and warm.",
        "Call the avian vet even if the bird looks okay.",
      ],
    },
    {
      title: "Cat or dog bite or scratch",
      signs: "Any contact between a cat/dog and the bird — even with no visible wound.",
      steps: [
        "Treat as life-threatening — bacteria from cat/dog mouths and claws can kill a bird within hours.",
        "Separate the animals.",
        "Keep the bird warm and quiet.",
        "Don't assume the bird is fine.",
        "Call the avian vet immediately — antibiotics within hours are critical.",
      ],
    },
    {
      title: "Seizure",
      signs: "Uncontrolled movement, loss of balance, unresponsive episode.",
      steps: [
        "Don't restrain the bird.",
        "Clear nearby hazards from the cage floor.",
        "Dim the room and keep it quiet.",
        "Note how long the seizure lasts.",
        "Keep the bird warm afterward.",
        "Call the avian vet.",
      ],
    },
    {
      title: "Overheating",
      signs: "Open-mouth breathing, wings held away from body, panting, weakness.",
      steps: [
        "Move the bird to shade or a cooler room.",
        "Offer cool water.",
        "Lightly mist the FEET if tolerated.",
        "Don't use ice water.",
        "Call the vet if the bird doesn't recover quickly.",
      ],
    },
    {
      title: "Egg binding (life-threatening)",
      signs: "Straining, sitting low, wide stance, tail bobbing, weakness, not passing droppings, swollen lower belly.",
      steps: [
        "Keep warm and calm.",
        "Don't press on the abdomen.",
        "Don't try to pull an egg.",
        "Call the avian vet urgently.",
      ],
    },
    {
      title: "Escaped outside",
      signs: "Flighted parrot has flown out of an open door or window.",
      steps: [
        "Don't panic. Don't chase wildly.",
        "Don't take your eyes off the bird — note exactly where it lands.",
        "Call to the bird using familiar words and its name.",
        "Bring the cage outside if safe, with favorite food in view.",
        "Play recordings of the bird or familiar household sounds.",
        "Call the owner immediately.",
        "Search high (trees, roofs, poles) and wide. Birds often quiet at dusk and call at first light — keep looking.",
        "Post in local lost-pet and bird groups; contact nearby vets, shelters, animal control, and Parrot Alert.",
      ],
    },
    {
      title: "Transport to the vet",
      signs: "Any emergency requiring travel.",
      steps: [
        "Use a small carrier or box lined with a towel — not loose bedding.",
        "Warm to ~85–90°F using a wrapped warm water bottle or heat pack on ONE side only.",
        "Cover the carrier to keep it dark and quiet.",
        "Bring the owner's care sheet, any medications, photos of abnormal droppings, and anything the bird ate or chewed (with packaging).",
        "Secure in the car. Drive calmly. No blasting music or vents at the bird.",
        "Call ahead so the vet is ready when you arrive.",
      ],
    },
  ];
  return (
    <div className="min-h-screen bg-[#1a3d2e] text-white">
      <header className="sticky top-0 border-b border-white/10 bg-[#1a3d2e]">
        <div className="mx-auto flex max-w-md items-center gap-3 px-5 py-3">
          <Link to="/sitter/$token" params={{ token }} className="rounded p-1 text-white/70"><ArrowLeft className="size-5" /></Link>
          <div>
            <h1 className="flex items-center gap-2 text-sm font-medium"><AlertTriangle className="size-4 text-warn-amber" /> Emergency mode</h1>
            <p className="mt-0.5 text-xs leading-relaxed text-white/70">Take a breath. Here's exactly what to do.</p>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-md space-y-4 px-5 py-5 pb-28">
        <section className="rounded-2xl border border-warn-amber/40 bg-warn-amber/10 p-4">
          <p className="text-[11px] font-medium uppercase tracking-widest text-warn-amber">The four emergency rules</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-white">
            <li>Stay calm.</li>
            <li>Keep {ctx.bird.name} warm — about 85–90°F if sick or shocky. Heat on one side only.</li>
            <li>Keep the bird quiet, dim, and minimally handled.</li>
            <li>Call the avian vet and prepare to transport.</li>
          </ol>
          <p className="mt-2 text-xs text-white/70">You will never be in trouble for calling too soon.</p>
        </section>

        <CallBtn label="Call avian vet" name={c.avian_vet_name} phone={c.avian_vet_phone} urgent />
        <CallBtn label="Call emergency vet" name={c.emergency_vet_name} phone={c.emergency_vet_phone} urgent />
        <CallBtn label="Call owner" phone={c.owner_phone} />
        <CallBtn label="Call backup contact" name={c.backup_name} phone={c.backup_phone} />
        <CallBtn label="Poison control" name={c.poison_control ? undefined : "ASPCA Animal Poison Control"} phone={c.poison_control || "8884264435"} />

        <section className="rounded-2xl bg-white/5 p-4">
          <p className="text-[11px] font-medium uppercase tracking-widest text-white/60">Critical info</p>
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <Info label="Carrier" value={c.carrier_location} />
            <Info label="First-aid kit" value={c.first_aid_kit_location} />
            <Info label="Spending limit" value={c.spending_limit} />
          </div>
        </section>

        <section className="space-y-3">
          <p className="text-[11px] font-medium uppercase tracking-widest text-white/60">Quick playbooks</p>
          {playbooks.map((p) => (
            <details key={p.title} className="rounded-2xl bg-white/5 p-4">
              <summary className="cursor-pointer text-sm font-medium">{p.title}</summary>
              {p.signs && (
                <p className="mt-2 text-xs italic text-white/60"><span className="font-medium not-italic uppercase tracking-widest">Signs:</span> {p.signs}</p>
              )}
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-white/80">
                {p.steps.map((s, i) => <li key={i}>{s}</li>)}
              </ol>
            </details>
          ))}
        </section>

        <p className="pt-2 text-center text-[11px] text-white/40">
          Care guidance from The Kya Project · Parrot Care Bible for Pet Sitters.
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
  if (!phone) return (
    <div className="rounded-2xl bg-white/5 p-4 text-sm text-white/50">{label}: not provided by owner.</div>
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

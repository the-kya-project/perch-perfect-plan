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
    { title: "Trouble breathing / open-mouth", steps: ["Keep the bird perched and still — do not handle.", "Move to fresh air. No fans or AC pulling from the same room.", "Call the avian vet now."] },
    { title: "Bleeding that won't stop", steps: ["Apply gentle pressure with clean gauze.", "If a broken blood feather, contain the bird and go to the vet now."] },
    { title: "Suspected poisoning / fume exposure", steps: ["Move bird to fresh air immediately.", "Bag any suspected substance.", "Call avian vet and poison control."] },
    { title: "Cat or dog bite/scratch", steps: ["Treat as life-threatening even if no visible wound.", "Carrier, warm, quiet, vet now — antibiotics within hours are critical."] },
    { title: "Seizure", steps: ["Do not handle during the seizure. Time it.", "Cushion the bottom of the cage. Vet now."] },
    { title: "Escaped outside", steps: ["Stay calm; do not chase.", "Place the cage outside with familiar food and call the bird's name.", "Notify the owner immediately."] },
  ];
  return (
    <div className="min-h-screen bg-sage-900 text-white">
      <header className="sticky top-0 border-b border-white/10 bg-sage-900">
        <div className="mx-auto flex max-w-md items-center gap-3 px-4 py-3">
          <Link to="/sitter/$token" params={{ token }} className="rounded p-1 text-white/70"><ArrowLeft className="size-5" /></Link>
          <h1 className="flex items-center gap-2 text-sm font-bold"><AlertTriangle className="size-4 text-warn-amber" /> Emergency mode</h1>
        </div>
      </header>
      <main className="mx-auto max-w-md space-y-4 px-4 py-5 pb-28">
        <p className="text-sm leading-relaxed text-white/80">
          Call the appropriate number now. Keep {ctx.bird.name} warm, quiet, and minimize handling.
        </p>

        <CallBtn label="Call avian vet" name={c.avian_vet_name} phone={c.avian_vet_phone} urgent />
        <CallBtn label="Call emergency vet" name={c.emergency_vet_name} phone={c.emergency_vet_phone} urgent />
        <CallBtn label="Call owner" phone={c.owner_phone} />
        <CallBtn label="Call backup contact" name={c.backup_name} phone={c.backup_phone} />
        <CallBtn label="Poison control" phone={c.poison_control} />

        <section className="rounded-xl bg-white/5 p-4">
          <p className="text-[11px] font-bold uppercase tracking-widest text-white/60">Critical info</p>
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <Info label="Carrier" value={c.carrier_location} />
            <Info label="First-aid kit" value={c.first_aid_kit_location} />
            <Info label="Care authorization" value={c.emergency_authorization} />
            <Info label="Spending limit" value={c.spending_limit} />
          </div>
        </section>

        <section className="space-y-3">
          <p className="text-[11px] font-bold uppercase tracking-widest text-white/60">Quick playbooks</p>
          {playbooks.map((p) => (
            <details key={p.title} className="rounded-xl bg-white/5 p-4">
              <summary className="cursor-pointer text-sm font-semibold">{p.title}</summary>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-white/80">
                {p.steps.map((s, i) => <li key={i}>{s}</li>)}
              </ol>
            </details>
          ))}
        </section>
      </main>
    </div>
  );
}

function CallBtn({ label, name, phone, urgent }: { label: string; name?: string; phone?: string; urgent?: boolean }) {
  if (!phone) return (
    <div className="rounded-2xl bg-white/5 p-4 text-sm text-white/50">{label}: not provided by owner.</div>
  );
  return (
    <a href={`tel:${phone}`} className={`flex items-center justify-between rounded-2xl p-4 ${urgent ? "bg-warn-red" : "bg-white"} ${urgent ? "text-white" : "text-sage-900"} active:scale-[0.99]`}>
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest opacity-70">{label}</p>
        {name && <p className="text-xs opacity-80">{name}</p>}
        <p className="text-lg font-bold">{phone}</p>
      </div>
      <Phone className="size-5" />
    </a>
  );
}

function Info({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase text-white/40">{label}</p>
      <p className="text-sm text-white">{value || "—"}</p>
    </div>
  );
}

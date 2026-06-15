import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getGuideCards } from "@/lib/sitter.functions";
import { ArrowLeft, Search } from "lucide-react";
import { VetReviewBanner } from "@/components/Disclaimer";

export const Route = createFileRoute("/sitter/$token/guide")({
  component: Guide,
});

function Guide() {
  const { token } = Route.useParams();
  const fn = useServerFn(getGuideCards);
  const { data: cards } = useSuspenseQuery({ queryKey: ["guide-cards"], queryFn: () => fn() });
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const filtered = cards.filter((c: any) => {
    const hay = `${c.title} ${c.category} ${c.search_keywords ?? ""} ${c.quick_answer ?? ""}`.toLowerCase();
    return hay.includes(q.toLowerCase());
  });
  const grouped: Record<string, any[]> = {};
  for (const c of filtered) (grouped[c.category] ??= []).push(c);

  const active = cards.find((c: any) => c.id === open);

  if (active) {
    const level = active.emergency_level as string;
    const color = level === "red" ? "bg-warn-red text-white" : level === "yellow" ? "bg-warn-amber/15 text-warn-amber" : "bg-sage-100 text-sage-700";
    return (
      <>
        <header className="sticky top-0 z-10 border-b border-sage-100 bg-white">
          <div className="mx-auto flex max-w-md items-center gap-3 px-4 py-3">
            <button onClick={() => setOpen(null)} className="rounded p-1 text-sage-600"><ArrowLeft className="size-5" /></button>
            <h1 className="text-sm font-bold truncate">{active.title}</h1>
          </div>
        </header>
        <main className="mx-auto max-w-md space-y-4 px-4 py-5">
          <span className={`inline-block rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest ${color}`}>{level}</span>
          {active.quick_answer && (
            <section className="rounded-xl bg-white p-4 ring-1 ring-sage-100"><p className="text-[11px] font-bold uppercase tracking-widest text-sage-600">Quick answer</p><p className="mt-2 text-sm">{active.quick_answer}</p></section>
          )}
          {active.what_to_check && (
            <section className="rounded-xl bg-white p-4 ring-1 ring-sage-100"><p className="text-[11px] font-bold uppercase tracking-widest text-sage-600">What to check</p><p className="mt-2 text-sm">{active.what_to_check}</p></section>
          )}
          {active.what_to_do && (
            <section className="rounded-xl bg-white p-4 ring-1 ring-sage-100"><p className="text-[11px] font-bold uppercase tracking-widest text-sage-600">What to do</p><p className="mt-2 text-sm">{active.what_to_do}</p></section>
          )}
          {active.when_to_call_vet && (
            <section className="rounded-xl bg-warn-red/5 p-4 ring-1 ring-warn-red/20"><p className="text-[11px] font-bold uppercase tracking-widest text-warn-red">When to call the vet</p><p className="mt-2 text-sm">{active.when_to_call_vet}</p></section>
          )}
          {!active.reviewed_at && <VetReviewBanner />}
          <Link to="/sitter/$token/emergency" params={{ token }} className="block rounded-xl bg-sage-900 py-3 text-center text-sm font-semibold text-white">Open emergency contacts</Link>
        </main>
      </>
    );
  }

  return (
    <>
      <header className="sticky top-0 z-10 border-b border-sage-100 bg-white">
        <div className="mx-auto flex max-w-md items-center gap-3 px-4 py-3">
          <Link to="/sitter/$token" params={{ token }} className="rounded p-1 text-sage-600"><ArrowLeft className="size-5" /></Link>
          <h1 className="text-sm font-bold">Care guide</h1>
        </div>
      </header>
      <main className="mx-auto max-w-md space-y-4 px-4 py-5">
        <VetReviewBanner />
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-sage-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search: droppings, fumes, biting, sleep…" className="w-full rounded-xl border border-sage-100 bg-white py-3 pl-9 pr-3 text-sm shadow-sm" />
        </div>
        {Object.entries(grouped).map(([cat, list]) => (
          <section key={cat} className="space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-sage-600">{cat.replace(/-/g, " ")}</p>
            {list.map((c: any) => (
              <button key={c.id} onClick={() => setOpen(c.id)} className="flex w-full items-start justify-between gap-2 rounded-xl bg-white p-3 text-left ring-1 ring-sage-100 active:scale-[0.99]">
                <div className="flex-1">
                  <p className="text-sm font-semibold">{c.title}</p>
                  {c.quick_answer && <p className="mt-0.5 line-clamp-2 text-xs text-sage-600">{c.quick_answer}</p>}
                </div>
                <span className={`shrink-0 size-2 rounded-full ${c.emergency_level === "red" ? "bg-warn-red" : c.emergency_level === "yellow" ? "bg-warn-amber" : "bg-sage-300"}`} />
              </button>
            ))}
          </section>
        ))}
        {filtered.length === 0 && <p className="text-sm text-sage-600">No cards match "{q}".</p>}
      </main>
    </>
  );
}

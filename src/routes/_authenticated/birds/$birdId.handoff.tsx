import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getLocalUser } from "@/integrations/supabase/currentUser";
import { createHandoff } from "@/lib/handoff.functions";
import { track } from "@/lib/analytics";
import { toast } from "sonner";
import { ArrowLeft, ArrowRightLeft, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/birds/$birdId/handoff")({
  head: () => ({ meta: [{ title: "Hand off — Kya & Co." }] }),
  component: HandoffFlow,
});

function HandoffFlow() {
  const { birdId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [recipientName, setRecipientName] = useState("");

  const { data: bird } = useQuery({
    queryKey: ["handoff-bird", birdId],
    queryFn: async () => {
      const { data: u } = await getLocalUser();
      const { data } = await supabase.from("birds").select("id, name, owner_id").eq("id", birdId).maybeSingle();
      return { row: data as { id: string; name: string; owner_id: string } | null, uid: u.user?.id ?? null };
    },
  });
  const name = bird?.row?.name ?? "this bird";
  const notOwner = bird?.row && bird.uid && bird.row.owner_id !== bird.uid;

  const create = useServerFn(createHandoff);
  const m = useMutation({
    mutationFn: () => create({ data: { birdId, recipientEmail: email.trim(), recipientName: recipientName.trim() || undefined } }),
    onSuccess: () => {
      toast.success("Handoff sent.");
      track("bird_handoff_initiated", { has_recipient_name: !!recipientName.trim() });
      qc.invalidateQueries({ queryKey: ["pending-handoff", birdId] });
      navigate({ to: "/birds/$birdId", params: { birdId } });
    },
    onError: (e: any) => toast.error(e?.message ?? "Couldn't send the handoff."),
  });

  const emailOk = /\S+@\S+\.\S+/.test(email.trim());

  if (notOwner) {
    navigate({ to: "/birds/$birdId", params: { birdId }, replace: true });
    return null;
  }

  return (
    <div className="min-h-screen bg-[#f4f1e8] pb-[calc(var(--nav-spacer)+6rem)]">
      <header className="sticky top-0 z-10 border-b border-[#e3ded0] bg-[#f4f1e8]/95 backdrop-blur">
        <div className="mx-auto flex max-w-md items-center gap-3 px-5 pt-safe pb-3">
          <Link to="/birds/$birdId" params={{ birdId }} aria-label="Back" className="-ml-1 rounded p-1 text-[#1a3d2e]"><ArrowLeft className="size-5" /></Link>
          <h1 className="truncate text-base font-medium text-[#1a3d2e]">Hand off {name}</h1>
        </div>
      </header>

      <main className="mx-auto max-w-md space-y-4 px-5 py-5">
        <p className="text-sm leading-relaxed text-[#5f5e5a]">
          Pass {name}'s record to the adopter so they have everything you've learned. The record goes with the bird; once accepted, you won't have access anymore.
        </p>

        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[#5f5e5a]">Adopter's email</span>
          <input className="input" type="email" inputMode="email" autoCapitalize="off" autoCorrect="off" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="adopter@example.com" />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[#5f5e5a]">Adopter's name (optional)</span>
          <input className="input" value={recipientName} maxLength={120} onChange={(e) => setRecipientName(e.target.value)} placeholder="e.g. Sam" />
        </label>

        <div className="rounded-[14px] bg-white p-4 ring-1 ring-[#e3dcc9]">
          <p className="text-[10px] font-bold uppercase tracking-widest text-[#5f5e5a]">What goes with {name}</p>
          <ul className="mt-2 space-y-1 text-xs text-[#5f5e5a]">
            <li>Care plan, identity, weight history, journal, moments</li>
            <li>The photos in those records</li>
          </ul>
        </div>
        <div className="rounded-[14px] bg-white p-4 ring-1 ring-[#e3dcc9]">
          <p className="text-[10px] font-bold uppercase tracking-widest text-[#5f5e5a]">What stays with you</p>
          <ul className="mt-2 space-y-1 text-xs text-[#5f5e5a]">
            <li>Your contact info — it doesn't transfer</li>
            <li>A memory entry in Past birds (name, dates, where they went)</li>
          </ul>
        </div>

        <div className="rounded-[14px] p-4" style={{ background: "#FCEBEB", border: "1px solid #E24B4A" }}>
          <p className="flex items-start gap-2 text-sm" style={{ color: "#791F1F" }}>
            <AlertTriangle className="mt-0.5 size-4 shrink-0" style={{ color: "#A32D2D" }} />
            <span><span className="font-medium">This can't be undone.</span> Once they accept, the record is theirs. You won't be able to view or edit it.</span>
          </p>
        </div>
      </main>

      <footer className="fixed inset-x-0 bottom-[var(--nav-spacer)] border-t border-[#e3ded0] bg-[#f4f1e8] px-5 py-3">
        <div className="mx-auto max-w-md space-y-2">
          <button type="button" disabled={!emailOk || m.isPending} onClick={() => m.mutate()} className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-[14px] bg-[#1a3d2e] text-sm font-medium text-white disabled:opacity-50">
            <ArrowRightLeft className="size-4" /> {m.isPending ? "Sending…" : "Send handoff"}
          </button>
          <button type="button" onClick={() => navigate({ to: "/birds/$birdId/export", params: { birdId } })} className="block w-full py-1 text-center text-xs font-medium text-[#5f5e5a] underline">
            They're not on the app — export as PDF instead
          </button>
        </div>
      </footer>

      <style>{`.input{width:100%;border-radius:.75rem;background:white;border:1px solid var(--sage-200);padding:.65rem .8rem;font-size:16px;outline:none}`}</style>
    </div>
  );
}

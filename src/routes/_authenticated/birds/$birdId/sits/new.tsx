import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/birds/$birdId/sits/new")({
  head: () => ({ meta: [{ title: "Create a sit — Parrot Care Companion" }] }),
  component: NewSit,
});

function NewSit() {
  const { birdId } = Route.useParams();
  const navigate = useNavigate();
  const [sitterName, setSitterName] = useState("");
  const [sitterEmail, setSitterEmail] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!start || !end) { toast.error("Pick a start and end date."); return; }
    if (end < start) { toast.error("End date must be on or after start date."); return; }
    setLoading(true);
    try {
      const { data: u, error: uerr } = await supabase.auth.getUser();
      if (uerr || !u.user) { toast.error("You're signed out. Please sign in again."); setLoading(false); return; }
      const expires = new Date(end + "T23:59:59Z").toISOString();
      const { error } = await supabase.from("sits").insert({
        bird_id: birdId, owner_id: u.user.id,
        sitter_name: sitterName || null, sitter_email: sitterEmail || null,
        start_date: start, end_date: end, notes: notes || null,
        token_expires_at: expires, status: "upcoming",
      });
      if (error) { toast.error(error.message); setLoading(false); return; }
      toast.success("Sit created. Share the link from the Sits tab.");
      navigate({ to: "/birds/$birdId", params: { birdId } });
    } catch (err: any) {
      toast.error(err?.message ?? "Could not create sit.");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-sage-50">
      <header className="border-b border-sage-100 bg-white">
        <div className="mx-auto flex max-w-md items-center gap-3 px-4 py-3">
          <Link to="/birds/$birdId" params={{ birdId }} className="rounded p-1 text-sage-600"><ArrowLeft className="size-5" /></Link>
          <h1 className="text-sm font-bold">Create a sit</h1>
        </div>
      </header>
      <form onSubmit={submit} className="mx-auto max-w-md space-y-4 px-4 py-6">
        <p className="text-sm text-sage-600">We'll generate a secure invite link that expires at the end of the sit. You can revoke it any time.</p>
        <Field label="Sitter name"><input className="input" value={sitterName} onChange={(e) => setSitterName(e.target.value)} /></Field>
        <Field label="Sitter email"><input className="input" type="email" value={sitterEmail} onChange={(e) => setSitterEmail(e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Start"><input className="input" type="date" required value={start} onChange={(e) => setStart(e.target.value)} /></Field>
          <Field label="End"><input className="input" type="date" required value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
        </div>
        <Field label="Notes for this sit"><textarea className="input area" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        <button disabled={loading} className="w-full rounded-xl bg-sage-600 py-3 text-sm font-semibold text-white disabled:opacity-50">{loading ? "Creating..." : "Create sit & generate link"}</button>
      </form>
      <style>{`.input{width:100%;border-radius:.75rem;background:white;border:1px solid var(--sage-200);padding:.65rem .8rem;font-size:16px;outline:none}.input:focus{border-color:var(--sage-600);box-shadow:0 0 0 3px rgb(74 103 65 / .15)}.area{min-height:80px}`}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-sage-600">{label}</span>{children}</label>;
}

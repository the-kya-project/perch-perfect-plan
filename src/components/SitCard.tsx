import { supabase } from "@/integrations/supabase/client";
import { Calendar, Link2, Copy } from "lucide-react";
import { toast } from "sonner";

type Bird = { id: string; name: string };

export function SitCard({ sit, birds = [], onChange }: { sit: any; birds?: Bird[]; onChange: () => void }) {
  const expired = new Date(sit.token_expires_at) < new Date();
  const upcoming = new Date(sit.start_date) > new Date(new Date().toDateString());
  const status = sit.revoked ? "Revoked" : expired ? "Expired" : upcoming ? "Upcoming" : "Active";
  const tone = sit.revoked || expired ? "bg-sage-100 text-sage-600" : upcoming ? "bg-warn-amber/10 text-warn-amber" : "bg-warn-green/10 text-warn-green";
  const url = typeof window !== "undefined" ? `${window.location.origin}/sitter/${sit.invite_token}` : "";

  async function revoke() {
    if (!confirm("Revoke this invite link? The sitter will lose access.")) return;
    await supabase.from("sits").update({ revoked: true }).eq("id", sit.id);
    toast.success("Link revoked.");
    onChange();
  }
  async function remove() {
    if (!confirm("Delete this sit? This removes all sitter logs for it.")) return;
    await supabase.from("sits").delete().eq("id", sit.id);
    toast.success("Sit deleted.");
    onChange();
  }
  async function copy() {
    const birdIds = birds.map((b) => b.id);
    if (birdIds.length) {
      const { data: contacts } = await supabase
        .from("emergency_contacts")
        .select("bird_id, owner_phone, avian_vet_phone")
        .in("bird_id", birdIds);
      const byBird = new Map((contacts ?? []).map((c: any) => [c.bird_id, c]));
      const missing = birds
        .map((b) => {
          const c = byBird.get(b.id);
          const needs: string[] = [];
          if (!c?.owner_phone?.trim()) needs.push("your phone");
          if (!c?.avian_vet_phone?.trim()) needs.push("avian vet phone");
          return needs.length ? `${b.name}: ${needs.join(" & ")}` : null;
        })
        .filter(Boolean);
      if (missing.length) {
        toast.error(
          `Add the required emergency contacts before sharing — ${missing.join("; ")}. Open the bird's profile → Emergency contacts.`,
          { duration: 8000 },
        );
        return;
      }
    }
    await navigator.clipboard.writeText(url);
    toast.success("Link copied.");
  }

  return (
    <div className="rounded-2xl bg-white p-4 ring-1 ring-sage-100">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Calendar className="size-4 text-sage-600" />
          {sit.start_date} → {sit.end_date}
        </div>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${tone}`}>{status}</span>
      </div>
      <p className="mt-1 text-xs text-sage-600">
        Sitter: {sit.sitter_name ?? "—"} {sit.sitter_email && `(${sit.sitter_email})`}
      </p>
      {birds.length > 0 && (
        <p className="mt-1 text-xs text-sage-700">
          Birds: <span className="font-semibold">{birds.map((b) => b.name).join(", ")}</span>
        </p>
      )}
      {!sit.revoked && !expired && (
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-sage-50 p-2">
          <Link2 className="size-3.5 text-sage-600" />
          <span className="flex-1 truncate text-[11px] text-sage-700">{url}</span>
          <button onClick={copy} className="rounded p-1 text-sage-600" aria-label="Copy link"><Copy className="size-3.5" /></button>
        </div>
      )}
      <div className="mt-3 flex gap-3 text-xs font-semibold">
        {!sit.revoked && !expired && (
          <button onClick={revoke} className="text-warn-red underline">Revoke link</button>
        )}
        <button onClick={remove} className="ml-auto text-sage-600 underline">Delete</button>
      </div>
    </div>
  );
}

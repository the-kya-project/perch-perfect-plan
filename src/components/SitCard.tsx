import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getLocalUser } from "@/integrations/supabase/currentUser";
import { Calendar, Link2, Copy } from "lucide-react";
import { toast } from "sonner";
import { SitChecklist } from "@/components/SitChecklist";
import { SitForm } from "@/components/SitForm";

type Bird = { id: string; name: string };

export function SitCard({ sit, birds = [], allBirds, onChange }: { sit: any; birds?: Bird[]; allBirds?: any[]; onChange: () => void }) {
  const [editing, setEditing] = useState(false);
  const expired = new Date(sit.token_expires_at) < new Date();
  const upcoming = new Date(sit.start_date) > new Date(new Date().toDateString());
  const status = sit.revoked ? "Revoked" : expired ? "Expired" : upcoming ? "Upcoming" : "Active";
  const tone = sit.revoked || expired ? "bg-[#e8e1d0] text-[#5f5e5a]" : upcoming ? "bg-[#f4e4c4] text-[#84600f]" : "bg-[#d6e8dc] text-[#1a5e3f]";
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
      const [{ data: contacts }, { data: u }] = await Promise.all([
        supabase
          .from("emergency_contacts")
          .select("bird_id, owner_phone, avian_vet_phone")
          .in("bird_id", birdIds),
        getLocalUser(),
      ]);
      const { data: defaults } = u.user
        ? await supabase
            .from("owner_emergency_defaults")
            .select("owner_phone, avian_vet_phone")
            .eq("owner_id", u.user.id)
            .maybeSingle()
        : { data: null };
      const byBird = new Map((contacts ?? []).map((c: any) => [c.bird_id, c]));
      const eff = (c: any, k: string) =>
        (c?.[k]?.trim?.() || (defaults as any)?.[k]?.trim?.() || "");
      const missing = birds
        .map((b) => {
          const c = byBird.get(b.id);
          const needs: string[] = [];
          if (!eff(c, "owner_phone")) needs.push("your phone");
          if (!eff(c, "avian_vet_phone")) needs.push("avian vet phone");
          return needs.length ? `${b.name}: ${needs.join(" & ")}` : null;
        })
        .filter(Boolean);
      if (missing.length) {
        toast.error(
          `Add the required emergency contacts before sharing — ${missing.join("; ")}. Set account defaults on the dashboard or fill the bird's Emergency tab.`,
          { duration: 8000 },
        );
        return;
      }
    }
    await navigator.clipboard.writeText(url);
    toast.success("Link copied.");
  }

  if (editing && allBirds) {
    return (
      <SitForm
        birds={allBirds}
        editSit={sit}
        onSaved={onChange}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <div className="rounded-[20px] bg-[#efe9da] p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Calendar className="size-4 text-[#5f5e5a]" />
          {sit.start_date} → {sit.end_date}
        </div>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${tone}`}>{status}</span>
      </div>
      <p className="mt-1 text-xs text-[#5f5e5a]">
        Sitter: {sit.sitter_name?.trim() || "Not named yet"}{sit.sitter_email && ` (${sit.sitter_email})`}
      </p>
      {birds.length > 0 && (
        <p className="mt-1 text-xs text-sage-700">
          Birds: <span className="font-medium">{birds.map((b) => b.name).join(", ")}</span>
        </p>
      )}
      {!sit.revoked && !expired && (
        <div className="mt-3 flex items-center gap-2 rounded-[12px] bg-[#e8e1d0] p-2">
          <Link2 className="size-3.5 text-[#5f5e5a]" />
          <span className="flex-1 truncate text-[11px] text-sage-700">{url}</span>
          <button onClick={copy} className="rounded p-1 text-[#5f5e5a]" aria-label="Copy link"><Copy className="size-3.5" /></button>
        </div>
      )}
      {!sit.revoked && (
        <SitChecklist sit={sit} birds={birds} onSitChanged={onChange} />
      )}
      <div className="mt-3 flex gap-3 text-xs font-medium">
        {allBirds && !sit.revoked && (
          <button onClick={() => setEditing(true)} className="text-[#1a3d2e] underline">Edit</button>
        )}
        {!sit.revoked && !expired && (
          <button onClick={revoke} className="text-[#5f5e5a] underline">Revoke link</button>
        )}
        <button onClick={remove} className="ml-auto text-[#5f5e5a] underline">Delete</button>
      </div>
    </div>
  );
}

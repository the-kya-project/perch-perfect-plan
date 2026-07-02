import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, ChevronDown, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getLocalUser } from "@/integrations/supabase/currentUser";
import { useBirdRole } from "@/lib/useBirdRole";
import { markBirdPassed } from "@/lib/passed.functions";
import { mergeEmergency } from "@/lib/emergency";
import { InkHero, Card, PrimaryButton } from "@/components/system";
import { PathDetail, type PassingPath, type VetContact } from "@/components/PassingGuidance";
import { toast } from "sonner";

// Owner mark-as-passed flow. Two states, one visit:
//   ask      → the gentle confirmation screen
//   guidance → shown ONCE, immediately after confirming (never ambient; a later
//              visit to this URL redirects to Remembering instead)
// Marking preserves everything — the record becomes a memorial; nothing deletes.
export const Route = createFileRoute("/_authenticated/birds/$birdId/farewell")({
  head: () => ({ meta: [{ title: "Kya & Co." }] }),
  component: Farewell,
});

function Farewell() {
  const { birdId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isOwner = useBirdRole(birdId) === "owner";
  const [step, setStep] = useState<"ask" | "guidance">("ask");
  const [busy, setBusy] = useState(false);
  const mark = useServerFn(markBirdPassed);

  const { data } = useQuery({
    queryKey: ["farewell", birdId],
    queryFn: async () => {
      const { data: u } = await getLocalUser();
      const [bird, contacts, defaults, profile] = await Promise.all([
        supabase.from("birds").select("id, name, passed_at, owner_id").eq("id", birdId).maybeSingle(),
        supabase.from("emergency_contacts").select("*").eq("bird_id", birdId).maybeSingle(),
        u.user ? supabase.from("owner_emergency_defaults").select("*").eq("owner_id", u.user.id).maybeSingle() : Promise.resolve({ data: null } as any),
        u.user ? supabase.from("profiles").select("display_name").eq("id", u.user.id).maybeSingle() : Promise.resolve({ data: null } as any),
      ]);
      const merged = mergeEmergency(contacts.data as any, defaults.data as any) as any;
      const vet: VetContact = {
        name: merged?.avian_vet_name ?? merged?.emergency_vet_name ?? null,
        phone: merged?.avian_vet_phone ?? merged?.emergency_vet_phone ?? null,
      };
      return {
        bird: bird.data as any,
        vet,
        ownerName: ((profile.data?.display_name ?? "").toString().trim() || "you") as string,
      };
    },
  });

  const bird = data?.bird;
  const name = bird?.name ?? "your bird";

  // Never ambient: if the bird is already passed and we're not mid-flow (i.e.
  // someone revisits this URL later), the memorial is the destination.
  if (bird?.passed_at && step === "ask") {
    navigate({ to: "/remembering", replace: true });
    return null;
  }
  if (bird && !isOwner) {
    navigate({ to: "/birds/$birdId", params: { birdId }, replace: true });
    return null;
  }

  async function confirm() {
    setBusy(true);
    try {
      await mark({ data: { birdId } });
      // The bird leaves the active flock everywhere; the record stays.
      qc.invalidateQueries({ queryKey: ["birds"] });
      qc.invalidateQueries({ queryKey: ["bird-record", birdId] });
      qc.invalidateQueries({ queryKey: ["remembering-birds"] });
      qc.invalidateQueries({ queryKey: ["remembering-count"] });
      setStep("guidance");
      window.scrollTo(0, 0);
    } catch (e: any) {
      toast.error(e?.message ?? "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (step === "guidance") {
    return (
      <div className="min-h-screen bg-[var(--cream)] pb-nav">
        <div className="mx-auto max-w-md">
          <InkHero eyebrow="In your own time" headline="A few things that can help." />
          <main className="space-y-4 px-5 pt-5">
            <Card className="p-5">
              <h2 className="t-section">Should you consider a necropsy?</h2>
              <p className="t-body mt-2 leading-relaxed text-[var(--ink2)]">
                If {name}'s passing was sudden or unexplained, or you have other birds, a necropsy can tell you why, and whether your flock is at risk. It's time sensitive, so it helps to decide soon.
              </p>
            </Card>

            {/* The same three body-care paths the sitter sees, for an owner who
                is with their bird. Collapsed by choice — nothing is forced. */}
            <GuidancePaths name={name} ownerName={data?.ownerName ?? "you"} vet={data?.vet ?? { name: null, phone: null }} />

            <p className="t-meta pt-1 leading-relaxed">
              Gentle starting points, not medical advice. Your avian vet can guide the specifics.
            </p>

            <PrimaryButton tone="ink" onPress={() => navigate({ to: "/dashboard" })}>Done</PrimaryButton>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--cream)] pb-nav">
      <div className="mx-auto max-w-md">
        <InkHero
          backIcon={<ArrowLeft className="size-5" />}
          onBack={() => navigate({ to: "/birds/$birdId", params: { birdId } })}
          eyebrow="Take your time"
          headline={`Has ${name} passed away?`}
        />
        <main className="space-y-4 px-5 pt-5">
          <Card className="p-5">
            <p className="t-body leading-relaxed text-[var(--ink2)]">
              We're so sorry. This gently pauses {name}'s daily reminders, and if a sit is active, lets their sitter know they can stop too. {name}'s record, journal, and moments are kept, so you can look back whenever you'd like.
            </p>
          </Card>
          <button
            type="button"
            disabled={busy || !bird}
            onClick={confirm}
            className="flex min-h-[52px] w-full items-center justify-center rounded-[13px] bg-[var(--ink)] text-[15px] font-[500] text-white active:scale-[0.99] disabled:opacity-60"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : `Yes, ${name} has passed`}
          </button>
          <button
            type="button"
            onClick={() => navigate({ to: "/birds/$birdId", params: { birdId } })}
            className="flex min-h-[48px] w-full items-center justify-center rounded-[13px] border border-[var(--line)] bg-white text-[15px] font-[500] text-[var(--ink)] active:scale-[0.99]"
          >
            Not now
          </button>
        </main>
      </div>
    </div>
  );
}

// Three collapsible path details (owner audience). Content lives in
// PassingGuidance and is shared verbatim with the sitter's path screens.
function GuidancePaths({ name, ownerName, vet }: { name: string; ownerName: string; vet: VetContact }) {
  const [open, setOpen] = useState<PassingPath | null>(null);
  const paths: { key: PassingPath; label: string }[] = [
    { key: "necropsy", label: `Keep ${name} for a necropsy` },
    { key: "burial", label: `Prepare ${name} for burial or cremation` },
    { key: "vet", label: `Bring ${name} to the vet` },
  ];
  return (
    <div className="space-y-2">
      {paths.map((p) => {
        const isOpen = open === p.key;
        return (
          <Card key={p.key}>
            <button
              type="button"
              onClick={() => setOpen(isOpen ? null : p.key)}
              aria-expanded={isOpen}
              className="flex min-h-[52px] w-full items-center gap-3 px-4 py-3 text-left"
            >
              <span className="t-item flex-1">{p.label}</span>
              <ChevronDown className={`size-4 shrink-0 text-[var(--mute2)] transition ${isOpen ? "rotate-180" : ""}`} />
            </button>
            {isOpen && (
              <div className="border-t border-[var(--line2)] px-4 py-4">
                <PathDetail path={p.key} name={name} ownerName={ownerName} vet={vet} audience="owner" />
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

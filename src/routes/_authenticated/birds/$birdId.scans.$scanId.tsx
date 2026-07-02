import { useState } from "react";
import { createFileRoute, useNavigate, useRouter, useCanGoBack, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft, Check, AlertTriangle, HelpCircle, Minus, Loader2, Siren, Trash2 } from "lucide-react";
import { InkHero, Card, StatusPill, SectionHead, IconTile } from "@/components/system";
import { useCapability } from "@/lib/useCapability";
import { useBirdRole } from "@/lib/useBirdRole";
import { OwnerHeaderIcons } from "@/components/OwnerHeader";

// Focused, read-only view of one submitted health scan. Reached from the Scans
// inbox (replaces the old deep-link into the care-plan editor's logs tab, which
// read as "the care plan"). Owner/household read via RLS on daily_logs.
export const Route = createFileRoute("/_authenticated/birds/$birdId/scans/$scanId")({
  head: () => ({ meta: [{ title: "Health check — Kya & Co." }] }),
  component: ScanDetail,
});

// `fkey` = the scan FIELD key that item_notes is keyed by (the status column and
// the field key differ for noise→behavior and fluffed→energy).
const SCAN_COLS: { col: string; fkey: string; label: string }[] = [
  { col: "alertness_status", fkey: "alertness", label: "Alert and responsive" },
  { col: "food_status", fkey: "food", label: "Eating normally" },
  { col: "droppings_status", fkey: "droppings", label: "Droppings look normal" },
  { col: "breathing_status", fkey: "breathing", label: "Breathing normally" },
  { col: "posture_status", fkey: "posture", label: "Perched normally" },
  { col: "behavior_status", fkey: "noise", label: "Vocalizing as usual" },
  { col: "energy_status", fkey: "fluffed", label: "Not fluffed for long stretches" },
  { col: "vomiting_status", fkey: "vomiting", label: "Face clean, no vomiting" },
  { col: "injury_status", fkey: "injury", label: "No injury, fall, bite, or scratch" },
  { col: "exposure_status", fkey: "exposure", label: "No exposure to fumes / unsafe items" },
];

function ScanDetail() {
  const { birdId, scanId } = Route.useParams();
  const canHealth = useCapability("record_health", { birdId });
  const canEmergency = useCapability("manage_emergency", { birdId });
  const isOwner = useBirdRole(birdId) === "owner";
  const navigate = useNavigate();
  const router = useRouter();
  const qc = useQueryClient();
  const canGoBack = useCanGoBack();
  const [resolving, setResolving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const goBack = () => (canGoBack ? router.history.back() : navigate({ to: "/scans" }));

  // Owner-only delete (RLS also enforces birds.owner_id). Removes the health check
  // and refreshes concern surfacing (scan feed + record check-ins), then leaves
  // the now-gone detail for the Scans list.
  async function deleteScan() {
    if (!window.confirm("Delete this health check? This can't be undone.")) return;
    setDeleting(true);
    const { error } = await supabase.from("daily_logs").delete().eq("id", scanId);
    setDeleting(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Health check deleted.");
    qc.invalidateQueries({ queryKey: ["scan-feed"] });
    qc.invalidateQueries({ queryKey: ["bird-checkins", birdId] });
    qc.invalidateQueries({ queryKey: ["scan-detail", scanId] });
    navigate({ to: "/scans" });
  }

  async function markResolved() {
    if (!window.confirm("Mark this concern as resolved? Caregivers will see the bird's status return to normal.")) return;
    setResolving(true);
    const { error } = await supabase.from("daily_logs").update({ resolved_at: new Date().toISOString() } as any).eq("id", scanId);
    setResolving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Concern marked resolved.");
    qc.invalidateQueries({ queryKey: ["scan-detail", scanId] });
    qc.invalidateQueries({ queryKey: ["scan-feed"] });
  }

  const { data, isLoading } = useQuery({
    queryKey: ["scan-detail", scanId],
    queryFn: async () => {
      const { data: row } = await supabase
        .from("daily_logs")
        .select("*, sit:sits(sitter_name, sitter_email)")
        .eq("id", scanId).eq("bird_id", birdId).maybeSingle();
      let actor = "You";
      if (row) {
        const r = row as any;
        if (r.sit?.sitter_name || r.sit?.sitter_email) actor = r.sit.sitter_name || r.sit.sitter_email;
        else if (r.run_by) {
          const { data: p } = await supabase.from("profiles").select("display_name").eq("id", r.run_by).maybeSingle();
          actor = (p?.display_name ?? "").trim() || "You";
        }
      }
      const { data: bird } = await supabase.from("birds").select("name").eq("id", birdId).maybeSingle();
      return { row: row as any, actor, birdName: (bird?.name ?? "your bird") as string };
    },
  });

  const row = data?.row;

  if (isLoading) {
    return (
      <Shell eyebrow="Health check" headline="Loading…" onBack={goBack}>
        <div className="flex items-center justify-center gap-2 py-10 text-[14px] text-[var(--mute)]"><Loader2 className="size-4 animate-spin" /> Loading…</div>
      </Shell>
    );
  }
  if (!row) {
    return (
      <Shell eyebrow="Health check" headline="Health check not found." onBack={goBack}>
        <Card className="p-6 text-center">
          <p className="t-body text-[var(--ink2)]">This health check isn't available — it may have been removed.</p>
        </Card>
      </Shell>
    );
  }

  const triage = (row.triage_status ?? "green") as string;
  const concern = triage === "red" || triage === "yellow";
  const headline = triage === "red" ? "Concern flagged." : triage === "yellow" ? "Something to check." : "All clear.";
  const when = new Date(row.created_at).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const runBy = data!.actor === "You" ? "Run by you" : `Run by ${data!.actor}`;
  const notSure = SCAN_COLS.filter((f) => row[f.col] === "not_sure");

  return (
    <Shell eyebrow="Health check" headline={headline} body={`${data!.birdName} · ${runBy} · ${when}`} onBack={goBack}>
      {/* Summary banner — amber for concern, pale-green for clear (no red: a
          flagged scan is attention, not an emergency-contact block). */}
      <div
        className="flex items-start gap-3 rounded-[16px] p-4"
        style={concern ? { background: "var(--amber-fill)" } : { background: "var(--pale)" }}
      >
        <IconTile size={34} tone={concern ? "amber" : "pale"} icon={concern ? <AlertTriangle className="size-4" /> : <Check className="size-4" />} />
        <div className="min-w-0 flex-1">
          <p className="t-item" style={{ color: concern ? "var(--amber-ink)" : "var(--ink)" }}>
            {triage === "red" ? "Needs attention" : triage === "yellow" ? "Worth a closer look" : "Everything looked normal"}
          </p>
          {row.triage_reasons && (
            <p className="mt-0.5 text-[13px]" style={{ color: concern ? "var(--amber-ink)" : "var(--ink2)" }}>
              {String(row.triage_reasons).replace(/ \| /g, " · ")}
            </p>
          )}
          {notSure.length > 0 && (
            <p className="mt-1 text-[13px] text-[var(--amber-ink)]">
              {notSure.length} item{notSure.length === 1 ? "" : "s"}{" "}
              {data!.actor === "You" ? "you weren't" : `${data!.actor.split(/\s+/)[0]} wasn't`} sure about.
            </p>
          )}
        </div>
      </div>

      {/* Concern actions — emergency contacts (manage_emergency) + resolve
          (record_health). Each gated so members don't see controls that fail. */}
      {concern && (
        <div className="space-y-2">
          {canEmergency && (
          <Link
            to="/birds/$birdId/plan/editor"
            params={{ birdId }}
            search={{ tab: "emergency" }}
            className="flex min-h-[48px] items-center justify-center gap-2 rounded-[13px] bg-[var(--ink)] text-[15px] font-[500] text-white active:scale-[0.99]"
          >
            <Siren className="size-4" /> Emergency contacts
          </Link>
          )}
          {row.resolved_at ? (
            <p className="flex items-center justify-center gap-1.5 py-1 text-[13px] font-[500] text-[var(--moss)]">
              <Check className="size-4" /> Marked resolved
            </p>
          ) : canHealth ? (
            <button
              type="button"
              onClick={markResolved}
              disabled={resolving}
              className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-[13px] border border-[var(--ink)] text-[15px] font-[500] text-[var(--ink)] active:scale-[0.99] disabled:opacity-50"
            >
              {resolving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Mark resolved
            </button>
          ) : null}
        </div>
      )}

      {/* Per-item checklist */}
      <section>
        <SectionHead title="The check" />
        <Card>
          {SCAN_COLS.map((f, i) => {
            const note = (row.item_notes as Record<string, string> | null)?.[f.fkey];
            return (
              <div key={f.col} className={`px-4 py-2.5 ${i === SCAN_COLS.length - 1 ? "" : "border-b border-[var(--line2)]"}`}>
                <div className="flex min-h-[44px] items-center gap-3">
                  <AnswerIcon value={row[f.col]} />
                  <span className="t-item flex-1 font-[400]">{f.label}</span>
                  <AnswerPill value={row[f.col]} />
                </div>
                {note && (
                  <p className="mt-1 rounded-lg px-3 py-2 text-[13px] leading-relaxed" style={{ background: "var(--amber-fill)", color: "var(--amber-ink)" }}>
                    {note}
                  </p>
                )}
              </div>
            );
          })}
        </Card>
      </section>

      {row.notes && (
        <section>
          <SectionHead title="Notes" />
          <Card className="p-4">
            <p className="t-body whitespace-pre-line text-[var(--ink2)]">{row.notes}</p>
          </Card>
        </section>
      )}

      {/* Delete — owner-only (RLS also enforces birds.owner_id). */}
      {isOwner && (
        <button
          type="button"
          onClick={deleteScan}
          disabled={deleting}
          className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-[13px] border border-[var(--red-line)] text-[15px] font-[500] text-[var(--red-ink)] active:scale-[0.99] disabled:opacity-50"
        >
          {deleting ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />} {deleting ? "Deleting…" : "Delete health check"}
        </button>
      )}
    </Shell>
  );
}

function Shell({ eyebrow, headline, body, onBack, children }: { eyebrow: string; headline: string; body?: string; onBack: () => void; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--cream)] pb-nav">
      <div className="mx-auto max-w-md">
        <InkHero backIcon={<ArrowLeft className="size-5" />} onBack={onBack} eyebrow={eyebrow} headline={headline} body={body} trailingIcons={<OwnerHeaderIcons />} />
        <main className="space-y-4 px-5 pt-5">{children}</main>
      </div>
    </div>
  );
}

function AnswerIcon({ value }: { value: string | null }) {
  if (value === "normal") return <Check className="size-4 shrink-0 text-[var(--moss)]" />;
  if (value === "concerning") return <AlertTriangle className="size-4 shrink-0 text-[var(--amber-ink)]" />;
  if (value === "not_sure") return <HelpCircle className="size-4 shrink-0 text-[var(--amber-ink)]" />;
  return <Minus className="size-4 shrink-0 text-[var(--mute2)]" />;
}
function AnswerPill({ value }: { value: string | null }) {
  if (value === "normal") return <StatusPill tone="good">Normal</StatusPill>;
  if (value === "concerning") return <StatusPill tone="attention">Concerning</StatusPill>;
  if (value === "not_sure") return <StatusPill tone="attention">Not sure</StatusPill>;
  return <span className="t-meta">—</span>;
}

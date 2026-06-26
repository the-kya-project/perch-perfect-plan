import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getLocalUser } from "@/integrations/supabase/currentUser";
import { toast } from "sonner";
import { ArrowLeft, Plus, BookOpen, ImagePlus, Check, X, Loader2 } from "lucide-react";
import { InkHero, PhotoHero, StatusPill, Card, PrimaryButton } from "@/components/system";
import { useCapability } from "@/lib/useCapability";
import { useActiveSitIdForBird } from "@/components/CaregiverHome";
import { uploadJournalPhoto, signJournalPhotos } from "@/lib/journalPhoto";
import { compressImageToDataUrl } from "@/lib/imageUpload";

export const Route = createFileRoute("/_authenticated/birds/$birdId/journal")({
  head: () => ({ meta: [{ title: "Journal — Kya & Co." }] }),
  component: JournalFacet,
});

type Kind = "molt" | "meds" | "vet" | "behavior" | "note" | "other";
type Entry = { id: string; kind: Kind; title: string | null; body: string | null; occurred_on: string; photo_path: string | null };

const KINDS: { value: Kind; label: string; pill: string }[] = [
  { value: "molt", label: "Molt", pill: "bg-[var(--amber-fill)] text-[var(--amber-ink)]" },
  { value: "meds", label: "Meds", pill: "bg-[var(--pale)] text-[var(--ink)]" },
  { value: "vet", label: "Vet visit", pill: "bg-[var(--pale)] text-[var(--ink)]" },
  { value: "behavior", label: "Behavior", pill: "bg-[var(--pale2)] text-[var(--ink)]" },
  { value: "note", label: "Note", pill: "bg-[var(--cream2)] text-[var(--mute)]" },
  { value: "other", label: "Other", pill: "bg-[var(--cream2)] text-[var(--mute)]" },
];
const KIND = Object.fromEntries(KINDS.map((k) => [k.value, k])) as Record<Kind, (typeof KINDS)[number]>;

type Filter = "all" | "health" | "behavior" | "notes";
const FILTERS: { value: Filter; label: string; kinds: Kind[] }[] = [
  { value: "all", label: "All", kinds: ["molt", "meds", "vet", "behavior", "note", "other"] },
  { value: "health", label: "Health", kinds: ["molt", "meds", "vet"] },
  { value: "behavior", label: "Behavior", kinds: ["behavior"] },
  { value: "notes", label: "Notes", kinds: ["note", "other"] },
];
const todayStr = () => new Date().toISOString().slice(0, 10);

function JournalFacet() {
  const { birdId } = Route.useParams();
  const canHealth = useCapability("record_health", { birdId });
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Filter>("all");
  const [editing, setEditing] = useState<Entry | null | "new">(null);

  const { data: entries } = useQuery({
    queryKey: ["journal-entries", birdId],
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("journal_entries")
        .select("id, kind, title, body, occurred_on, photo_path")
        .eq("bird_id", birdId)
        .order("occurred_on", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as Entry[];
    },
  });

  const all = entries ?? [];
  const paths = all.map((e) => e.photo_path).filter(Boolean) as string[];
  const { data: photoUrls } = useQuery({
    queryKey: ["journal-photos", birdId, paths.join(",")],
    enabled: paths.length > 0,
    staleTime: 50 * 60_000,
    queryFn: async () => Object.fromEntries(await signJournalPhotos(paths)),
  });

  const shown = all.filter((e) => FILTERS.find((f) => f.value === filter)!.kinds.includes(e.kind));

  return (
    <div className="min-h-screen bg-[var(--cream)] pb-nav">
      <div className="mx-auto max-w-md">
        <InkHero
          backIcon={<ArrowLeft className="size-5" />}
          onBack={() => navigate({ to: "/birds/$birdId", params: { birdId } })}
          eyebrow="Journal"
          headline="What's been happening."
          body="Small things noted now become signals later."
          cta={canHealth ? { label: "Add an entry", tone: "lime", icon: <Plus className="size-4" />, onPress: () => setEditing("new") } : undefined}
        />

        <main className="space-y-4 px-5 pt-5">
          {/* Filter chips */}
          <div className="flex flex-wrap gap-2">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setFilter(f.value)}
                aria-pressed={filter === f.value}
                className="inline-flex min-h-[44px] items-center"
              >
                <StatusPill tone={filter === f.value ? "on" : "off"}>{f.label}</StatusPill>
              </button>
            ))}
          </div>

          {all.length === 0 ? (
            <section className="rounded-[18px] bg-[var(--cream2)] p-8 text-center ring-1 ring-[var(--line2)]">
              <BookOpen className="mx-auto size-7 text-[var(--moss)]" />
              <p className="t-body mt-3 text-[var(--ink)]">Nothing here yet. The journal is where you track health and behavior over time — molts, meds, vet visits, a new word, an off day. Add an entry whenever something's worth noting for the record.</p>
              <div className="mt-4">
                <PrimaryButton tone="lime" icon={<Plus className="size-4" />} onPress={() => setEditing("new")} full={false}>
                  Add first entry
                </PrimaryButton>
              </div>
            </section>
          ) : shown.length === 0 ? (
            <p className="t-body rounded-[18px] bg-[var(--cream2)] p-6 text-center text-[var(--mute)] ring-1 ring-[var(--line2)]">
              No {FILTERS.find((f) => f.value === filter)!.label.toLowerCase()} entries yet.
            </p>
          ) : (
            <div className="space-y-3">
              {shown.map((e) => (
                <EntryCard
                  key={e.id}
                  entry={e}
                  photoUrl={e.photo_path ? photoUrls?.[e.photo_path] ?? null : null}
                  onOpen={() => setEditing(e)}
                />
              ))}
            </div>
          )}
        </main>
      </div>

      {editing && (
        <EntryForm
          birdId={birdId}
          entry={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            qc.invalidateQueries({ queryKey: ["journal-entries", birdId] });
          }}
        />
      )}
    </div>
  );
}

// One journal entry as a tokenized white card. If the entry has a photo it
// renders as a PhotoHero-style band across the top; tapping anywhere opens the
// existing edit flow.
function EntryCard({ entry, photoUrl, onOpen }: { entry: Entry; photoUrl: string | null; onOpen: () => void }) {
  const k = KIND[entry.kind];
  return (
    <Card>
      <button type="button" onClick={onOpen} className="block w-full text-left active:bg-black/[0.02]">
        {photoUrl && <PhotoHero src={photoUrl} height={160} alt="" />}
        <div className="p-4">
          <div className="flex items-start justify-between gap-3">
            <h3 className="t-item min-w-0 flex-1">{entry.title || k.label}</h3>
            <span className="t-meta shrink-0">{fmtDate(entry.occurred_on)}</span>
          </div>
          <div className="mt-1.5">
            <span className={`inline-flex items-center rounded-full px-[9px] py-[3px] text-[11.5px] font-[500] ${k.pill}`}>{k.label}</span>
          </div>
          {entry.body && <p className="t-body mt-2 line-clamp-3 text-[var(--ink2)]">{entry.body}</p>}
        </div>
      </button>
    </Card>
  );
}

function fmtDate(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  const now = new Date();
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) });
}

function EntryForm({ birdId, entry, onClose, onSaved }: { birdId: string; entry: Entry | null; onClose: () => void; onSaved: () => void }) {
  // Attribution for entries created during an active caregiver assignment.
  const activeSitId = useActiveSitIdForBird(birdId);
  const [kind, setKind] = useState<Kind>(entry?.kind ?? "note");
  const [title, setTitle] = useState(entry?.title ?? "");
  const [body, setBody] = useState(entry?.body ?? "");
  const [date, setDate] = useState(entry?.occurred_on ?? todayStr());
  const [photoData, setPhotoData] = useState<string | null>(null); // new pick (data URL)
  const [keepPhoto, setKeepPhoto] = useState(true); // existing photo retained?
  const [photoBusy, setPhotoBusy] = useState(false);
  const [saving, setSaving] = useState(false);

  const valid = !!kind && !!date && title.trim().length > 0;
  const existingPhoto = entry?.photo_path ?? null;

  async function pickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setPhotoBusy(true);
    try {
      setPhotoData(await compressImageToDataUrl(file));
      setKeepPhoto(false);
    } catch {
      toast.error("Couldn't process that photo. Try a different one.");
    } finally {
      setPhotoBusy(false);
    }
  }

  async function save() {
    if (!valid) return;
    setSaving(true);
    try {
      const { data: u } = await getLocalUser();
      let photo_path = keepPhoto ? existingPhoto : null;
      if (photoData) photo_path = await uploadJournalPhoto(birdId, photoData);

      if (entry) {
        const { error } = await supabase.from("journal_entries")
          .update({ kind, title: title.trim(), body: body.trim() || null, occurred_on: date, photo_path })
          .eq("id", entry.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("journal_entries").insert({
          bird_id: birdId, kind, title: title.trim(), body: body.trim() || null,
          occurred_on: date, photo_path, logged_by: u.user?.id ?? null,
          ...(activeSitId ? { sit_id: activeSitId } : {}),
        });
        if (error) throw error;
      }
      toast.success(entry ? "Entry updated." : "Entry added.");
      onSaved();
    } catch (e: any) {
      toast.error(e?.message ?? "Couldn't save the entry.");
    } finally {
      setSaving(false);
    }
  }

  const showPhoto = photoData ?? (keepPhoto && existingPhoto ? "existing" : null);

  return (
    <div className="fixed inset-0 z-50 grid place-items-end sm:place-items-center">
      <div className="absolute inset-0 bg-black/30" onClick={saving ? undefined : onClose} />
      <div className="relative max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-[var(--cream)] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-xl sm:rounded-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="t-section">{entry ? "Edit entry" : "Add entry"}</h2>
          <button onClick={onClose} aria-label="Close" className="grid size-9 place-items-center rounded-full text-[var(--mute)]"><X className="size-5" /></button>
        </div>

        <label className="block">
          <span className="mb-1 block text-xs font-[500] text-[var(--mute)]">Kind *</span>
          <select value={kind} onChange={(e) => setKind(e.target.value as Kind)} className="h-11 w-full rounded-xl border border-[var(--line)] bg-white px-3 text-sm text-[var(--ink)]">
            {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
          </select>
        </label>

        <label className="mt-3 block">
          <span className="mb-1 block text-xs font-[500] text-[var(--mute)]">Title *</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="e.g. Started wing molt" className="h-11 w-full rounded-xl border border-[var(--line)] bg-white px-3 text-sm text-[var(--ink)]" />
        </label>

        <label className="mt-3 block">
          <span className="mb-1 block text-xs font-[500] text-[var(--mute)]">Details</span>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} rows={3} placeholder="Optional" className="w-full rounded-xl border border-[var(--line)] bg-white p-3 text-sm text-[var(--ink)]" />
        </label>

        <label className="mt-3 block">
          <span className="mb-1 block text-xs font-[500] text-[var(--mute)]">Date *</span>
          <input type="date" value={date} max={todayStr()} onChange={(e) => setDate(e.target.value)} className="h-11 w-full rounded-xl border border-[var(--line)] bg-white px-3 text-sm text-[var(--ink)]" />
        </label>

        <div className="mt-3">
          <span className="mb-1 block text-xs font-[500] text-[var(--mute)]">Photo</span>
          {showPhoto ? (
            <div className="flex items-center gap-3">
              {photoData ? <img src={photoData} alt="" className="h-16 w-16 rounded-lg object-cover" /> : <span className="grid h-16 w-16 place-items-center rounded-lg bg-[var(--cream2)] text-[10px] text-[var(--mute2)]">Saved photo</span>}
              <button type="button" onClick={() => { setPhotoData(null); setKeepPhoto(false); }} className="text-xs font-[500] text-[var(--amber-ink)] underline">Remove photo</button>
            </div>
          ) : (
            <label className="flex min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[var(--line)] bg-white text-sm font-[500] text-[var(--mute)]">
              {photoBusy ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
              {photoBusy ? "Processing…" : "Add a photo"}
              <input type="file" accept="image/*" className="hidden" disabled={photoBusy} onChange={pickPhoto} />
            </label>
          )}
        </div>

        <div className="mt-5 flex gap-2">
          <PrimaryButton tone="lime" type="button" icon={<Check className="size-4" />} onPress={save} disabled={!valid || saving || photoBusy}>
            {saving ? "Saving…" : "Save"}
          </PrimaryButton>
          <button type="button" onClick={onClose} disabled={saving} className="min-h-[44px] rounded-[12px] border border-[var(--line)] px-4 text-[15px] font-[500] text-[var(--mute)] disabled:opacity-50">Cancel</button>
        </div>
      </div>
    </div>
  );
}

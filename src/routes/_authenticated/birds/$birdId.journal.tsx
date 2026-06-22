import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getLocalUser } from "@/integrations/supabase/currentUser";
import { toast } from "sonner";
import { ArrowLeft, Plus, BookOpen, ImagePlus, Check, X, Loader2 } from "lucide-react";
import { DatedTimeline, type TimelineItem } from "@/components/DatedTimeline";
import { uploadJournalPhoto, signJournalPhotos } from "@/lib/journalPhoto";
import { compressImageToDataUrl } from "@/lib/imageUpload";

export const Route = createFileRoute("/_authenticated/birds/$birdId/journal")({
  head: () => ({ meta: [{ title: "Journal — Parrot Care Co-Pilot" }] }),
  component: JournalFacet,
});

type Kind = "molt" | "meds" | "vet" | "behavior" | "note" | "other";
type Entry = { id: string; kind: Kind; title: string | null; body: string | null; occurred_on: string; photo_path: string | null };

const KINDS: { value: Kind; label: string; pill: string }[] = [
  { value: "molt", label: "Molt", pill: "bg-[#f6e7c4] text-[#854F0B]" },
  { value: "meds", label: "Meds", pill: "bg-[#d6e8dc] text-[#1a3d2e]" },
  { value: "vet", label: "Vet visit", pill: "bg-[#d6e8dc] text-[#1a3d2e]" },
  { value: "behavior", label: "Behavior", pill: "bg-[#e8f0ec] text-[#1a3d2e]" },
  { value: "note", label: "Note", pill: "bg-[#e8e1d0] text-[#5f5e5a]" },
  { value: "other", label: "Other", pill: "bg-[#e8e1d0] text-[#5f5e5a]" },
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

  const items: TimelineItem[] = shown.map((e) => {
    const url = e.photo_path ? photoUrls?.[e.photo_path] : null;
    return {
      id: e.id,
      at: e.occurred_on,
      title: e.title || KIND[e.kind].label,
      badge: <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${KIND[e.kind].pill}`}>{KIND[e.kind].label}</span>,
      subtitle: (
        <span>
          {e.body && <span className="line-clamp-2 block">{e.body}</span>}
          {url && <img src={url} alt="" loading="lazy" className="mt-1.5 h-16 w-16 rounded-lg object-cover ring-1 ring-[#e3dcc9]" />}
        </span>
      ),
      onClick: () => setEditing(e),
    };
  });

  return (
    <div className="min-h-screen bg-[#f4f1e8] pb-24">
      <header className="sticky top-0 z-10 border-b border-[#e3ded0] bg-[#f4f1e8]/95 backdrop-blur">
        <div className="mx-auto flex max-w-md items-center gap-3 px-5 py-3">
          <Link to="/birds/$birdId" params={{ birdId }} aria-label="Back to bird record" className="-ml-1 rounded p-1 text-[#1a3d2e]">
            <ArrowLeft className="size-5" />
          </Link>
          <h1 className="flex-1 text-base font-medium text-[#1a3d2e]">Journal</h1>
          <button
            type="button"
            onClick={() => setEditing("new")}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full bg-[#cdeab0] px-3.5 text-sm font-medium text-[#1a3d2e]"
          >
            <Plus className="size-4" /> Add entry
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-md space-y-4 px-5 py-5">
        {/* Filter chips */}
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilter(f.value)}
              className={`min-h-[36px] rounded-full px-3.5 text-sm font-medium ${filter === f.value ? "bg-[#1a3d2e] text-white" : "border border-[#c8bfa6] bg-white text-[#1a3d2e]"}`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {all.length === 0 ? (
          <section className="rounded-[16px] bg-[#efe9da] p-8 text-center">
            <BookOpen className="mx-auto size-7 text-[#2d6a4f]" />
            <p className="mt-3 text-sm text-[#1a3d2e]">Nothing here yet. The journal is for the things worth remembering — a molt, a med, a vet visit, a milestone.</p>
            <button type="button" onClick={() => setEditing("new")} className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-[14px] bg-[#cdeab0] px-5 text-sm font-medium text-[#1a3d2e]">
              <Plus className="size-4" /> Add first entry
            </button>
          </section>
        ) : shown.length === 0 ? (
          <p className="rounded-[14px] bg-[#efe9da] p-6 text-center text-sm text-[#5f5e5a]">No {FILTERS.find((f) => f.value === filter)!.label.toLowerCase()} entries yet.</p>
        ) : (
          <DatedTimeline items={items} rail={false} />
        )}
      </main>

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

function EntryForm({ birdId, entry, onClose, onSaved }: { birdId: string; entry: Entry | null; onClose: () => void; onSaved: () => void }) {
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
      <div className="relative max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-[#f4f1e8] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-xl sm:rounded-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-medium text-[#1a3d2e]">{entry ? "Edit entry" : "Add entry"}</h2>
          <button onClick={onClose} aria-label="Close" className="rounded-full p-1 text-[#5f5e5a]"><X className="size-5" /></button>
        </div>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-[#5f5e5a]">Kind *</span>
          <select value={kind} onChange={(e) => setKind(e.target.value as Kind)} className="h-11 w-full rounded-xl border border-[#c8bfa6] bg-[#fbfaf2] px-3 text-sm text-[#1a3d2e]">
            {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
          </select>
        </label>

        <label className="mt-3 block">
          <span className="mb-1 block text-xs font-medium text-[#5f5e5a]">Title *</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="e.g. Started wing molt" className="h-11 w-full rounded-xl border border-[#c8bfa6] bg-[#fbfaf2] px-3 text-sm text-[#1a3d2e]" />
        </label>

        <label className="mt-3 block">
          <span className="mb-1 block text-xs font-medium text-[#5f5e5a]">Details</span>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} rows={3} placeholder="Optional" className="w-full rounded-xl border border-[#c8bfa6] bg-[#fbfaf2] p-3 text-sm text-[#1a3d2e]" />
        </label>

        <label className="mt-3 block">
          <span className="mb-1 block text-xs font-medium text-[#5f5e5a]">Date *</span>
          <input type="date" value={date} max={todayStr()} onChange={(e) => setDate(e.target.value)} className="h-11 w-full rounded-xl border border-[#c8bfa6] bg-[#fbfaf2] px-3 text-sm text-[#1a3d2e]" />
        </label>

        <div className="mt-3">
          <span className="mb-1 block text-xs font-medium text-[#5f5e5a]">Photo</span>
          {showPhoto ? (
            <div className="flex items-center gap-3">
              {photoData ? <img src={photoData} alt="" className="h-16 w-16 rounded-lg object-cover" /> : <span className="grid h-16 w-16 place-items-center rounded-lg bg-[#efe9da] text-[10px] text-[#8a897f]">Saved photo</span>}
              <button type="button" onClick={() => { setPhotoData(null); setKeepPhoto(false); }} className="text-xs font-medium text-[#854F0B] underline">Remove photo</button>
            </div>
          ) : (
            <label className="flex min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[#c8bfa6] bg-[#fbfaf2] text-sm font-medium text-[#5f5e5a]">
              {photoBusy ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
              {photoBusy ? "Processing…" : "Add a photo"}
              <input type="file" accept="image/*" className="hidden" disabled={photoBusy} onChange={pickPhoto} />
            </label>
          )}
        </div>

        <div className="mt-5 flex gap-2">
          <button type="button" onClick={save} disabled={!valid || saving || photoBusy} className="flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-[14px] bg-[#cdeab0] text-sm font-medium text-[#1a3d2e] disabled:opacity-50">
            <Check className="size-4" /> {saving ? "Saving…" : "Save"}
          </button>
          <button type="button" onClick={onClose} disabled={saving} className="min-h-[44px] rounded-[14px] border border-[#c8bfa6] px-4 text-sm font-medium text-[#5f5e5a]">Cancel</button>
        </div>
      </div>
    </div>
  );
}

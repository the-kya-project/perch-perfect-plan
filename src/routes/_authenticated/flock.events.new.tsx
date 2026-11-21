import { useEffect, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Camera } from "lucide-react";
import { useTranslation } from "react-i18next";
import { K, KyaPrimaryButton } from "@/components/kya";
import { FlockSubPage } from "@/components/flock/FlockSubPage";
import { useFormInProgress } from "@/lib/formsInProgress";
import { saveEvent, suggestEvent, useEvent, useEventRules, useInvalidateEvents, type EventDraft, type EventKind, type EventMode } from "@/lib/flockEvents";
import { uploadPostPhoto } from "@/lib/flockPostData";

// Suggest an event (Batch 5, screen 3): any chapter member; it goes to review.
// The chapter's lead and admins see "New event" instead: it goes live at once,
// and they can mark a volunteer day (Do good) with a spot limit and a photo.
// ?edit= edits an event (managers) or fixes your own suggestion.
const UUID = /^[0-9a-f-]{36}$/i;
export const Route = createFileRoute("/_authenticated/flock/events/new")({
  validateSearch: (s: Record<string, unknown>): { edit?: string } => (typeof s.edit === "string" && UUID.test(s.edit) ? { edit: s.edit } : {}),
  component: EventForm,
});

/** "2026-11-08T13:00" in the viewer's own time, for <input type="datetime-local">. */
function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function EventForm() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { edit } = Route.useSearch();
  const { data: rules } = useEventRules();
  const { data: existing } = useEvent(edit ?? "");
  const invalidate = useInvalidateEvents();
  const manage = !!rules?.can_manage;
  const [kind, setKind] = useState<EventKind>("meetup");
  const [title, setTitle] = useState("");
  const [when, setWhen] = useState("");
  const [until, setUntil] = useState("");
  const [mode, setMode] = useState<EventMode>("online");
  const [placeName, setPlaceName] = useState("");
  const [address, setAddress] = useState("");
  const [onlineUrl, setOnlineUrl] = useState("");
  const [about, setAbout] = useState("");
  const [iHost, setIHost] = useState(true);
  const [spots, setSpots] = useState("");
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const loaded = useRef(false);
  useFormInProgress(!!(title.trim() || about.trim()) && !busy);

  useEffect(() => {
    if (!existing || loaded.current) return;
    loaded.current = true;
    setKind(existing.kind); setTitle(existing.title); setWhen(toLocalInput(existing.starts_at)); setUntil(toLocalInput(existing.ends_at));
    setMode(existing.mode); setPlaceName(existing.place_name ?? ""); setAddress(existing.address ?? ""); setOnlineUrl(existing.online_url ?? "");
    setAbout(existing.description ?? ""); setIHost(!!existing.host_id); setSpots(existing.spot_limit ? String(existing.spot_limit) : "");
  }, [existing]);

  const inPersonOpen = !!rules?.in_person_open || (existing?.mode === "in_person");
  const effectiveMode: EventMode = inPersonOpen ? mode : "online";
  const chapter = rules?.region_name ?? "";
  const ready = title.trim() && when && (effectiveMode === "online" || placeName.trim()) && (!onlineUrl || /^https:\/\//.test(onlineUrl.trim()));

  const submit = async () => {
    setBusy(true); setError(null);
    const d: EventDraft = {
      id: edit ?? null, kind: manage ? kind : "meetup", title, startsAt: new Date(when).toISOString(), endsAt: until ? new Date(until).toISOString() : null,
      mode: effectiveMode, placeName, address, onlineUrl: onlineUrl.trim(), description: about, iHost,
      spotLimit: spots ? Math.max(1, Number(spots)) : null, region: rules?.region_slug ?? null, photoPath,
    };
    try {
      const id = manage ? await saveEvent(d) : await suggestEvent(d);
      await invalidate();
      void navigate({ to: "/flock/events/$eventId", params: { eventId: id }, replace: true });
    } catch (e) {
      const msg = (e as { message?: string })?.message ?? "";
      setError(msg === "in_person_locked"
        ? t("flock.events.locked", "In-person meetups open once {{chapter}} has {{count}} members. Online get-togethers are welcome anytime.", { chapter, count: rules?.in_person_min ?? 15 })
        : msg.includes("hasn't passed") ? t("flock.events.pastTime", "Pick a time that hasn't passed.")
        : t("flock.events.saveError", "We couldn't save that. Check the details and try again."));
      setBusy(false);
    }
  };

  const field = "min-h-[48px] rounded-[14px] border px-3.5 text-[16px] outline-none";
  const label = "flex flex-col gap-1.5 text-[14px] font-[700]";
  const title_ = edit ? t("flock.events.editTitle", "Edit event") : manage ? t("flock.events.new", "New event") : t("flock.events.suggest", "Suggest an event");
  return (
    <FlockSubPage title={title_} line={chapter} fallback="/flock/chapter">
      <div className="flex flex-col gap-4 rounded-[18px] bg-white p-4" style={{ color: K.forest }} data-testid="event-form">
        {manage && (
          <div className="flex gap-2" role="radiogroup" aria-label={t("flock.events.kindLabel", "Kind of event")}>
            {(["meetup", "volunteer"] as const).map((k) => (
              <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)} data-kind={k}
                className="min-h-[44px] flex-1 rounded-full text-[14px] font-[700]"
                style={kind === k ? { background: K.forest, color: "#fff" } : { background: K.mist, color: K.forest }}>
                {k === "meetup" ? t("flock.events.kindMeetup", "Get-together") : t("flock.events.kindVolunteer", "Volunteer day (Do good)")}
              </button>
            ))}
          </div>
        )}
        <label className={label}>
          {t("flock.events.what", "What is it?")}
          <input value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} className={field} style={{ borderColor: "#c9d3c8" }} data-testid="event-title" />
        </label>
        <label className={label}>
          {t("flock.events.when", "When")}
          <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className={field} style={{ borderColor: "#c9d3c8" }} data-testid="event-when-input" />
        </label>
        <label className={label}>
          {t("flock.events.until", "Ends (optional)")}
          <input type="datetime-local" value={until} onChange={(e) => setUntil(e.target.value)} className={field} style={{ borderColor: "#c9d3c8" }} data-testid="event-until-input" />
        </label>
        <div className="flex flex-col gap-1.5">
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={t("flock.events.modeLabel", "In person or online")}>
            {(["in_person", "online"] as const).map((m) => {
              const locked = m === "in_person" && !inPersonOpen;
              return (
                <button key={m} type="button" role="radio" aria-checked={effectiveMode === m} disabled={locked} onClick={() => setMode(m)} data-mode={m}
                  className="min-h-[48px] rounded-full text-[15px] font-[700] disabled:opacity-40"
                  style={effectiveMode === m ? { background: K.lime, border: `2px solid ${K.forest}` } : { background: "#fff", border: "1px solid #c9d3c8" }}>
                  {m === "in_person" ? t("flock.events.inPerson", "In person") : t("flock.events.online", "Online")}
                </button>
              );
            })}
          </div>
          {!inPersonOpen && rules && (
            <p className="m-0 text-[13.5px] leading-[1.45]" style={{ color: K.quiet }} data-testid="in-person-locked">
              {t("flock.events.locked", "In-person meetups open once {{chapter}} has {{count}} members. Online get-togethers are welcome anytime.", { chapter, count: rules.in_person_min })}
            </p>
          )}
        </div>
        {effectiveMode === "in_person" ? (
          <>
            <label className={label}>
              {t("flock.events.where", "Where")}
              <input value={placeName} maxLength={160} onChange={(e) => setPlaceName(e.target.value)} placeholder={t("flock.events.wherePlaceholder", "A library, a park, a café")}
                className={field} style={{ borderColor: "#c9d3c8" }} data-testid="event-place" />
            </label>
            <label className={label}>
              {t("flock.events.address", "Address (optional)")}
              <input value={address} maxLength={240} onChange={(e) => setAddress(e.target.value)} className={field} style={{ borderColor: "#c9d3c8" }} />
            </label>
            <p className="m-0 text-[13.5px] leading-[1.45]" style={{ color: K.quiet }}>
              {t("flock.events.safety", "Please meet in public places, and leave birds at home unless the host says they're welcome.")}
            </p>
          </>
        ) : (
          <label className={label}>
            {t("flock.events.link", "Link for the get-together (optional)")}
            <input value={onlineUrl} maxLength={500} inputMode="url" onChange={(e) => setOnlineUrl(e.target.value)} placeholder="https://"
              className={field} style={{ borderColor: "#c9d3c8" }} data-testid="event-url" />
            <span className="text-[12.5px] font-normal" style={{ color: K.quiet }}>{t("flock.events.linkHint", "Only people who say they're going see the link.")}</span>
          </label>
        )}
        <label className={label}>
          {t("flock.events.about", "Tell people about it")}
          <textarea value={about} maxLength={3000} rows={4} onChange={(e) => setAbout(e.target.value)}
            className="resize-none rounded-[14px] border p-3 text-[16px] font-normal outline-none" style={{ borderColor: "#c9d3c8" }} data-testid="event-about" />
        </label>
        {manage && kind === "volunteer" && (
          <label className={label}>
            {t("flock.events.spotLimit", "Spot limit (optional)")}
            <input type="number" min={1} max={1000} value={spots} onChange={(e) => setSpots(e.target.value)} className={field} style={{ borderColor: "#c9d3c8" }} data-testid="event-spots" />
          </label>
        )}
        {manage && (
          <>
            <input ref={fileRef} type="file" accept="image/*" className="hidden"
              onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (!f) return; try { setPhotoPath(await uploadPostPhoto(f)); } catch { setError(t("flock.posts.photoError", "We couldn't add that photo. Try again.")); } }} />
            <button type="button" onClick={() => fileRef.current?.click()} className="inline-flex min-h-[44px] items-center gap-2 self-start rounded-full border px-4 text-[14px] font-[700]" style={{ borderColor: "#c9d3c8" }}>
              <Camera className="size-4" aria-hidden="true" />{photoPath ? t("flock.ideasAdmin.photoAdded", "Photo added") : t("flock.events.photo", "Add a photo (optional)")}
            </button>
          </>
        )}
        {!manage && (
          <label className="flex min-h-[44px] items-center gap-2.5 text-[15px] font-[700]">
            <input type="checkbox" checked={iHost} onChange={(e) => setIHost(e.target.checked)} className="size-5" data-testid="event-i-host" />
            {t("flock.events.iHost", "I'll host it")}
          </label>
        )}
        {!manage && <p className="m-0 text-[13.5px] leading-[1.45]" style={{ color: K.quiet }}>{t("flock.events.reviewHint", "Your chapter lead looks it over before it goes up. Usually within a day.")}</p>}
        {error && <p role="alert" className="m-0 text-[14px]" style={{ color: K.red }} data-testid="event-error">{error}</p>}
        <KyaPrimaryButton onClick={() => void submit()} disabled={!ready || busy}>
          {busy ? t("flock.idea.saving", "Saving…") : manage ? t("flock.events.save", "Save event") : t("flock.events.send", "Send for review")}
        </KyaPrimaryButton>
      </div>
    </FlockSubPage>
  );
}

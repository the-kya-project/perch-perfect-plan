import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { CalendarCheck, CalendarDays, Link2, MapPin, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { K } from "@/components/kya";
import { FlockSubPage } from "@/components/flock/FlockSubPage";
import { FlockEmpty } from "@/components/flock/FlockChips";
import { FlockAvatar } from "@/components/flock/FlockPeople";
import { Tag, statusLabel } from "@/components/flock/EventParts";
import { ConfirmSheet } from "@/components/flock/PostParts";
import { useAvatarUrls } from "@/lib/flockData";
import {
  cancelEvent, downloadIcs, eventIcs, goersLine, longWhen, rsvp, useEvent, useEventPhoto, useInvalidateEvents, type RsvpAnswer,
} from "@/lib/flockEvents";

// An event (Batch 5, screen 2): when, where, who's going, who's hosting, and
// I'm going / Maybe. Only the chapter's members (and its managers) can open
// it; an online link shows only once you've said you're going.
export const Route = createFileRoute("/_authenticated/flock/events/$eventId")({
  component: EventPage,
});

function EventPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { eventId } = Route.useParams();
  const { data: e, isLoading, isError } = useEvent(eventId);
  const { data: photo } = useEventPhoto(eventId, !!e?.has_photo);
  const { data: avatars } = useAvatarUrls((e?.goers ?? []).map((g) => g.photo_path));
  const invalidate = useInvalidateEvents();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [note, setNote] = useState("");

  if (isLoading) return <FlockSubPage title=" " fallback="/flock/chapter">{null}</FlockSubPage>;
  if (!e || isError) {
    return (
      <FlockSubPage title={t("flock.events.missingTitle", "Event not found")} fallback="/flock/chapter">
        <FlockEmpty icon={<CalendarDays className="size-6" />} title={t("flock.events.missingTitle", "Event not found")}>
          {t("flock.events.missing", "It may have been moved, or it's for another chapter.")}
        </FlockEmpty>
      </FlockSubPage>
    );
  }

  const live = e.status === "live" && new Date(e.starts_at).getTime() > Date.now();
  const full = e.spot_limit != null && e.going >= e.spot_limit && e.my_answer !== "going";
  const status = statusLabel(t, e.status);
  const { first, others } = goersLine(e.goers.map((g) => g.name), e.going);
  const answer = async (a: RsvpAnswer) => {
    setBusy(true); setError(null);
    const next = e.my_answer === a ? null : a;
    try {
      await rsvp(e.event_id, next);
      await invalidate();
    } catch (err) {
      const msg = (err as { message?: string })?.message;
      setError(msg === "event_full" ? t("flock.events.full", "This one's full") : t("flock.events.rsvpError", "We couldn't save that. Try again."));
    } finally { setBusy(false); }
  };
  const addToCalendar = () => {
    const where = e.mode === "online" ? (e.online_url ?? t("flock.events.online", "Online")) : [e.place_name, e.address].filter(Boolean).join(", ");
    downloadIcs(`${e.title.replace(/[^\w-]+/g, "-").slice(0, 40) || "event"}.ics`,
      eventIcs({ id: e.event_id, title: e.title, starts_at: e.starts_at, ends_at: e.ends_at, description: e.description, location: where || null, url: e.online_url }));
  };

  return (
    <FlockSubPage title={e.title} line={t("flock.events.chapterLine", "{{name}} chapter", { name: e.region_name ?? "" })} fallback="/flock/chapter"
      right={e.can_manage ? (
        <Link to="/flock/events/new" search={{ edit: e.event_id }} className="min-h-[44px] content-center rounded-full px-4 text-[14px] font-[700]"
          style={{ background: K.lime, color: K.forest }} data-testid="edit-event">{t("flock.events.edit", "Edit")}</Link>
      ) : undefined}>
      <div className="flex flex-col gap-3" data-testid="event-page">
        {photo && (
          <div className="relative aspect-[16/9] overflow-hidden rounded-[18px]" style={{ background: K.mist }}>
            <img src={photo} alt="" className="absolute inset-0 size-full object-cover" />
          </div>
        )}
        {(status || e.kind === "volunteer" || e.mode === "online") && (
          <div className="flex flex-wrap gap-1.5">
            {e.mode === "online" && <Tag tone="online">{t("flock.events.online", "Online")}</Tag>}
            {e.kind === "volunteer" && <Tag tone="good">{t("flock.space.good", "Do good")}</Tag>}
            {status && <Tag tone="status">{status}</Tag>}
          </div>
        )}
        {e.status === "cancelled" && (
          <p className="m-0 rounded-[14px] p-3 text-[15px] font-[700]" style={{ background: "#fbe9e7", color: K.red }}>{t("flock.events.cancelledLine", "This event was cancelled.")}</p>
        )}
        {e.review_note && e.status !== "live" && (
          <p className="m-0 rounded-[14px] p-3 text-[14px]" style={{ background: K.amberBg, color: K.amberText }} data-testid="event-review-note">{e.review_note}</p>
        )}
        <section className="flex flex-col gap-2.5 rounded-[18px] bg-white p-4" style={{ color: K.forest }}>
          <p className="m-0 flex items-start gap-2.5 text-[15px] font-[700]" data-testid="event-when">
            <CalendarDays className="mt-0.5 size-5 shrink-0" aria-hidden="true" />{longWhen(e.starts_at, e.ends_at, i18n.language)}
          </p>
          {e.mode === "in_person" ? (
            <p className="m-0 flex items-start gap-2.5 text-[15px]" data-testid="event-where">
              <MapPin className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
              <span><b>{e.place_name}</b>{e.address ? <><br /><span style={{ color: K.quiet }}>{e.address}</span></> : null}</span>
            </p>
          ) : e.online_url ? (
            <a href={e.online_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2.5 text-[15px] font-[700] underline underline-offset-4"
              style={{ color: K.moss }} data-testid="event-link">
              <Link2 className="size-5 shrink-0" aria-hidden="true" />{t("flock.events.join", "Join online")}
            </a>
          ) : (
            <p className="m-0 flex items-start gap-2.5 text-[14px]" style={{ color: K.quiet }} data-testid="event-link-hidden">
              <Link2 className="mt-0.5 size-5 shrink-0" aria-hidden="true" />{t("flock.events.linkLater", "The link appears once you say you're going.")}
            </p>
          )}
          {e.description && <p className="m-0 whitespace-pre-wrap text-[15px] leading-[1.5]" style={{ color: K.ink }}>{e.description}</p>}
          {e.mode === "in_person" && (
            <p className="m-0 flex gap-2.5 rounded-[12px] p-3 text-[13.5px] leading-[1.45]" style={{ background: K.mist, color: K.ink }} data-testid="safety-note">
              <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {t("flock.events.safety", "Please meet in public places, and leave birds at home unless the host says they're welcome.")}
            </p>
          )}
        </section>
        {e.going > 0 && (
          <section className="flex items-center gap-3 rounded-[18px] bg-white p-4" data-testid="event-goers">
            <span className="flex">
              {e.goers.map((g, i) => (
                <span key={g.user_id} style={{ marginLeft: i ? -10 : 0 }}><FlockAvatar name={g.name} url={g.photo_path ? avatars?.get(g.photo_path) : null} size={34} ring="#fff" /></span>
              ))}
            </span>
            <span className="text-[14px]" style={{ color: K.ink }}>
              {others > 0
                ? t("flock.events.goersOthers", "{{names}}, and {{count}} others going", { names: first.join(", "), count: others })
                : first.length === 2 ? t("flock.events.goersTwo", "{{a}} and {{b}} going", { a: first[0], b: first[1] })
                : t("flock.events.goersOne", "{{name}} is going", { name: first[0] })}
            </span>
          </section>
        )}
        {e.host_name && (
          <p className="m-0 px-1 text-[14px]" style={{ color: K.ink }} data-testid="event-host">
            {e.host_is_lead
              ? t("flock.events.hostedLead", "Hosted by {{name}}, chapter lead", { name: e.host_name })
              : t("flock.events.hosted", "Hosted by {{name}}", { name: e.host_name })}
          </p>
        )}
        {live && (
          <section className="flex flex-col gap-2" data-testid="rsvp">
            {full ? (
              <p className="m-0 rounded-[14px] p-3 text-center text-[15px] font-[700]" style={{ background: K.mist, color: K.forest }} data-testid="event-full">
                {t("flock.events.full", "This one's full")}
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {(["going", "maybe"] as const).map((a) => (
                  <button key={a} type="button" disabled={busy} aria-pressed={e.my_answer === a} onClick={() => void answer(a)} data-answer={a}
                    className="min-h-[52px] rounded-full text-[16px] font-[700] disabled:opacity-60"
                    style={e.my_answer === a ? { background: K.forest, color: "#fff" } : a === "going" ? { background: K.lime, color: K.forest } : { background: "#fff", color: K.forest, border: `2px solid ${K.forest}` }}>
                    {a === "going" ? t("flock.events.imGoing", "I'm going") : t("flock.events.maybe", "Maybe")}
                  </button>
                ))}
              </div>
            )}
            {e.my_answer === "going" ? (
              <button type="button" onClick={addToCalendar} data-testid="add-to-calendar"
                className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full border px-5 text-[15px] font-[700]" style={{ borderColor: "#c9d3c8", color: K.forest, background: "#fff" }}>
                <CalendarCheck className="size-5" aria-hidden="true" />{t("flock.events.addToCalendar", "Add to calendar")}
              </button>
            ) : !full && (
              <p className="m-0 text-center text-[13px]" style={{ color: K.quiet }}>{t("flock.events.goingHint", "Adds it to your calendar and sends a reminder the day before.")}</p>
            )}
            {e.my_answer === "going" && (
              <p className="m-0 text-center text-[13px]" style={{ color: K.quiet }} data-testid="reminder-line">{t("flock.events.reminderLine", "We'll remind you the day before.")}</p>
            )}
            {error && <p role="alert" className="m-0 text-center text-[14px]" style={{ color: K.red }}>{error}</p>}
          </section>
        )}
        {e.can_manage && e.status === "live" && (
          <button type="button" onClick={() => setCancelling(true)} className="min-h-[48px] text-[15px] font-[700]" style={{ color: K.red }} data-testid="cancel-event">
            {t("flock.events.cancel", "Cancel event")}
          </button>
        )}
      </div>
      {cancelling && (
        <ConfirmSheet busy={busy} onClose={() => setCancelling(false)}
          title={t("flock.events.cancelTitle", "Cancel this event?")}
          line={t("flock.events.cancelLine", "Everyone who said they're going (or maybe) gets a notice.")}
          confirm={t("flock.events.cancelConfirm", "Cancel event")}
          onConfirm={async () => {
            setBusy(true);
            try { await cancelEvent(e.event_id, note); await invalidate(); setCancelling(false); void navigate({ to: "/flock/chapter", search: { tab: "events" } }); }
            finally { setBusy(false); }
          }}
          extra={(
            <label className="mt-3 flex flex-col gap-1.5 text-[14px] font-[700]" style={{ color: K.forest }}>
              {t("flock.events.cancelNote", "A note for everyone going (optional)")}
              <textarea value={note} maxLength={1000} rows={3} onChange={(ev) => setNote(ev.target.value)} data-testid="cancel-note"
                className="resize-none rounded-[14px] border p-3 text-[15px] font-normal outline-none" style={{ borderColor: "#c9d3c8" }} />
            </label>
          )} />
      )}
    </FlockSubPage>
  );
}

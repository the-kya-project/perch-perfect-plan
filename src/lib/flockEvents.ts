// Chapter events (Community, step 5A): data and the pure helpers
// (calendar file, date lines) that scripts/flock-shell.test.ts pins. Reads and
// writes go through database functions (20261108130000_flock_chapter_events.sql).
// Flock code only.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getFlockEventPhoto } from "@/lib/flockPostMedia.functions";

const sb = supabase as any;
function must<T>(r: { data: T; error: unknown }): T {
  if (r.error) throw r.error;
  return r.data;
}
const asArray = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

export type EventKind = "meetup" | "volunteer";
export type EventMode = "in_person" | "online";
export type EventStatus = "pending" | "changes_requested" | "declined" | "live" | "cancelled";
export type RsvpAnswer = "going" | "maybe";

export type EventCardRow = {
  event_id: string; kind: EventKind; title: string; starts_at: string; ends_at: string | null; mode: EventMode; place_name: string | null;
  status: EventStatus; spot_limit: number | null; going: number; maybe: number; my_answer: RsvpAnswer | null; has_photo: boolean; is_mine: boolean;
};
export type Goer = { user_id: string; name: string; photo_path: string | null };
export type EventDetail = EventCardRow & {
  region_slug: string; region_name: string | null; description: string | null; address: string | null; online_url: string | null;
  review_note: string | null; host_id: string | null; host_name: string | null; host_is_lead: boolean; goers: Goer[]; can_manage: boolean;
};
export type EventRules = { region_slug: string | null; region_name: string | null; member_count: number; in_person_min: number; in_person_open: boolean; can_manage: boolean };

export const eventKeys = {
  list: (when: string) => ["flock", "events", "list", when] as const,
  one: (id: string) => ["flock", "events", "one", id] as const,
  rules: ["flock", "events", "rules"] as const,
};

export function useChapterEvents(when: "upcoming" | "past", enabled = true) {
  return useQuery({
    queryKey: eventKeys.list(when),
    enabled,
    staleTime: 30_000,
    queryFn: async (): Promise<EventCardRow[]> => asArray<EventCardRow>(must(await sb.rpc("flock_chapter_events", { p_when: when }))),
  });
}

export function useEvent(id: string) {
  return useQuery({
    queryKey: eventKeys.one(id),
    enabled: !!id,
    staleTime: 15_000,
    queryFn: async (): Promise<EventDetail | null> => {
      const row = asArray<EventDetail>(must(await sb.rpc("flock_event", { p_event_id: id })))[0];
      return row ? { ...row, goers: asArray<Goer>(row.goers) } : null;
    },
  });
}

export function useEventPhoto(id: string, enabled: boolean) {
  return useQuery({
    queryKey: ["flock", "events", "photo", id] as const,
    enabled: !!id && enabled,
    staleTime: 30 * 60_000,
    queryFn: async (): Promise<string | null> => getFlockEventPhoto({ data: { eventId: id, width: 900 } }),
  });
}

export function useEventRules() {
  return useQuery({
    queryKey: eventKeys.rules,
    staleTime: 60_000,
    queryFn: async (): Promise<EventRules | null> => asArray<EventRules>(must(await sb.rpc("flock_event_rules")))[0] ?? null,
  });
}

export async function rsvp(id: string, answer: RsvpAnswer | null): Promise<void> {
  must(await sb.rpc("flock_event_rsvp", { p_event_id: id, p_answer: answer }));
}

export type EventDraft = {
  id: string | null; kind: EventKind; title: string; startsAt: string; endsAt: string | null; mode: EventMode;
  placeName: string; address: string; onlineUrl: string; description: string; iHost: boolean; spotLimit: number | null; region: string | null;
  photoPath: string | null;
};
export async function suggestEvent(d: EventDraft): Promise<string> {
  return must(await sb.rpc("flock_event_suggest", {
    p_id: d.id, p_kind: "meetup", p_title: d.title, p_starts_at: d.startsAt, p_ends_at: d.endsAt, p_mode: d.mode,
    p_place_name: d.placeName, p_address: d.address, p_online_url: d.onlineUrl, p_description: d.description, p_i_host: d.iHost,
  })) as string;
}
export async function saveEvent(d: EventDraft): Promise<string> {
  return must(await sb.rpc("flock_event_save", {
    p_id: d.id, p_region: d.region, p_kind: d.kind, p_title: d.title, p_starts_at: d.startsAt, p_ends_at: d.endsAt, p_mode: d.mode,
    p_place_name: d.placeName, p_address: d.address, p_online_url: d.onlineUrl, p_description: d.description,
    p_host_id: null, p_spot_limit: d.kind === "volunteer" ? d.spotLimit : null, p_photo_path: d.photoPath,
  })) as string;
}
export async function cancelEvent(id: string, note: string): Promise<void> {
  must(await sb.rpc("flock_event_cancel", { p_event_id: id, p_note: note.trim() || null }));
}

export function useInvalidateEvents() {
  const qc = useQueryClient();
  return () => Promise.all([
    qc.invalidateQueries({ queryKey: ["flock", "events"] }),
    qc.invalidateQueries({ queryKey: ["flock", "review"] }),
  ]);
}

// ---- Pure helpers -----------------------------------------------------------------------

/** The event's "Nov" / "8" date block, in the viewer's time zone. */
export function dateBlock(iso: string, lang: string, timeZone?: string): { month: string; day: string } {
  const d = new Date(iso);
  return {
    month: d.toLocaleDateString(lang, { month: "short", timeZone }),
    day: d.toLocaleDateString(lang, { day: "numeric", timeZone }),
  };
}

/** "Sat 1–3pm", "Tue 7pm", "Sat 10:30am–12pm" in the viewer's time zone. */
export function shortWhen(startIso: string, endIso: string | null, lang: string, timeZone?: string): string {
  const s = new Date(startIso);
  const day = s.toLocaleDateString(lang, { weekday: "short", timeZone });
  const t = (d: Date) => d.toLocaleTimeString(lang, { hour: "numeric", minute: "2-digit", timeZone })
    .replace(/:00/, "").replace(/\s?([AP])M/i, (_, m: string) => `${m.toLowerCase()}m`);
  if (!endIso) return `${day} ${t(s)}`;
  const e = new Date(endIso);
  const a = t(s); const b = t(e);
  // "1pm–3pm" reads as "1–3pm" when both are in the same half of the day.
  const same = a.slice(-2) === b.slice(-2) && /[ap]m$/.test(a);
  return `${day} ${same ? a.slice(0, -2) : a}–${b}`;
}

/** "Saturday, Nov 8 · 1–3pm" for the event page. */
export function longWhen(startIso: string, endIso: string | null, lang: string, timeZone?: string): string {
  const s = new Date(startIso);
  const date = s.toLocaleDateString(lang, { weekday: "long", month: "short", day: "numeric", timeZone });
  const time = shortWhen(startIso, endIso, lang, timeZone).replace(/^\S+\s/, "");
  return `${date} · ${time}`;
}

/** "Priya, Alex, and 12 others going": first names of up to two goers. */
export function goersLine(names: string[], total: number): { first: string[]; others: number } {
  const first = names.slice(0, 2).map((n) => n.trim().split(/\s+/)[0]).filter(Boolean);
  return { first, others: Math.max(0, total - first.length) };
}

function icsEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/([,;])/g, "\\$1");
}
function icsDate(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}
/** A one-event calendar file (.ics). Times in UTC; ends 2 hours after the
 *  start when no end is set. Lines folded at 75 octets per RFC 5545. */
export function eventIcs(e: { id: string; title: string; starts_at: string; ends_at: string | null; description: string | null;
  location: string | null; url: string | null }, now: Date = new Date()): string {
  const end = e.ends_at ?? new Date(new Date(e.starts_at).getTime() + 2 * 3_600_000).toISOString();
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//The Kya Project//Kya & Co.//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${e.id}@thekyaproject.com`,
    `DTSTAMP:${icsDate(now.toISOString())}`,
    `DTSTART:${icsDate(e.starts_at)}`,
    `DTEND:${icsDate(end)}`,
    `SUMMARY:${icsEscape(e.title)}`,
    ...(e.location ? [`LOCATION:${icsEscape(e.location)}`] : []),
    ...(e.description ? [`DESCRIPTION:${icsEscape(e.description)}`] : []),
    ...(e.url ? [`URL:${e.url}`] : []),
    "END:VEVENT", "END:VCALENDAR",
  ];
  const fold = (l: string) => {
    const out: string[] = [];
    let rest = l;
    while (new TextEncoder().encode(rest).length > 75) {
      let cut = 75;
      while (new TextEncoder().encode(rest.slice(0, cut)).length > 75) cut--;
      out.push(rest.slice(0, cut));
      rest = ` ${rest.slice(cut)}`;
    }
    out.push(rest);
    return out.join("\r\n");
  };
  return `${lines.map(fold).join("\r\n")}\r\n`;
}

/** Save the .ics through the browser. */
export function downloadIcs(filename: string, ics: string): void {
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

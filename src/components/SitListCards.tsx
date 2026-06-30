// Redesigned Sits-page cards: three distinct treatments for the three sit
// states. These are presentational — the page resolves caregiver names and
// past-sit scan counts in batch and passes them in. (The older SitCard stays
// in the bird plan editor; this file is only the Sits tab list.)
import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Activity, Eye, Link2, Home, ChevronDown, Pencil, Star } from "lucide-react";
import { compactRange, monthDay, durationDays, daysUntil } from "@/lib/dates";
import { copySitterLink } from "@/lib/sitLink";
import { SitForm } from "@/components/SitForm";
import { SitChecklist } from "@/components/SitChecklist";
import { BirdPhotoCrop } from "@/components/BirdPhotoCrop";

export type SitBird = { id: string; name: string; photo_url?: string | null; photo_original?: string | null; photo_position?: string | null };
export type ListSit = {
  id: string;
  start_date: string;
  end_date: string;
  sitter_name?: string | null;
  caregiver_user_id?: string | null;
  lead_user_id?: string | null;
  owner_id?: string | null;
  invite_token?: string | null;
  revoked?: boolean;
  marked_ready_at?: string | null;
};

// "IN CHARGE · [name]" content-label eyebrow. Teal per surface: bright --teal on
// the ink active card, darker --teal-on-cream on cream cards.
function InChargeEyebrow({ name, onDark }: { name: string; onDark?: boolean }) {
  return (
    <p className="mt-1">
      <span className="t-eyebrow" style={{ color: onDark ? "var(--teal)" : "var(--teal-on-cream)" }}>In charge · </span>
      <span className="t-eyebrow" style={{ color: onDark ? "rgba(255,255,255,0.85)" : "var(--ink)" }}>{name}</span>
    </p>
  );
}

/** "Sarah" -> "Sarah's", "Chris" -> "Chris'". */
function possessive(name: string): string {
  const n = name.trim();
  return /s$/i.test(n) ? `${n}'` : `${n}'s`;
}

export type SitContextTag = { kind: "own" | "household"; ownerName?: string | null };

// Whose-birds context tag — mirrors the flock grouping / MemberContextBanner
// language and colors: "Your birds" (moss) vs "[Owner]'s household" (house-blue).
// The page only passes this when the user has sits in BOTH contexts.
function ContextTag({ tag, onDark }: { tag: SitContextTag; onDark?: boolean }) {
  if (tag.kind === "own") {
    return (
      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-[500] ${onDark ? "bg-white/12 text-[var(--lime)]" : "bg-[var(--pale2)] text-[var(--moss)]"}`}>
        Your birds
      </span>
    );
  }
  const label = tag.ownerName ? `${possessive(tag.ownerName)} household` : "A household you help with";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-[500] ${onDark ? "bg-white/12 text-[#bcd9e6]" : "bg-[#dbe9ef] text-[var(--house)]"}`}>
      <Home className="size-3" /> {label}
    </span>
  );
}

// "You're in charge" — the strongest marker on the card; lime action treatment.
// Shown when the signed-in user is the sit's lead (lead_user_id === me).
function IAmLeadPill() {
  return (
    <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-[var(--lime)] px-2 py-0.5 text-[11.5px] font-[600] text-[var(--ink)]">
      <Star className="size-3" /> You're in charge
    </span>
  );
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

// Caregiver avatar — lime circle with initials for a sitter, cream2 house tile
// for a household caregiver.
function CaregiverAvatar({ name, household, size = 44 }: { name: string; household: boolean; size?: number }) {
  if (household) {
    return (
      <span className="grid shrink-0 place-items-center rounded-full bg-[var(--cream2)]" style={{ width: size, height: size, color: "var(--house)" }}>
        <Home className="size-5" />
      </span>
    );
  }
  return (
    <span className="grid shrink-0 place-items-center rounded-full bg-[var(--lime)] text-[14px] font-[600] text-[var(--ink)]" style={{ width: size, height: size }}>
      {initialsOf(name)}
    </span>
  );
}

function HouseholdTag() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[var(--cream2)] px-1.5 py-0.5 text-[10px] font-[500]" style={{ color: "var(--house)" }}>
      <Home className="size-3" /> Household
    </span>
  );
}

// A small bird chip: avatar dot + name. `onDark` flips the chip surface for the
// ink active card.
function BirdChip({ bird, onDark }: { bird: SitBird; onDark?: boolean }) {
  const initial = (bird.name?.slice(0, 1) ?? "?").toUpperCase();
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full py-0.5 pl-0.5 pr-2 text-[12.5px] ${
        onDark ? "bg-white/12 text-white" : "bg-[var(--cream2)] text-[var(--ink)]"
      }`}
    >
      <span className="relative grid size-[18px] shrink-0 place-items-center overflow-hidden rounded-full bg-[var(--moss)] text-[9px] font-[600] text-white">
        {bird.photo_url ? (
          <BirdPhotoCrop url={bird.photo_url} original={bird.photo_original} position={bird.photo_position ?? "50% 20%"} alt="" />
        ) : (
          initial
        )}
      </span>
      {bird.name}
    </span>
  );
}

function BirdChips({ birds, allBirdsCount, onDark }: { birds: SitBird[]; allBirdsCount: number; onDark?: boolean }) {
  // If the sit covers every bird, one "All birds" chip reads cleaner.
  if (allBirdsCount > 0 && birds.length === allBirdsCount && allBirdsCount > 1) {
    return (
      <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[12.5px] ${onDark ? "bg-white/12 text-white" : "bg-[var(--cream2)] text-[var(--ink)]"}`}>
        All birds
      </span>
    );
  }
  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      {birds.map((b) => <BirdChip key={b.id} bird={b} onDark={onDark} />)}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ACTIVE — full ink card, the focal element.
// ---------------------------------------------------------------------------
export function ActiveSitCard({ sit, birds, allBirdsCount, caregiverName, leadName, iAmLead, contextTag, allBirds, onChange }: { sit: ListSit; birds: SitBird[]; allBirdsCount: number; caregiverName: string; leadName?: string | null; iAmLead?: boolean; contextTag?: SitContextTag; allBirds?: any[]; onChange?: () => void }) {
  const [editing, setEditing] = useState(false);
  if (editing && allBirds) {
    return <SitForm birds={allBirds} editSit={sit as any} onSaved={onChange ?? (() => {})} onCancel={() => setEditing(false)} />;
  }
  const household = !!sit.caregiver_user_id;
  const dayOf = -daysUntil(sit.start_date) + 1;
  const total = durationDays(sit.start_date, sit.end_date);
  const meta = household ? "Caregiver during trip" : `Sitter · day ${dayOf} of ${total}`;
  // Surface the per-trip link on an ACTIVE sit so the owner can re-send it if the
  // sitter loses it. Only external link-covered sits have a link, and only while
  // it's live (not revoked); the token persists for the trip, so an active sit's
  // link is valid. Household sits have no external link. Reuses the existing token.
  const showCopyLink = !household && !sit.revoked && !!sit.invite_token;

  return (
    <div className="rounded-[20px] bg-[var(--ink)] p-4 text-white shadow-[0_12px_28px_-14px_rgba(20,40,30,0.6)]">
      <div className="flex items-center gap-3">
        <CaregiverAvatar name={caregiverName} household={household} />
        <div className="min-w-0 flex-1">
          {contextTag && <div className="mb-1"><ContextTag tag={contextTag} onDark /></div>}
          <div className="flex items-center gap-2">
            <p className="truncate text-[15px] font-[500] text-white">{caregiverName}</p>
            {household && <HouseholdTag />}
          </div>
          <p className="mt-0.5 text-[12.5px] text-white/65">{meta}</p>
          {iAmLead ? <IAmLeadPill /> : leadName ? <InChargeEyebrow name={leadName} onDark /> : null}
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[var(--lime)] px-2.5 py-1 text-[11.5px] font-[500] text-[var(--ink)]">
          <span className="size-1.5 rounded-full bg-[var(--ink)]" /> Active
        </span>
      </div>

      <div className="mt-3 space-y-2.5 border-t border-white/15 pt-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[12.5px] text-white/65">Dates</span>
          <span className="text-[13.5px] text-white">{monthDay(sit.start_date)} → {monthDay(sit.end_date)}</span>
        </div>
        {birds.length > 0 && (
          <div className="flex items-start justify-between gap-3">
            <span className="pt-1 text-[12.5px] text-white/65">Birds</span>
            <div className="min-w-0"><BirdChips birds={birds} allBirdsCount={allBirdsCount} onDark /></div>
          </div>
        )}
      </div>

      <div className="mt-3.5 flex gap-2">
        <Link
          to="/scans"
          search={{ sitId: sit.id }}
          className="inline-flex min-h-[42px] flex-1 items-center justify-center gap-1.5 rounded-[12px] bg-[var(--lime)] text-[14px] font-[500] text-[var(--ink)] active:scale-[0.99]"
        >
          <Activity className="size-4" /> View scans
        </Link>
        <Link
          to="/sit-preview/$sitId"
          params={{ sitId: sit.id }}
          state={{ previewToken: sit.invite_token ?? null, previewLabel: caregiverName, previewHousehold: household } as any}
          className="inline-flex min-h-[42px] flex-1 items-center justify-center gap-1.5 rounded-[12px] border border-white/35 text-[14px] font-[500] text-white active:scale-[0.99]"
        >
          <Eye className="size-4" /> {household ? "View as caregiver" : "View as sitter"}
        </Link>
      </div>

      {(showCopyLink || allBirds) && (
        <div className="mt-2.5 flex items-center justify-center gap-4">
          {showCopyLink && (
            <button type="button" onClick={() => copySitterLink(sit, birds)} className="inline-flex items-center gap-1 text-[13px] font-[500] text-white/60 active:opacity-80">
              <Link2 className="size-3.5" /> Copy link
            </button>
          )}
          {allBirds && (
            <button type="button" onClick={() => setEditing(true)} className="inline-flex items-center gap-1 text-[13px] font-[500] text-white/60 active:opacity-80">
              <Pencil className="size-3.5" /> Edit sit
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// UPCOMING — white card. First one is expanded; the rest collapse to a header.
// ---------------------------------------------------------------------------
export function UpcomingSitCard({
  sit, birds, allBirdsCount, caregiverName, leadName, iAmLead, contextTag, collapsible = false, allBirds, onChange,
}: { sit: ListSit; birds: SitBird[]; allBirdsCount: number; caregiverName: string; leadName?: string | null; iAmLead?: boolean; contextTag?: SitContextTag; collapsible?: boolean; allBirds?: any[]; onChange?: () => void }) {
  const household = !!sit.caregiver_user_id;
  const [open, setOpen] = useState(!collapsible);
  const [editing, setEditing] = useState(false);

  if (editing && allBirds) {
    return <SitForm birds={allBirds} editSit={sit as any} onSaved={onChange ?? (() => {})} onCancel={() => setEditing(false)} />;
  }

  return (
    <div className="rounded-[16px] border border-[var(--line)] bg-white p-4">
      <button
        type="button"
        onClick={collapsible ? () => setOpen((v) => !v) : undefined}
        className={`flex w-full items-center gap-3 text-left ${collapsible ? "active:opacity-80" : "cursor-default"}`}
      >
        <CaregiverAvatar name={caregiverName} household={household} />
        <div className="min-w-0 flex-1">
          {contextTag && <div className="mb-1"><ContextTag tag={contextTag} /></div>}
          <div className="flex items-center gap-2">
            <p className="truncate text-[15px] font-[500] text-[var(--ink)]">{caregiverName}</p>
            {household && <HouseholdTag />}
          </div>
          <p className="mt-0.5 text-[12.5px] text-[var(--mute)]">{household ? "Caregiver during trip" : "Sitter"}</p>
          {iAmLead ? <IAmLeadPill /> : leadName ? <InChargeEyebrow name={leadName} /> : null}
        </div>
        <span className="inline-flex shrink-0 items-center rounded-full border border-[var(--line)] bg-[var(--cream2)] px-2.5 py-1 text-[11.5px] font-[500] text-[var(--ink)]">
          {compactRange(sit.start_date, sit.end_date)}
        </span>
        {collapsible && <ChevronDown className={`size-4 shrink-0 text-[var(--mute2)] transition-transform ${open ? "rotate-180" : ""}`} />}
      </button>

      {open && (
        <>
          {birds.length > 0 && (
            <div className="mt-3 flex items-start justify-between gap-3 border-t border-[var(--line2)] pt-3">
              <span className="pt-1 text-[12.5px] text-[var(--mute)]">Birds</span>
              <div className="min-w-0"><BirdChips birds={birds} allBirdsCount={allBirdsCount} /></div>
            </div>
          )}
          {/* Pre-leaving checklist (collapsible, self-contained). */}
          <SitChecklist sit={sit as any} birds={birds} onSitChanged={onChange} />

          <div className="mt-3.5 flex gap-2">
            <Link
              to="/sit-preview/$sitId"
              params={{ sitId: sit.id }}
              state={{ previewToken: sit.invite_token ?? null, previewLabel: caregiverName, previewHousehold: household } as any}
              className="inline-flex min-h-[42px] flex-1 items-center justify-center gap-1.5 rounded-[12px] border border-[var(--line)] text-[14px] font-[500] text-[var(--ink)] active:scale-[0.99]"
            >
              <Eye className="size-4" /> {household ? "View as caregiver" : "View as sitter"}
            </Link>
            {!household && (
              <button
                type="button"
                onClick={() => copySitterLink(sit, birds)}
                className="inline-flex min-h-[42px] flex-1 items-center justify-center gap-1.5 rounded-[12px] border border-[var(--line)] text-[14px] font-[500] text-[var(--ink)] active:scale-[0.99]"
              >
                <Link2 className="size-4" /> Copy link
              </button>
            )}
          </div>

          {allBirds && (
            <div className="mt-2.5 text-center">
              <button type="button" onClick={() => setEditing(true)} className="inline-flex items-center gap-1 text-[13px] font-[500] text-[var(--moss)] active:opacity-80">
                <Pencil className="size-3.5" /> Edit sit
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PAST — cream2 archival card. No actions; the whole card opens the archive.
// ---------------------------------------------------------------------------
export function PastSitCard({
  sit, caregiverName, leadName, scans, flagged,
}: { sit: ListSit; caregiverName: string; leadName?: string | null; scans: number; flagged: number }) {
  const navigate = useNavigate();
  const household = !!sit.caregiver_user_id;
  const days = durationDays(sit.start_date, sit.end_date);
  const meta = `${compactRange(sit.start_date, sit.end_date)} · ${days} ${days === 1 ? "day" : "days"}`;

  return (
    <button
      type="button"
      onClick={() => navigate({ to: "/sits/$sitId", params: { sitId: sit.id } })}
      className="w-full rounded-[16px] border border-[var(--line)] bg-[var(--cream2)]/70 p-4 text-left active:scale-[0.995]"
    >
      <div className="flex items-center gap-3">
        <CaregiverAvatar name={caregiverName} household={household} size={40} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-[15px] font-[500] text-[var(--ink)]">{caregiverName}</p>
            {household && <HouseholdTag />}
          </div>
          <p className="mt-0.5 text-[12.5px] text-[var(--mute)]">{meta}</p>
          {leadName && <InChargeEyebrow name={leadName} />}
        </div>
        <span className="inline-flex shrink-0 items-center rounded-full border border-[var(--line)] px-2.5 py-1 text-[11.5px] font-[500] text-[var(--mute)]">
          Past
        </span>
      </div>
      {scans > 0 && (
        <div className="mt-3 flex items-center justify-between gap-3 border-t border-[var(--line2)] pt-3">
          <span className="text-[12.5px] text-[var(--mute)]">Scans</span>
          <span className="text-[13.5px] text-[var(--ink)]">
            {scans} {scans === 1 ? "scan" : "scans"} · {flagged > 0 ? `${flagged} flagged` : "all clear"}
          </span>
        </div>
      )}
    </button>
  );
}

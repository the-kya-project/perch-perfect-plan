// "Set up a sit" / "Edit sit" on the iPhone Duo (two panes, lib/duo.ts). The
// left half (forest) is where you choose: a month calendar for the dates, with
// the other sits marked, and the birds. The right half shows the sit taking
// shape: who's covering, whether each bird's care plan and the emergency info
// are ready, and the one main button. State, validation, submit, the leave
// guard and the local draft are the phone form's own (useSitForm), so both
// layouts behave the same.
import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Check, ChevronLeft, ChevronRight, Home, Mail } from "lucide-react";
import { getLocalUser } from "@/integrations/supabase/currentUser";
import { RailClose } from "@/components/DuoRail";
import { K, KyaLink, SERIF } from "@/components/kya";
import { BirdPhotoCrop } from "@/components/BirdPhotoCrop";
import { SitGapsSheet, SitterFields, gapLabel, useSitForm, type SitFormProps, type SitFormState } from "@/components/SitForm";
import { DUO, DuoMainButton, DuoTwoPane, PopOutCard, StatusPill } from "@/components/duo/DuoBlocks";
import { fetchSitsFull } from "@/components/duo/sits/sitsData";
import { getSitReadiness, type SitGapSection } from "@/lib/household.functions";
import { resolveHouseholdNames } from "@/lib/home.functions";
import { memberDisplayName, memberInitials } from "@/lib/memberDisplay";
import { useBirdPhotos } from "@/lib/useBirdPhotos";
import { birdNames } from "@/lib/birdNames";
import { durationDays, formatLocalDate } from "@/lib/dates";
import { localDateISO } from "@/lib/localDay";
import { rangeTo } from "@/lib/sitText";
import { BIRD_PHOTO_FOCUS } from "@/lib/birdPhotoFocus";

const FIELD = "min-h-[52px] w-full rounded-[16px] border-2 bg-white px-4 text-[16px] outline-none focus:border-[#2d6a4f]";

export function SitFormDuo(props: SitFormProps) {
  const f = useSitForm(props);
  const { t, editing, birds, selected, start, end, title, saving, gaps, submit, submitLabel, rootRef, requestClose, guard } = f;

  // Every sit (same ["sits-full"] rows as the Sits tab), for the calendar's
  // marks and the sitters who covered before.
  const { data: sits = [] } = useQuery({ queryKey: ["sits-full"], queryFn: fetchSitsFull });
  const { data: myId } = useQuery({
    queryKey: ["me-id"],
    queryFn: async () => (await getLocalUser()).data.user?.id ?? null,
  });
  const personIds = [...new Set((sits as any[]).map((s) => s.caregiver_user_id).filter(Boolean) as string[])];
  const resolveNames = useServerFn(resolveHouseholdNames);
  const { data: nameMap = {} } = useQuery({
    queryKey: ["sit-person-names", personIds.slice().sort().join(",")],
    enabled: personIds.length > 0,
    staleTime: 5 * 60_000,
    queryFn: () => resolveNames({ data: { userIds: personIds } }),
  });
  const nameOf = (s: any): string =>
    s.caregiver_user_id ? memberDisplayName((nameMap as Record<string, any>)[s.caregiver_user_id]) : (s.sitter_name?.trim() || s.sitter_email || t("sits.yourSitter", "Your sitter"));
  const others = (sits as any[])
    .filter((s) => !s.revoked && s.id !== props.editSit?.id)
    .map((s) => ({ id: s.id as string, start: s.start_date as string, end: s.end_date as string, name: firstWord(nameOf(s)) }));

  const photoOf = useBirdPhotos(birds.map((b: any) => b.photo_url), 800);
  const days = start && end && end >= start ? durationDays(start, end) : 0;
  const eyebrow = [
    title.trim() || (editing ? t("sitForm.editSit", "Edit sit") : t("sitsDuo.newSit", "New sit")),
    days ? t("sitCards.dayCount", "{{count}} days", { count: days }) : null,
  ].filter(Boolean).join(" · ");
  const heading = start && end && end >= start
    ? rangeTo(t, start, end)
    : start
      ? t("sitsDuo.pickLastDay", "Now pick the last day")
      : t("sitsDuo.pickDates", "Pick your dates");

  const pickDate = (d: string) => {
    if (!start || end) { f.setStart(d); f.setEnd(""); }
    else if (d < start) f.setStart(d);
    else f.setEnd(d);
  };

  const left = (
    <>
      <RailClose onClose={requestClose} />
      <h1 className="m-0 text-[30px] font-[600] leading-tight text-white" style={{ fontFamily: SERIF }}>
        {editing ? t("sitForm.editSit", "Edit sit") : t("sitForm.setUpASit", "Set up a sit")}
      </h1>
      <p className="m-0 mt-1.5 text-[16px] leading-[1.45]" style={{ color: "rgba(255,255,255,0.75)" }}>
        {t("sitsDuo.calendarLine", "Tap the first day, then the last.")}
      </p>
      <div className="mt-5">
        <SitCalendar start={start} end={end} onPick={pickDate} others={others} />
      </div>

      <section className="mt-7">
        <div className="flex items-center justify-between gap-3">
          <h2 className="m-0 text-[20px] font-[700] text-white" style={{ fontFamily: SERIF }}>{t("sitForm.whichBirds", "Which birds?")}</h2>
          {birds.length > 1 && <KyaLink color="#fff" onClick={f.selectAll}>{t("sitForm.selectAll", "Select all")}</KyaLink>}
        </div>
        <div className="mt-3 flex flex-wrap gap-2.5">
          {birds.map((b: any) => {
            const on = selected.has(b.id);
            const ph = photoOf(b.photo_url);
            return (
              <button
                key={b.id}
                type="button"
                aria-pressed={on}
                onClick={() => f.toggle(b.id)}
                className="inline-flex min-h-[56px] items-center gap-2.5 rounded-full py-2 pl-2 pr-5 text-[16px] font-[700] active:scale-[0.98]"
                style={on ? { background: "#fff", color: DUO.forest } : { background: "rgba(255,255,255,0.12)", color: "#fff" }}
              >
                <span className="relative grid size-10 shrink-0 place-items-center overflow-hidden rounded-full text-[15px] font-[700]" style={{ background: on ? DUO.bg : "rgba(255,255,255,0.16)" }}>
                  {ph ? <BirdPhotoCrop url={ph.url} original={ph.original} position={b.photo_position || BIRD_PHOTO_FOCUS} alt="" /> : <span aria-hidden="true">{(b.name ?? "?").slice(0, 1).toUpperCase()}</span>}
                </span>
                {b.name}
                {on && <Check className="size-4" strokeWidth={3} aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      </section>
    </>
  );

  const right = (
    <PopOutCard
      eyebrow={eyebrow}
      title={heading}
      action={gaps ? undefined : <DuoMainButton type="submit" disabled={saving}>{submitLabel}</DuoMainButton>}
      footer={editing ? <DeleteControl f={f} /> : undefined}
    >
      <div className="flex flex-col gap-7">
        <WhoIsCovering f={f} editSit={props.editSit} sits={sits as any[]} myId={myId ?? null} nameOf={nameOf} />
        <Readiness f={f} />
        <section className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-[15px] font-[700]">{t("sitForm.nameThisSit", "Name this sit")} <span className="font-[500]" style={{ color: DUO.quiet }}>· {t("sitsDuo.optional", "optional")}</span></span>
            <input className={FIELD} style={{ borderColor: DUO.line, color: DUO.forest }} value={title} onChange={(e) => f.setTitle(e.target.value)} placeholder={t("sitForm.namePlaceholder", "e.g. Thanksgiving trip")} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[15px] font-[700]">
              {f.coverName
                ? t("sitForm.anythingElseName", "Anything else {{name}} should know?", { name: f.coverName })
                : t("sitForm.anythingElseSitter", "Anything else your sitter should know?")}
            </span>
            <textarea
              className="min-h-[96px] w-full rounded-[16px] border-2 bg-white px-4 py-3 text-[16px] outline-none focus:border-[#2d6a4f]"
              style={{ borderColor: DUO.line, color: DUO.forest }}
              value={f.notes}
              onChange={(e) => f.setNotes(e.target.value)}
              placeholder={t("sitForm.notesPlaceholder", "e.g. The neighbor has a spare key.")}
            />
          </label>
        </section>
      </div>
    </PopOutCard>
  );

  return (
    <form ref={rootRef} onSubmit={submit} noValidate className="contents">
      <DuoTwoPane dark left={left} right={right} leftLabel={editing ? t("sitForm.editSit", "Edit sit") : t("sitForm.setUpASit", "Set up a sit")} rightLabel={heading} />
      <SitGapsSheet f={f} />
      {guard}
    </form>
  );
}

function firstWord(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <h3 className="m-0 mb-3 text-[20px] font-[700] leading-tight" style={{ fontFamily: SERIF, color: DUO.forest }}>{children}</h3>;
}

// ---- Calendar ---------------------------------------------------------------

function isoOf(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** A month to pick the sit's first and last day. The range is highlighted,
 *  its ends in green; days another sit already covers carry a gold dot. */
function SitCalendar({ start, end, onPick, others }: {
  start: string;
  end: string;
  onPick: (iso: string) => void;
  others: { id: string; start: string; end: string; name: string }[];
}) {
  const { t, i18n } = useTranslation();
  const today = localDateISO();
  const [view, setView] = useState(() => {
    const from = start || today;
    return { y: Number(from.slice(0, 4)), m: Number(from.slice(5, 7)) - 1 };
  });
  const weekStart = i18n.language === "nl" ? 1 : 0;
  const first = new Date(view.y, view.m, 1);
  const count = new Date(view.y, view.m + 1, 0).getDate();
  const lead = (first.getDay() - weekStart + 7) % 7;
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: count }, (_, i) => isoOf(view.y, view.m, i + 1))];
  while (cells.length % 7) cells.push(null);
  // Jan 7, 2024 was a Sunday.
  const weekdays = Array.from({ length: 7 }, (_, i) => formatLocalDate(new Date(2024, 0, 7 + ((i + weekStart) % 7)), { weekday: "narrow" }));
  const monthLabel = formatLocalDate(first, { month: "long", year: "numeric" });
  const step = (n: number) => setView(({ y, m }) => { const d = new Date(y, m + n, 1); return { y: d.getFullYear(), m: d.getMonth() }; });

  const monthStart = isoOf(view.y, view.m, 1);
  const monthEnd = isoOf(view.y, view.m, count);
  const visible = others.filter((o) => o.start <= monthEnd && o.end >= monthStart).sort((a, b) => a.start.localeCompare(b.start));
  const covered = (d: string) => visible.some((o) => o.start <= d && o.end >= d);
  const hi = end && end >= start ? end : start;

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <button type="button" onClick={() => step(-1)} aria-label={t("sitsDuo.prevMonth", "Previous month")} className="grid size-12 place-items-center rounded-full active:scale-95" style={{ background: "rgba(255,255,255,0.12)", color: "#fff" }}>
          <ChevronLeft className="size-6" aria-hidden="true" />
        </button>
        <p className="m-0 text-[18px] font-[700] capitalize text-white" aria-live="polite">{monthLabel}</p>
        <button type="button" onClick={() => step(1)} aria-label={t("sitsDuo.nextMonth", "Next month")} className="grid size-12 place-items-center rounded-full active:scale-95" style={{ background: "rgba(255,255,255,0.12)", color: "#fff" }}>
          <ChevronRight className="size-6" aria-hidden="true" />
        </button>
      </div>
      <div className="mt-3 grid grid-cols-7 text-center text-[13px] font-[700] uppercase" style={{ color: "rgba(255,255,255,0.6)" }} aria-hidden="true">
        {weekdays.map((w, i) => <span key={i} className="py-1">{w}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-y-1" role="group" aria-label={monthLabel}>
        {cells.map((d, i) => {
          if (!d) return <span key={`e${i}`} />;
          const isEnd = d === start || d === hi;
          const inRange = !!start && d > start && d < hi;
          const band = inRange || (isEnd && start !== hi && !!end);
          const bandStyle = band
            ? { background: "rgba(207,233,183,0.22)", borderTopLeftRadius: d === start ? 999 : 0, borderBottomLeftRadius: d === start ? 999 : 0, borderTopRightRadius: d === hi ? 999 : 0, borderBottomRightRadius: d === hi ? 999 : 0 }
            : undefined;
          return (
            <div key={d} className="flex justify-center" style={bandStyle}>
              <button
                type="button"
                onClick={() => onPick(d)}
                aria-pressed={isEnd || inRange}
                aria-label={formatLocalDate(new Date(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10))), { weekday: "long", month: "long", day: "numeric" })}
                className="relative grid aspect-square w-full max-w-[52px] place-items-center rounded-full text-[16px] font-[700]"
                style={isEnd
                  ? { background: DUO.fineBg, color: DUO.forest }
                  : { color: "#fff", boxShadow: d === today ? "inset 0 0 0 2px rgba(255,255,255,0.55)" : undefined }}
              >
                {Number(d.slice(8, 10))}
                {covered(d) && <span aria-hidden="true" className="absolute bottom-[5px] size-1.5 rounded-full" style={{ background: "#f2b33d" }} />}
              </button>
            </div>
          );
        })}
      </div>
      {visible.length > 0 && (
        <ul className="m-0 mt-4 flex list-none flex-col gap-1.5 p-0">
          {visible.slice(0, 3).map((o) => (
            <li key={o.id} className="flex items-center gap-2.5 text-[15px]" style={{ color: "rgba(255,255,255,0.85)" }}>
              <span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{ background: "#f2b33d" }} />
              {t("sitsDuo.alreadyHas", "{{name}} already has {{range}}", { name: o.name, range: rangeTo(t, o.start, o.end) })}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---- Who's covering ---------------------------------------------------------

function CoverCard({ on, onClick, leading, title, detail }: { on: boolean; onClick?: () => void; leading: ReactNode; title: string; detail: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      onClick={onClick}
      className="flex min-h-[72px] w-full items-center gap-3.5 rounded-[20px] border-2 px-4 py-3 text-left active:scale-[0.99]"
      style={on ? { background: DUO.forest, borderColor: DUO.forest, color: "#fff" } : { background: "#fff", borderColor: DUO.line, color: DUO.forest }}
    >
      {leading}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[17px] font-[700]">{title}</span>
        <span className="block truncate text-[14px]" style={{ color: on ? "rgba(255,255,255,0.78)" : DUO.quiet }}>{detail}</span>
      </span>
      {on && <Check className="size-5 shrink-0" strokeWidth={3} aria-hidden="true" />}
    </button>
  );
}

function Initial({ name, tone }: { name: string; tone: "forest" | "lime" }) {
  return (
    <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-full text-[15px] font-[700]" style={tone === "forest" ? { background: K.paleGreen, color: K.forest } : { background: K.lime, color: K.forest }}>
      {memberInitials(name)}
    </span>
  );
}

function WhoIsCovering({ f, editSit, sits, myId, nameOf }: { f: SitFormState; editSit?: any; sits: any[]; myId: string | null; nameOf: (s: any) => string }) {
  const { t, editing, caregiverKind, householdUserId, eligibleMembers, sitterName, sitterEmail, selected, initialKind } = f;
  // A past sitter picked from the list; "Someone new" is the blank form.
  const [pickedPast, setPickedPast] = useState<string | null>(null);

  if (editing) {
    return (
      <section role="radiogroup" aria-label={t("sitForm.whosCoveringQ", "Who's covering?")}>
        <SectionTitle>{t("sitForm.whosCoveringQ", "Who's covering?")}</SectionTitle>
        <CoverCard
          on
          leading={initialKind === "household"
            ? <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-[14px]" style={{ background: K.paleGreen, color: K.forest }}><Home className="size-5" /></span>
            : <Initial name={sitterName || sitterEmail || "?"} tone="lime" />}
          title={editSit ? nameOf(editSit) : ""}
          detail={initialKind === "household" ? t("sitForm.household", "Household") : t("sitCards.sitter", "Sitter")}
        />
        <p className="m-0 mt-3 text-[14px] leading-[1.5]" style={{ color: DUO.quiet }}>
          {initialKind === "household"
            ? t("sitForm.householdAssigned", "A household member is assigned. Swapping caregiver type isn't available yet — delete this sit and create a new one to change it.")
            : t("sitForm.externalSitterHasLink", "An external sitter has the link. {{who}} is current; you can edit the name or email below.", { who: sitterName?.trim() || sitterEmail || f.theirInfo })}
        </p>
        {initialKind === "external" && (
          <div className="mt-3"><SitterFields name={sitterName} email={sitterEmail} onName={f.setSitterName} onEmail={f.setSitterEmail} /></div>
        )}
      </section>
    );
  }

  // Sitters who covered one of your sits before (by email, most recent first).
  const seen = new Set<string>();
  const pastSitters = sits
    .filter((s) => s.owner_id === myId && !s.caregiver_user_id && (s.sitter_email ?? "").trim())
    .sort((a, b) => b.start_date.localeCompare(a.start_date))
    .flatMap((s) => {
      const key = (s.sitter_email as string).trim().toLowerCase();
      if (seen.has(key)) return [];
      seen.add(key);
      return [{ key, name: (s.sitter_name ?? "").trim(), email: (s.sitter_email as string).trim(), last: rangeTo(t, s.start_date, s.end_date) }];
    })
    .slice(0, 4);
  const pastOn = (k: string) => caregiverKind === "external" && pickedPast === k;
  const newOn = caregiverKind === "external" && !pickedPast;

  return (
    <section>
      <SectionTitle>{t("sitForm.whosCoveringQ", "Who's covering?")}</SectionTitle>
      {selected.size === 0 ? (
        <p className="m-0 text-[15px]" style={{ color: DUO.quiet }}>{t("sitsDuo.pickBirdFirst", "Pick a bird on the left first.")}</p>
      ) : (
        <div className="flex flex-col gap-2.5" role="radiogroup" aria-label={t("sitForm.whosCoveringQ", "Who's covering?")}>
          {eligibleMembers.map((m) => {
            const display = memberDisplayName(m);
            return (
              <CoverCard
                key={m.userId}
                on={caregiverKind === "household" && householdUserId === m.userId}
                onClick={() => { setPickedPast(null); f.setCaregiverKind("household"); f.setHouseholdUserId(m.userId); }}
                leading={<Initial name={display} tone="forest" />}
                title={display}
                detail={t("sitForm.household", "Household")}
              />
            );
          })}
          {pastSitters.map((p) => (
            <CoverCard
              key={p.key}
              on={pastOn(p.key)}
              onClick={() => { setPickedPast(p.key); f.setCaregiverKind("external"); f.setHouseholdUserId(null); f.setSitterName(p.name); f.setSitterEmail(p.email); }}
              leading={<Initial name={p.name || p.email} tone="lime" />}
              title={p.name || p.email}
              detail={t("sitsDuo.satBefore", "Sat {{range}}", { range: p.last })}
            />
          ))}
          <CoverCard
            on={newOn}
            onClick={() => {
              if (pickedPast) { f.setSitterName(""); f.setSitterEmail(""); }
              setPickedPast(null);
              f.setCaregiverKind("external");
              f.setHouseholdUserId(null);
            }}
            leading={<span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-full" style={{ background: K.lime, color: K.forest }}><Mail className="size-5" /></span>}
            title={t("sitsDuo.someoneNew", "Someone new")}
            detail={t("sitForm.weEmailThemALink", "We'll email them a link")}
          />
          {newOn && (
            <div className="mt-1.5"><SitterFields name={sitterName} email={sitterEmail} onName={f.setSitterName} onEmail={f.setSitterEmail} emailRequired /></div>
          )}
        </div>
      )}
    </section>
  );
}

// ---- Ready for the sitter? --------------------------------------------------

function Readiness({ f }: { f: SitFormState }) {
  const { t, selected, birds, coverName, openGap } = f;
  const ids = birds.map((b: any) => b.id as string).filter((id: string) => selected.has(id));
  const sitReadiness = useServerFn(getSitReadiness);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["sits-duo-readiness", ids.slice().sort().join(",")],
    enabled: ids.length > 0,
    // Fresh on every visit: a "Fix" round trip should come back up to date.
    staleTime: 0,
    queryFn: () => sitReadiness({ data: { birdIds: ids } }),
  });
  if (ids.length === 0 || isError) return null;
  const byBird = new Map((data?.birds ?? []).map((r) => [r.birdId, r.missing]));
  const nameOf = (id: string) => (birds.find((b: any) => b.id === id)?.name ?? "") as string;
  const emergencyGaps = ids.filter((id: string) => (byBird.get(id) ?? []).includes("emergency"));

  return (
    <section>
      <SectionTitle>
        {coverName ? t("sitsDuo.readyFor", "Ready for {{name}}?", { name: coverName }) : t("sitsDuo.readyForSitter", "Ready for your sitter?")}
      </SectionTitle>
      {isLoading || !data ? (
        <p className="m-0 text-[15px]" style={{ color: DUO.quiet }}>{t("sitsDuo.checking", "Checking…")}</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {ids.map((id: string) => {
            const missing = (byBird.get(id) ?? []).filter((m) => m !== "emergency") as SitGapSection[];
            return (
              <ReadyRow
                key={id}
                title={t("sitsDuo.birdCarePlan", "{{name}}'s care plan", { name: nameOf(id) })}
                ok={missing.length === 0}
                detail={missing.length === 0
                  ? t("accountDuo.complete", "Complete")
                  : t("sitsDuo.missing", "Missing: {{list}}", { list: missing.map((m) => gapLabel(t, m)).join(", ") })}
                onFix={missing.length ? () => openGap(id, missing[0]) : undefined}
              />
            );
          })}
          <ReadyRow
            title={t("account.emergencyInfo", "Emergency info")}
            ok={emergencyGaps.length === 0}
            detail={emergencyGaps.length === 0
              ? t("accountDuo.complete", "Complete")
              : t("sitsDuo.missingFor", "Missing for {{names}}", { names: birdNames(t, emergencyGaps.map(nameOf)) })}
            onFix={emergencyGaps.length ? () => openGap(emergencyGaps[0], "emergency") : undefined}
          />
        </ul>
      )}
    </section>
  );
}

function ReadyRow({ title, ok, detail, onFix }: { title: string; ok: boolean; detail: string; onFix?: () => void }) {
  const { t } = useTranslation();
  return (
    <li className="flex min-h-[64px] items-center gap-3 rounded-[18px] px-4 py-3" style={{ background: ok ? DUO.bg : DUO.attentionBg }}>
      <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-full" style={ok ? { background: DUO.fineBg, color: DUO.forest } : { background: "#fff", color: DUO.attentionText }}>
        {ok ? <Check className="size-5" strokeWidth={3} /> : <AlertTriangle className="size-[18px]" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[16px] font-[700]" style={{ color: DUO.forest }}>{title}</span>
        <span className="block text-[14px] leading-snug" style={{ color: ok ? DUO.quiet : DUO.attentionText }}>{detail}</span>
      </span>
      {onFix ? (
        <button type="button" onClick={onFix} className="inline-flex min-h-[44px] shrink-0 items-center rounded-full border-2 bg-white px-4 text-[15px] font-[700]" style={{ borderColor: DUO.forest, color: DUO.forest }}>
          {t("sitsDuo.fix", "Fix")}
        </button>
      ) : (
        <StatusPill tone="fine">{t("sitsDuo.ready", "Ready")}</StatusPill>
      )}
    </li>
  );
}

// ---- Delete (edit only) -----------------------------------------------------

function DeleteControl({ f }: { f: SitFormState }) {
  const { t, canDelete, confirmingDelete, setConfirmingDelete, isActiveSit, deleteSit, deleting } = f;
  if (!canDelete) return null;
  if (!confirmingDelete) return <KyaLink color={K.red} onClick={() => setConfirmingDelete(true)}>{t("sitDetail.deleteThisSit", "Delete this sit")}</KyaLink>;
  return (
    <div className="rounded-[16px] p-3.5 text-left" style={{ background: "#fcebeb", color: DUO.forest }}>
      {isActiveSit && (
        <p className="m-0 mb-2 flex items-start gap-1.5 text-[14px] font-[700]" style={{ color: K.red }}>
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          {t("sitForm.activeSitDeleteWarning", "This sit is active right now — a sitter is covering. Deleting it ends their access immediately.")}
        </p>
      )}
      <p className="m-0 text-[14px] leading-[1.5]">
        {t("sitForm.deleteThisSitConfirm", "Delete this sit? This can't be undone. Its checklist and task completions are removed; logged daily checks, weights, and photos are kept but no longer tied to the sit.")}
      </p>
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={deleteSit} disabled={deleting} className="min-h-[48px] flex-1 rounded-full px-4 text-[15px] font-[700] text-white disabled:opacity-50" style={{ background: K.red }}>
          {deleting ? t("sitForm.deleting", "Deleting…") : t("sitForm.deleteSit", "Delete sit")}
        </button>
        <button type="button" onClick={() => setConfirmingDelete(false)} disabled={deleting} className="min-h-[48px] rounded-full border-2 bg-white px-5 text-[15px] font-[700] disabled:opacity-50" style={{ borderColor: K.forest, color: K.forest }}>
          {t("sitForm.keep", "Keep")}
        </button>
      </div>
    </div>
  );
}

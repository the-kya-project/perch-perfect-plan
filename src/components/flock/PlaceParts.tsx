import { useState } from "react";
import { HeartHandshake, Link2, Phone, Stethoscope, Store } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { K, KyaHeading, KyaPrimaryButton, KyaSheet } from "@/components/kya";
import { useFormInProgress } from "@/lib/formsInProgress";
import {
  PLACE_KINDS, PLACE_LIMITS, savePlace, suggestPlace, telHref, useInvalidatePlaces, websiteHref,
  type Place, type PlaceKind,
} from "@/lib/flockPlaces";

// Chapter collections (backlog 1.6, SpecCollections mockup): the directory
// card, the kind picker, "Suggest a place" and a manager's add/edit sheet.

/** "Avian vets", "Rescues", "Shops and services": a group's heading. */
export function placeGroupLabel(t: TFunction, kind: PlaceKind): string {
  switch (kind) {
    case "vet": return t("flock.places.group.vet", "Avian vets");
    case "rescue": return t("flock.places.group.rescue", "Rescues");
    case "shop": return t("flock.places.group.shop", "Shops and services");
  }
}

/** "Avian vet", "Rescue", "Shop or service": one listing's kind. */
export function placeKindLabel(t: TFunction, kind: PlaceKind): string {
  switch (kind) {
    case "vet": return t("flock.places.kind.vet", "Avian vet");
    case "rescue": return t("flock.places.kind.rescue", "Rescue");
    case "shop": return t("flock.places.kind.shop", "Shop or service");
  }
}

const TILE: Record<PlaceKind, { bg: string; icon: typeof Stethoscope }> = {
  vet: { bg: K.lime, icon: Stethoscope },
  rescue: { bg: "#f6dfa6", icon: HeartHandshake },
  shop: { bg: K.paleGreen, icon: Store },
};

/** A directory card: name, city or area, the note, and Call / Website. No
 *  author, comments, reactions or ratings. */
export function PlaceCard({ place }: { place: Place }) {
  const { t } = useTranslation();
  const tel = telHref(place.phone);
  const web = websiteHref(place.website);
  const Icon = TILE[place.kind].icon;
  return (
    <article className="flex flex-col gap-2 rounded-[18px] bg-white px-4 py-3" style={{ color: K.forest }} data-place={place.place_id}>
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-[12px]" style={{ background: TILE[place.kind].bg }} aria-hidden="true">
          <Icon className="size-5" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <KyaHeading as="h3" size={16}>{place.name}</KyaHeading>
          {place.area && <span className="text-[13px] leading-[1.45]" style={{ color: K.quiet }}>{place.area}</span>}
          {place.note && <p className="m-0 whitespace-pre-wrap text-[14px] leading-[1.45]" style={{ color: K.ink }}>{place.note}</p>}
        </div>
      </div>
      {(tel || web) && (
        <div className="flex flex-wrap gap-x-5">
          {tel && (
            <a href={tel} className="inline-flex min-h-[44px] items-center gap-1.5 text-[14px] font-[700]" style={{ color: K.moss }} data-testid="place-call"
              aria-label={t("flock.places.callAria", "Call {{name}}, {{phone}}", { name: place.name, phone: place.phone })}>
              <Phone className="size-4" aria-hidden="true" />{t("flock.places.call", "Call")}
            </a>
          )}
          {web && (
            <a href={web} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[44px] items-center gap-1.5 text-[14px] font-[700]" style={{ color: K.moss }} data-testid="place-website"
              aria-label={t("flock.places.websiteAria", "{{name}}'s website", { name: place.name })}>
              <Link2 className="size-4" aria-hidden="true" />{t("flock.places.website", "Website")}
            </a>
          )}
        </div>
      )}
    </article>
  );
}

/** Avian vet / Rescue / Shop or service, as a radio group of chips. */
function KindPicker({ value, onChange }: { value: PlaceKind; onChange: (k: PlaceKind) => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t("flock.places.kindLabel", "Kind of place")}>
      {PLACE_KINDS.map((k) => (
        <button key={k} type="button" role="radio" aria-checked={value === k} onClick={() => onChange(k)} data-kind={k}
          className="inline-flex min-h-[44px] items-center">
          <span className="inline-flex h-10 items-center whitespace-nowrap rounded-full px-4 text-[14px] font-[700]"
            style={value === k ? { background: K.forest, color: "#fff", border: `1.5px solid ${K.forest}` } : { background: "#fff", color: K.forest, border: `1.5px solid ${K.line}` }}>
            {placeKindLabel(t, k)}
          </span>
        </button>
      ))}
    </div>
  );
}

const fieldCls = "min-h-[48px] rounded-[14px] border px-3.5 text-[16px] font-normal outline-none";
const labelCls = "flex flex-col gap-1.5 text-[14px] font-[700]";

/** "Suggest a place" (mockup screen 2): kind, name, city or area, why. It
 *  waits for the chapter's lead or an admin before anyone sees it. */
export function SuggestPlaceSheet({ onClose, onSent }: { onClose: () => void; onSent: () => void }) {
  const { t } = useTranslation();
  const invalidate = useInvalidatePlaces();
  const [kind, setKind] = useState<PlaceKind>("vet");
  const [name, setName] = useState("");
  const [area, setArea] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useFormInProgress(!!(name.trim() || note.trim()) && !busy);
  const send = async () => {
    setBusy(true); setError(null);
    try {
      await suggestPlace(kind, name, area, note);
      await invalidate();
      onSent();
    } catch (e) {
      const msg = (e as { message?: string })?.message ?? "";
      setError(msg === "rate_limited"
        ? t("flock.places.tooMany", "You have a few suggestions waiting already. Try again once they've been looked at.")
        : t("flock.places.sendError", "We couldn't send that. Try again."));
      setBusy(false);
    }
  };
  return (
    <KyaSheet onClose={onClose} closeLabel={t("flock.region.close", "Close")} title={<KyaHeading size={23}>{t("flock.places.suggest", "Suggest a place")}</KyaHeading>}>
      <div className="flex flex-col gap-4" style={{ color: K.forest }} data-testid="suggest-place-sheet">
        <KindPicker value={kind} onChange={setKind} />
        <label className={labelCls}>
          {t("flock.places.name", "Name")}
          <input value={name} maxLength={PLACE_LIMITS.name} onChange={(e) => setName(e.target.value)} className={fieldCls} style={{ borderColor: "#c9d3c8" }} data-testid="place-name" />
        </label>
        <label className={labelCls}>
          {t("flock.places.area", "City or area")}
          <input value={area} maxLength={PLACE_LIMITS.area} onChange={(e) => setArea(e.target.value)} className={fieldCls} style={{ borderColor: "#c9d3c8" }} data-testid="place-area" />
        </label>
        <label className={labelCls}>
          {t("flock.places.why", "Why do you recommend it?")}
          <textarea value={note} maxLength={PLACE_LIMITS.note} rows={3} onChange={(e) => setNote(e.target.value)}
            className="resize-none rounded-[14px] border p-3 text-[16px] font-normal outline-none" style={{ borderColor: "#c9d3c8" }} data-testid="place-note" />
        </label>
        <p className="m-0 text-[13.5px] leading-[1.45]" style={{ color: K.quiet }}>{t("flock.places.reviewHint", "Your chapter lead will look it over before it shows.")}</p>
        {error && <p role="alert" className="m-0 text-[14px]" style={{ color: K.red }} data-testid="place-error">{error}</p>}
        <KyaPrimaryButton onClick={() => void send()} disabled={!name.trim() || busy}>
          {busy ? t("flock.idea.saving", "Saving…") : t("flock.places.send", "Send suggestion")}
        </KyaPrimaryButton>
      </div>
    </KyaSheet>
  );
}

/** A chapter lead's or admin's add/edit sheet: every field, live at once.
 *  Editing also offers Remove listing (`onRemove`, which confirms first). */
export function PlaceFormSheet({ region, place, onClose, onSaved, onRemove }: {
  region: string; place: Place | null; onClose: () => void; onSaved: () => void; onRemove?: () => void;
}) {
  const { t } = useTranslation();
  const invalidate = useInvalidatePlaces();
  const [kind, setKind] = useState<PlaceKind>(place?.kind ?? "vet");
  const [name, setName] = useState(place?.name ?? "");
  const [area, setArea] = useState(place?.area ?? "");
  const [phone, setPhone] = useState(place?.phone ?? "");
  const [website, setWebsite] = useState(place?.website ?? "");
  const [note, setNote] = useState(place?.note ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useFormInProgress(!busy && (place
    ? name !== place.name || area !== (place.area ?? "") || phone !== (place.phone ?? "") || website !== (place.website ?? "") || note !== (place.note ?? "") || kind !== place.kind
    : !!(name.trim() || note.trim())));
  const badWebsite = !!website.trim() && !websiteHref(website);
  const save = async () => {
    setBusy(true); setError(null);
    try {
      await savePlace({ id: place?.place_id ?? null, region, kind, name, area, phone, website, note });
      await invalidate();
      onSaved();
    } catch {
      setError(t("flock.places.saveError", "We couldn't save that. Check the details and try again."));
      setBusy(false);
    }
  };
  return (
    <KyaSheet onClose={onClose} closeLabel={t("flock.region.close", "Close")}
      title={<KyaHeading size={23}>{place ? t("flock.places.editTitle", "Edit listing") : t("flock.places.add", "Add a listing")}</KyaHeading>}>
      <div className="flex flex-col gap-4" style={{ color: K.forest }} data-testid="place-form">
        <KindPicker value={kind} onChange={setKind} />
        <label className={labelCls}>
          {t("flock.places.name", "Name")}
          <input value={name} maxLength={PLACE_LIMITS.name} onChange={(e) => setName(e.target.value)} className={fieldCls} style={{ borderColor: "#c9d3c8" }} data-testid="place-name" />
        </label>
        <label className={labelCls}>
          {t("flock.places.area", "City or area")}
          <input value={area} maxLength={PLACE_LIMITS.area} onChange={(e) => setArea(e.target.value)} className={fieldCls} style={{ borderColor: "#c9d3c8" }} data-testid="place-area" />
        </label>
        <label className={labelCls}>
          {t("flock.places.phone", "Phone (optional)")}
          <input value={phone} type="tel" inputMode="tel" maxLength={PLACE_LIMITS.phone} onChange={(e) => setPhone(e.target.value)} className={fieldCls} style={{ borderColor: "#c9d3c8" }} data-testid="place-phone" />
        </label>
        <label className={labelCls}>
          {t("flock.places.websiteField", "Website (optional)")}
          <input value={website} inputMode="url" maxLength={PLACE_LIMITS.website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://"
            className={fieldCls} style={{ borderColor: badWebsite ? K.red : "#c9d3c8" }} data-testid="place-website-input" />
          {badWebsite && <span className="text-[12.5px] font-normal" style={{ color: K.red }}>{t("flock.places.websiteHint", "Use a web address, like example.com.")}</span>}
        </label>
        <label className={labelCls}>
          {t("flock.places.noteField", "Why members recommend it")}
          <textarea value={note} maxLength={PLACE_LIMITS.note} rows={3} onChange={(e) => setNote(e.target.value)}
            className="resize-none rounded-[14px] border p-3 text-[16px] font-normal outline-none" style={{ borderColor: "#c9d3c8" }} data-testid="place-note" />
        </label>
        {error && <p role="alert" className="m-0 text-[14px]" style={{ color: K.red }} data-testid="place-error">{error}</p>}
        <KyaPrimaryButton onClick={() => void save()} disabled={!name.trim() || badWebsite || busy}>
          {busy ? t("flock.idea.saving", "Saving…") : place ? t("flock.places.saveChanges", "Save changes") : t("flock.places.addSave", "Add listing")}
        </KyaPrimaryButton>
        {onRemove && (
          <button type="button" onClick={onRemove} disabled={busy} data-testid="place-remove"
            className="min-h-[48px] rounded-full text-[15px] font-[700] disabled:opacity-50" style={{ color: K.red }}>
            {t("flock.places.remove", "Remove listing")}
          </button>
        )}
      </div>
    </KyaSheet>
  );
}

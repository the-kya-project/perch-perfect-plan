import { useState, type ReactNode } from "react";
import { Check, Star } from "lucide-react";
import { useTranslation } from "react-i18next";
import { K, KyaHeading, KyaSheet } from "@/components/kya";
import type { FlockPhotoSrc, OwnBird, Region } from "@/lib/flockData";
import { chapterLine } from "@/lib/flockNav";

/** A round photo over the person's or bird's initial on forest. The initial
 *  shows until the photo has loaded, and stays if the photo can't load (after
 *  trying the original), so a slow or failed photo never leaves an empty gap. */
function RoundPhoto({ name, photo, size, ring, testId }: { name: string; photo: FlockPhotoSrc; size: number; ring?: string; testId?: string }) {
  const initial = (name.trim()[0] ?? "").toUpperCase();
  const src = typeof photo === "string" ? { url: photo, original: null } : photo ?? null;
  const [failed, setFailed] = useState<string[]>([]);
  const [loaded, setLoaded] = useState<string | null>(null);
  const candidates = src ? [src.url, src.original].filter((u, i, a): u is string => !!u && a.indexOf(u) === i) : [];
  const current = candidates.find((u) => !failed.includes(u)) ?? null;
  const showing = !!current && loaded === current;
  return (
    <span
      className="relative grid shrink-0 place-items-center overflow-hidden rounded-full font-[700] text-white"
      data-photo={showing ? "loaded" : current ? "loading" : "initial"}
      data-testid={testId}
      style={{ width: size, height: size, background: K.forest, fontSize: Math.round(size * 0.42), boxShadow: ring ? `0 0 0 2px ${ring}` : undefined }}
    >
      <span aria-hidden="true">{initial}</span>
      {current && (
        <img
          key={current}
          src={current}
          alt=""
          decoding="async"
          onLoad={() => setLoaded(current)}
          onError={() => setFailed((f) => [...f, current])}
          className="absolute inset-0 size-full object-cover"
          style={{ opacity: showing ? 1 : 0 }}
        />
      )}
    </span>
  );
}

/** A member's photo, or their initial on forest. */
export function FlockAvatar({ name, url, size = 44, ring }: { name: string; url?: FlockPhotoSrc; size?: number; ring?: string }) {
  return <RoundPhoto name={name} photo={url} size={size} ring={ring} />;
}

/** "Founding member" pill. */
export function FounderBadge() {
  const { t } = useTranslation();
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12.5px] font-[700]" style={{ background: K.sunflower, color: K.forest }}>
      <Star className="size-3.5" fill="currentColor" aria-hidden="true" />
      {t("flock.people.founder", "Founding member")}
    </span>
  );
}

/** A bird's photo, or the bird's initial on forest. */
export function BirdThumb({ name, photo, size = 40 }: { name: string; photo?: FlockPhotoSrc; size?: number }) {
  return <RoundPhoto name={name} photo={photo} size={size} testId="bird-thumb" />;
}

const CHIP_ON_BG = "#cdeab0";
const CHIP_OFF_BORDER = "#c9d3c8";

/** Your own birds as chips, all toggleable (aria-pressed). */
export function BirdChips({ birds, photos, selected, onToggle }: {
  birds: OwnBird[];
  photos: Record<string, FlockPhotoSrc> | undefined;
  selected: Map<string, boolean>;
  onToggle: (id: string) => void;
}) {
  const { t } = useTranslation();
  if (birds.length === 0) {
    return <p className="m-0 text-[15px]" style={{ color: K.quiet }}>{t("flock.birds.none", "No birds on your account yet. You can choose them later in your profile.")}</p>;
  }
  return (
    <div role="group" aria-label={t("flock.birds.groupAria", "Birds members can meet")} className="flex flex-wrap gap-2">
      {birds.map((b) => {
        const on = selected.get(b.id) ?? true;
        return (
          <button
            key={b.id}
            type="button"
            aria-pressed={on}
            data-bird-chip={b.id}
            onClick={() => onToggle(b.id)}
            className="inline-flex min-h-[48px] items-center gap-2 rounded-full py-1 pl-1 pr-3.5 text-[15px] active:scale-[0.98]"
            // Selected: pale lime, 2px forest border, bold, with a check.
            // Not selected: white, 1px light border, regular. The thinner
            // border gets 1px more padding so the chip doesn't change size.
            style={on
              ? { background: CHIP_ON_BG, color: K.forest, border: `2px solid ${K.forest}`, fontWeight: 700 }
              : { background: "#fff", color: K.forest, border: `1px solid ${CHIP_OFF_BORDER}`, fontWeight: 400, padding: "5px 15px 5px 5px" }}
          >
            <BirdThumb name={b.name} photo={photos?.[b.id]} size={36} />
            {b.name}
            {on && <Check className="size-4" strokeWidth={2.75} aria-hidden="true" />}
          </button>
        );
      })}
    </div>
  );
}

/** Pick a chapter region: the nine regions, then Other. */
export function RegionSheet({ regions, value, onPick, onClose }: {
  regions: Region[];
  value: string | null;
  onPick: (slug: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <KyaSheet onClose={onClose} closeLabel={t("flock.region.close", "Close")} title={<KyaHeading size={23}>{t("flock.region.title", "Choose your chapter")}</KyaHeading>}>
      <p className="m-0 text-[15px] leading-[1.5]" style={{ color: K.quiet }}>
        {t("flock.region.line", "Your chapter is the members near you. Members see your region, never your address.")}
      </p>
      <ul className="m-0 mt-3 flex list-none flex-col gap-2 p-0" data-testid="region-list">
        {regions.map((r) => {
          const on = r.slug === value;
          return (
            <li key={r.slug}>
              <button
                type="button"
                aria-pressed={on}
                data-region={r.slug}
                onClick={() => onPick(r.slug)}
                className="flex min-h-[52px] w-full items-center justify-between gap-3 rounded-[16px] px-4 py-2.5 text-left active:scale-[0.99]"
                style={on ? { background: K.forest, color: "#fff" } : { background: K.mist, color: K.forest }}
              >
                <span className="text-[15px] font-[700]">{chapterLine(r.name, r.states)}</span>
                {on && <Check className="size-5 shrink-0" aria-hidden="true" />}
              </button>
            </li>
          );
        })}
      </ul>
    </KyaSheet>
  );
}

/** A white card with a small heading, for setup and edit sections. */
export function FlockSection({ title, children, hint }: { title: ReactNode; children: ReactNode; hint?: ReactNode }) {
  return (
    <section className="rounded-[22px] bg-white p-5" style={{ border: `1px solid ${K.line}` }}>
      <KyaHeading size={20}>{title}</KyaHeading>
      <div className="mt-3">{children}</div>
      {hint && <p className="m-0 mt-3 text-[14px] leading-[1.45]" style={{ color: K.quiet }}>{hint}</p>}
    </section>
  );
}

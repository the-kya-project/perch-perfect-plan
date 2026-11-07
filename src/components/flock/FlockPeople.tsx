import type { ReactNode } from "react";
import { Bird, Check, Star } from "lucide-react";
import { useTranslation } from "react-i18next";
import { K, KyaHeading, KyaSheet } from "@/components/kya";
import type { OwnBird, Region } from "@/lib/flockData";
import { chapterLine } from "@/lib/flockNav";

/** A member's photo, or their initial on forest. */
export function FlockAvatar({ name, url, size = 44, ring }: { name: string; url?: string | null; size?: number; ring?: string }) {
  const initial = (name.trim()[0] ?? "").toUpperCase();
  const style = { width: size, height: size, boxShadow: ring ? `0 0 0 2px ${ring}` : undefined };
  return url ? (
    <img src={url} alt="" className="shrink-0 rounded-full object-cover" style={style} />
  ) : (
    <span
      aria-hidden="true"
      className="grid shrink-0 place-items-center rounded-full font-[700] text-white"
      style={{ ...style, background: K.forestDeep, fontSize: Math.round(size * 0.4) }}
    >
      {initial}
    </span>
  );
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

/** A bird's photo, or a bird icon on lime. */
export function BirdThumb({ url, size = 40 }: { url?: string | null; size?: number }) {
  return url ? (
    <img src={url} alt="" className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />
  ) : (
    <span aria-hidden="true" className="grid shrink-0 place-items-center rounded-full" style={{ width: size, height: size, background: K.lime, color: K.forest }}>
      <Bird className="size-[55%]" />
    </span>
  );
}

/** Your own birds as chips, all toggleable (aria-pressed). */
export function BirdChips({ birds, photos, selected, onToggle }: {
  birds: OwnBird[];
  photos: Record<string, string | null> | undefined;
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
            className="inline-flex min-h-[48px] items-center gap-2 rounded-full py-1 pl-1 pr-3.5 text-[15px] font-[700] active:scale-[0.98]"
            style={on
              ? { background: K.forest, color: "#fff", border: `1.5px solid ${K.forest}` }
              : { background: "#fff", color: K.forest, border: `1.5px solid ${K.line}` }}
          >
            <BirdThumb url={photos?.[b.id]} size={36} />
            {b.name}
            {on && <Check className="size-4" aria-hidden="true" />}
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

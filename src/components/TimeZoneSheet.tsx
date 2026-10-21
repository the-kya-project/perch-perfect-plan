// Account → Time zone: the owner's home zone. Sits follow it, so a sitter's
// link ends at the end of the last day in this zone wherever the owner's phone
// happens to be. Saving it moves current and upcoming sits (the database does
// that, see 20261021180000_profile_time_zone).
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { K, KyaField, KyaHeading, KyaSheet } from "@/components/kya";
import { friendlyError } from "@/lib/errorMessage";
import { deviceTimeZone } from "@/lib/sitTimeZone";
import { allTimeZones, searchTimeZones, timeZoneParts } from "@/lib/sitTimeZoneNames";
import { saveAccountTimeZone } from "@/lib/sitTimeZoneBackfill";

export const ACCOUNT_TIME_ZONE_KEY = ["profile-time-zone"] as const;

export function TimeZoneSheet({ userId, current, onClose }: {
  userId: string | null;
  current: string | null;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const lang = i18n.language || "en-US";
  const device = deviceTimeZone();
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState<string | null>(null);

  const zones = useMemo(() => {
    const now = new Date();
    return allTimeZones([current, device]).map((z) => timeZoneParts(z, lang, now));
  }, [current, device, lang]);
  const shown = useMemo(() => searchTimeZones(zones, query), [zones, query]);

  async function choose(tz: string) {
    if (!userId || tz === current) { onClose(); return; }
    setSaving(tz);
    try {
      await saveAccountTimeZone(userId, tz);
      qc.setQueryData(ACCOUNT_TIME_ZONE_KEY, tz);
      // Current and upcoming sits just moved to this zone.
      void qc.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === "string" && /(^|-)sits?(-|$)/.test(q.queryKey[0]) });
      toast.success(t("account.timeZoneSaved", "Time zone saved."));
      onClose();
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setSaving(null);
    }
  }

  const selected = saving ?? current;
  const rowCls = "flex min-h-[56px] w-full items-center gap-3 px-4 py-2 text-left disabled:opacity-60";

  return (
    <KyaSheet onClose={onClose} closeLabel={t("account.close", "Close")} title={<KyaHeading size={24}>{t("account.timeZone", "Time zone")}</KyaHeading>}>
      <p className="m-0 mb-3 text-[15px] leading-[1.45]" style={{ color: K.quiet }}>
        {t("account.timeZoneIntro", "Your sits run on this time zone, so a sitter's link lasts to the end of the last day here, even while you're travelling. Changing it moves your current and upcoming sits.")}
      </p>

      {device && device !== current && (
        <button
          type="button"
          onClick={() => void choose(device)}
          disabled={saving !== null}
          className={`${rowCls} mb-3 rounded-[20px] font-[700]`}
          style={{ background: K.mist, color: K.forest }}
        >
          <Smartphone className="size-5 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1 text-[15px]">
            {t("account.timeZoneUseDevice", "Use this device's time zone ({{zone}})", { zone: timeZoneParts(device, lang).label })}
          </span>
        </button>
      )}

      <KyaField
        id="time-zone-search"
        label={t("account.timeZoneSearchLabel", "Find your time zone")}
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t("account.timeZoneSearch", "City or time zone")}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
      />

      <div className="mt-3 overflow-hidden rounded-[20px]" style={{ background: K.mist }}>
        {shown.length === 0 ? (
          <p className="m-0 px-4 py-4 text-[15px]" style={{ color: K.quiet }}>
            {t("account.timeZoneNoMatch", "No time zones match “{{query}}”.", { query: query.trim() })}
          </p>
        ) : shown.map((z, i) => (
          <button
            key={z.id}
            type="button"
            onClick={() => void choose(z.id)}
            disabled={saving !== null}
            className={rowCls}
            style={{ color: K.forest, borderTop: i > 0 ? `1px solid ${K.line}` : undefined }}
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-[700]">{z.label}</span>
              {z.offset && <span className="block truncate text-[13px]" style={{ color: K.quiet }}>{z.offset}</span>}
            </span>
            {selected === z.id && <Check className="size-5 shrink-0" aria-label={t("account.timeZoneSelected", "Selected")} />}
          </button>
        ))}
      </div>
    </KyaSheet>
  );
}

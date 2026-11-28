// Account → Home ZIP or postcode (backlog D2.2), behind the `weather_cards`
// switch. Optional; used only for Home's heat and cold cards. A US ZIP or a
// Dutch postcode (stored as its 4 digits); the rules are parseHomePostcode in
// src/lib/weatherCards.ts. Removing it deletes it.
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { K, KyaField, KyaHeading, KyaLink, KyaPrimaryButton, KyaSheet } from "@/components/kya";
import { friendlyError } from "@/lib/errorMessage";
import { HOME_POSTCODE_KEY, removeHomePostcode, saveHomePostcode } from "@/lib/homePostcode";
import { parseHomePostcode, type HomePostcode } from "@/lib/weatherCards";

export function HomePostcodeSheet({ userId, current, onClose }: {
  userId: string | null;
  current: HomePostcode | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [value, setValue] = useState(current?.postcode ?? "");
  const [invalid, setInvalid] = useState(false);
  const [saving, setSaving] = useState(false);

  const refresh = (next: HomePostcode | null) => {
    qc.setQueryData(HOME_POSTCODE_KEY, next);
    void qc.invalidateQueries({ queryKey: ["weather-card"] });
  };

  async function save() {
    if (!userId) { onClose(); return; }
    const parsed = parseHomePostcode(value);
    if (!parsed) { setInvalid(true); return; }
    if (current && parsed.country === current.country && parsed.postcode === current.postcode) { onClose(); return; }
    setSaving(true);
    try {
      await saveHomePostcode(userId, parsed);
      refresh(parsed);
      onClose();
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!userId) { onClose(); return; }
    setSaving(true);
    try {
      await removeHomePostcode(userId);
      refresh(null);
      onClose();
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <KyaSheet onClose={onClose} closeLabel={t("account.close", "Close")} title={<KyaHeading size={24}>{t("account.homePostcode", "Home ZIP or postcode")}</KyaHeading>}>
      <KyaField
        id="home-postcode"
        label={t("account.homePostcode", "Home ZIP or postcode")}
        value={value}
        onChange={(e) => { setValue(e.target.value); setInvalid(false); }}
        onKeyDown={(e) => { if (e.key === "Enter") void save(); }}
        autoComplete="postal-code"
        inputMode="text"
        maxLength={10}
        aria-invalid={invalid || undefined}
        style={invalid ? { borderColor: K.red } : undefined}
        hint={t("account.homePostcodeHelp", "Optional. We use it only to show heat and cold reminders on Home. We never use your phone's location.")}
      />
      {invalid && (
        <p role="alert" className="m-0 mt-1.5 px-1 text-[13px] leading-[1.4]" style={{ color: K.red }}>
          {t("account.homePostcodeInvalid", "That doesn't look like a ZIP or postcode. Check it and try again.")}
        </p>
      )}
      <div className="mt-4">
        <KyaPrimaryButton onClick={save} disabled={saving || !value.trim()}>
          {saving ? t("account.saving", "Saving…") : t("account.saveChanges", "Save changes")}
        </KyaPrimaryButton>
      </div>
      {current && (
        <div className="mt-2 flex justify-center">
          <KyaLink color={K.red} onClick={remove}>{t("account.homePostcodeRemove", "Remove")}</KyaLink>
        </div>
      )}
    </KyaSheet>
  );
}

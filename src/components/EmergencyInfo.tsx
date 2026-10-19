import { useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Link } from "@tanstack/react-router";
import { ShieldCheck, Pencil, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ASPCA_POISON_CONTROL, isPhoneField, phoneWarning, formatPhoneOnBlur } from "@/lib/emergency";
import { isAddressField } from "@/lib/address";
import { AddressInput } from "@/components/AddressInput";
import { toast } from "sonner";

// Shared emergency UI used by BOTH the bird editor's Emergency tab and the
// guided-setup emergency step, so the two can't diverge. It shows the owner's
// ACCOUNT emergency info read-only; "Edit for {bird}" creates a per-bird
// override (written to that bird's emergency_contacts row) that never touches
// the account default or any other bird. A field is overridden when the bird's
// stored value differs from the account default.

const EMERGENCY_SECTIONS: { key: string; title: string; fields: [string, string][] }[] = [
  { key: "avian_vet", title: "Avian vet", fields: [["avian_vet_name", "Clinic"], ["avian_vet_phone", "Phone"], ["avian_vet_address", "Address"]] },
  { key: "emergency_vet", title: "Emergency vet", fields: [["emergency_vet_name", "Clinic"], ["emergency_vet_phone", "Phone"], ["emergency_vet_address", "Address"]] },
  { key: "your_contact", title: "Your contact", fields: [["owner_phone", "Phone"], ["backup_name", "Backup name"], ["backup_phone", "Backup phone"]] },
  { key: "poison_control", title: "Poison control", fields: [["poison_control", "Phone"]] },
  { key: "transport", title: "Transport & spending", fields: [["carrier_location", "Carrier"], ["first_aid_kit_location", "First-aid kit"], ["spending_limit", "Spending limit"]] },
];
const REQUIRED_EMERGENCY = new Set(["owner_phone", "avian_vet_phone"]);

// Display labels for the section titles / field labels above (keyed by their
// stable section/field keys; the English constants stay as the source).
function sectionTitle(t: TFunction, key: string, en: string): string {
  switch (key) {
    case "avian_vet": return t("emergencyInfo.sectionAvianVet", "Avian vet");
    case "emergency_vet": return t("emergencyInfo.sectionEmergencyVet", "Emergency vet");
    case "your_contact": return t("emergencyInfo.sectionYourContact", "Your contact");
    case "poison_control": return t("emergencyInfo.sectionPoisonControl", "Poison control");
    case "transport": return t("emergencyInfo.sectionTransport", "Transport & spending");
    default: return en;
  }
}

function fieldLabel(t: TFunction, en: string): string {
  switch (en) {
    case "Clinic": return t("emergencyInfo.fieldClinic", "Clinic");
    case "Phone": return t("emergencyInfo.fieldPhone", "Phone");
    case "Address": return t("emergencyInfo.fieldAddress", "Address");
    case "Backup name": return t("emergencyInfo.fieldBackupName", "Backup name");
    case "Backup phone": return t("emergencyInfo.fieldBackupPhone", "Backup phone");
    case "Carrier": return t("emergencyInfo.fieldCarrier", "Carrier");
    case "First-aid kit": return t("emergencyInfo.fieldFirstAidKit", "First-aid kit");
    case "Spending limit": return t("emergencyInfo.fieldSpendingLimit", "Spending limit");
    default: return en;
  }
}

export function EmergencyInfo({ birdId, birdName, contacts, defaults, onSaved }: { birdId: string; birdName: string; contacts: any; defaults: any | null; onSaved: () => void }) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const trim = (v: any) => (v ?? "").toString().trim();
  const ownVal = (k: string) => trim(contacts?.[k]);
  const defVal = (k: string) => trim(defaults?.[k]);
  // The bird's value if it has one, else the account default.
  const rawEff = (k: string) => ownVal(k) || defVal(k);
  // What to display: poison control always falls back to ASPCA so it's never blank.
  const display = (k: string) => rawEff(k) || (k === "poison_control" ? ASPCA_POISON_CONTROL : "");
  // A field is overridden for this bird when its stored value differs from the account default.
  const isOverridden = (k: string) => ownVal(k) !== "" && ownVal(k) !== defVal(k);

  const hasAnyDefault = !!defaults && EMERGENCY_SECTIONS.some((s) => s.fields.some(([k]) => defVal(k)));

  function startEdit(section: (typeof EMERGENCY_SECTIONS)[number]) {
    const f: Record<string, string> = {};
    // Start from what's shown — for poison control that's the ASPCA fallback, so
    // the field is pre-filled rather than blank.
    for (const [k] of section.fields) f[k] = display(k);
    setForm(f);
    setEditing(section.key);
  }

  async function saveSection(section: (typeof EMERGENCY_SECTIONS)[number]) {
    setSaving(true);
    const patch: Record<string, any> = {};
    for (const [k] of section.fields) {
      const v = trim(form[k]);
      // Store an override only when it differs from the account default; otherwise
      // null so the field keeps using the account value (and updates if it changes).
      patch[k] = v === "" || v === defVal(k) ? null : v;
    }
    await supabase.from("emergency_contacts").update(patch as any).eq("bird_id", birdId);
    setSaving(false);
    setEditing(null);
    toast.success(t("emergencyInfo.savedFor", "Saved for {{name}}.", { name: birdName }));
    onSaved();
  }

  async function resetSection(section: (typeof EMERGENCY_SECTIONS)[number]) {
    setSaving(true);
    const patch: Record<string, any> = {};
    for (const [k] of section.fields) patch[k] = null;
    await supabase.from("emergency_contacts").update(patch as any).eq("bird_id", birdId);
    setSaving(false);
    toast.success(t("emergencyInfo.resetToast", "{{section}} reset to your account info.", { section: sectionTitle(t, section.key, section.title) }));
    onSaved();
  }

  return (
    <div className="space-y-3">
      {/* Source banner — calm info card with an icon */}
      <section className="flex items-start gap-3 rounded-2xl bg-[#e8f0ec] p-4">
        <div className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-[#1a3d2e]/10">
          <ShieldCheck className="size-4 text-[#1a3d2e]" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-[#1a3d2e]">{t("emergencyInfo.usingAccountInfo", "Using your account emergency info")}</p>
          <p className="mt-1 text-xs leading-relaxed text-[#436055]">
            {t("emergencyInfo.usingAccountInfoBody", "This is the vet and emergency info you set for your account. You can change it just for {{name}} if it's different.", { name: birdName })}
          </p>
        </div>
      </section>

      {!hasAnyDefault && (
        <p className="rounded-xl bg-[#efe9da] px-3 py-2 text-[11px] text-[#5f5e5a]">
          <Trans i18nKey="emergencyInfo.noDefaults" defaults="You haven't set your account emergency info yet. <1>Set it once</1> and every bird uses it." components={{ 1: <Link to="/dashboard" search={{ emergencyDefaults: true }} className="font-semibold text-[#1a3d2e] underline" /> }} />
        </p>
      )}

      {EMERGENCY_SECTIONS.map((section) => {
        const overridden = section.fields.some(([k]) => isOverridden(k));
        const isEditing = editing === section.key;
        return (
          <section key={section.key} className="rounded-2xl bg-[#efe9da] p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <h3 className="text-sm font-medium text-[#1a3d2e]">{sectionTitle(t, section.key, section.title)}</h3>
                {overridden && !isEditing && (
                  <span className="shrink-0 rounded-full bg-warn-amber/15 px-2 py-0.5 text-[10px] font-semibold text-warn-amber">
                    {t("emergencyInfo.editedFor", "Edited for {{name}}", { name: birdName })}
                  </span>
                )}
              </div>
              {!isEditing && (
                <button
                  type="button"
                  onClick={() => startEdit(section)}
                  className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#e8f0ec] px-2.5 py-1 text-xs font-semibold text-[#1a3d2e] active:scale-95"
                >
                  <Pencil className="size-3" /> {t("emergencyInfo.editFor", "Edit for {{name}}", { name: birdName })}
                </button>
              )}
            </div>

            {isEditing ? (
              <div className="mt-3 space-y-2.5">
                {section.fields.map(([k, label]) => {
                  const warn = isPhoneField(k) ? phoneWarning(form[k]) : null;
                  return (
                    <label key={k} className="block">
                      <span className="mb-1 block text-xs font-medium text-[#5f5e5a]">{fieldLabel(t, label)}</span>
                      {isAddressField(k) ? (
                        <AddressInput value={form[k] ?? ""} onChange={(v) => setForm((f) => ({ ...f, [k]: v }))} />
                      ) : (
                        <input
                          className="input"
                          inputMode={isPhoneField(k) ? "tel" : undefined}
                          value={form[k] ?? ""}
                          placeholder={defVal(k) ? t("emergencyInfo.accountPlaceholder", "Account: {{value}}", { value: defVal(k) }) : t("emergencyInfo.notProvided", "Not provided")}
                          onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                          onBlur={isPhoneField(k) ? (e) => setForm((f) => ({ ...f, [k]: formatPhoneOnBlur(e.target.value) })) : undefined}
                        />
                      )}
                      {warn && <span className="mt-1 block text-[11px] text-warn-red">{warn}</span>}
                    </label>
                  );
                })}
                <div className="flex gap-2 pt-1">
                  <button disabled={saving || section.fields.some(([k]) => isPhoneField(k) && !!phoneWarning(form[k]))} onClick={() => saveSection(section)} className="flex-1 rounded-xl bg-[#1a3d2e] py-2.5 text-sm font-medium text-white disabled:opacity-50">
                    {saving ? t("emergencyInfo.saving", "Saving…") : t("emergencyInfo.saveFor", "Save for {{name}}", { name: birdName })}
                  </button>
                  <button disabled={saving} onClick={() => setEditing(null)} className="rounded-xl border border-[#d8cfb8] px-4 py-2.5 text-sm font-medium text-[#5f5e5a]">
                    {t("emergencyInfo.cancel", "Cancel")}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <dl className="mt-3">
                  {section.fields.map(([k, label], i) => {
                    const val = display(k);
                    const missingRequired = !val && REQUIRED_EMERGENCY.has(k);
                    return (
                      <div key={k} className={i > 0 ? "mt-2.5 border-t border-[#e3dcc9] pt-2.5" : ""}>
                        <dt className="text-[10px] font-semibold uppercase tracking-wider text-[#8a897f]">{fieldLabel(t, label)}</dt>
                        <dd className={`mt-0.5 text-sm ${val ? "text-[#1a3d2e]" : missingRequired ? "text-warn-red" : "text-[#9a978c]"}`}>
                          {val || t("emergencyInfo.notProvided", "Not provided")}
                        </dd>
                      </div>
                    );
                  })}
                </dl>
                {overridden && (
                  <button
                    type="button"
                    onClick={() => resetSection(section)}
                    disabled={saving}
                    className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-warn-amber disabled:opacity-50"
                  >
                    <RotateCcw className="size-3" /> {t("emergencyInfo.resetToAccount", "Reset to account")}
                  </button>
                )}
              </>
            )}
          </section>
        );
      })}

      <p className="px-1 pt-1 text-[11px] text-[#5f5e5a]">
        <Trans i18nKey="emergencyInfo.changeForEveryBird" defaults="Need to change this for every bird? <1>Edit your account emergency info</1>." components={{ 1: <Link to="/dashboard" search={{ emergencyDefaults: true }} className="font-semibold text-[#1a3d2e] underline" /> }} />
      </p>
    </div>
  );
}

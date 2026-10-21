// "Emergency contacts" in setup: the owner's emergency info, saved once for
// every bird (owner_emergency_defaults). Rows grouped into Vets, You, Poison
// control and Transport & spending; tapping a row opens a sheet for it.
//
// The owner can make the contacts different for one bird, which saves to that
// bird's emergency_contacts row instead (an override only where it differs
// from the shared value — the same rule as EmergencyInfo). Household members
// can't change the owner's shared contacts, so they always edit the bird's own.
import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Check, Cross, Phone, AlertTriangle, ShoppingBag, Contact, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ASPCA_POISON_CONTROL, EMERGENCY_FIELDS, isPhoneField, phoneWarning, formatPhoneOnBlur } from "@/lib/emergency";
import { friendlyError } from "@/lib/errorMessage";
import { useConfirm } from "@/components/ConfirmSheet";
import { BottomSheet } from "./BottomSheet";
import { S, SERIF, TileCard, Tag, Field, TextField, SetupPrimaryButton, SetupTextButton, SetupSecondaryButton } from "./controls";

type RowKey = "avian_vet" | "emergency_vet" | "owner_phone" | "backup" | "poison_control" | "carrier" | "first_aid" | "spending";

const ROW_FIELDS: Record<RowKey, string[]> = {
  avian_vet: ["avian_vet_name", "avian_vet_phone", "avian_vet_address"],
  emergency_vet: ["emergency_vet_name", "emergency_vet_phone", "emergency_vet_address"],
  owner_phone: ["owner_phone"],
  backup: ["backup_name", "backup_phone"],
  poison_control: ["poison_control"],
  carrier: ["carrier_location"],
  first_aid: ["first_aid_kit_location"],
  spending: ["spending_limit"],
};

function rowLabel(t: TFunction, k: RowKey): string {
  switch (k) {
    case "avian_vet": return t("emergencySetup.avianVet", "Avian vet");
    case "emergency_vet": return t("emergencySetup.emergencyVet", "Emergency vet");
    case "owner_phone": return t("emergencySetup.yourPhone", "Your phone");
    case "backup": return t("emergencySetup.backupContact", "Backup contact");
    case "poison_control": return t("emergencySetup.aspca", "ASPCA Animal Poison Control");
    case "carrier": return t("emergencySetup.carrier", "Where is your pet carrier?");
    case "first_aid": return t("emergencySetup.firstAid", "Where is your first-aid kit?");
    case "spending": return t("emergencySetup.spending", "Vet spending limit without calling you");
  }
}

function fieldLabel(t: TFunction, k: string): string {
  if (k.endsWith("_name") && k !== "backup_name") return t("emergencyInfo.fieldClinic", "Clinic");
  if (k.endsWith("_address")) return t("emergencyInfo.fieldAddress", "Address");
  if (k === "backup_name") return t("emergencySetup.name", "Name");
  if (isPhoneField(k)) return t("emergencyInfo.fieldPhone", "Phone");
  return "";
}

export type EmergencySetupState = { missingOwnerPhone: boolean; missingVetPhone: boolean };

export function EmergencyContactsScreen({
  birdId,
  birdName,
  onState,
  onSubline,
}: {
  birdId: string;
  birdName: string;
  /** Which required contacts are still missing (the footer and Next use it). */
  onState: (s: EmergencySetupState) => void;
  /** The header line under "Your home" ("Different for [bird]"), or null. */
  onSubline: (line: string | null) => void;
}) {
  const { t } = useTranslation();
  const [loaded, setLoaded] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [own, setOwn] = useState<Record<string, string>>({});
  const [shared, setShared] = useState<Record<string, string>>({});
  const [mode, setMode] = useState<"shared" | "bird">("shared");
  const [sheet, setSheet] = useState<RowKey | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const { confirm, sheet: confirmSheet } = useConfirm();

  const clean = (row: any) => Object.fromEntries(EMERGENCY_FIELDS.map((k) => [k, (row?.[k] ?? "").toString().trim()]));

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [{ data: session }, { data: bird }, { data: contacts }] = await Promise.all([
        supabase.auth.getSession(),
        supabase.from("birds").select("owner_id").eq("id", birdId).maybeSingle(),
        supabase.from("emergency_contacts").select("*").eq("bird_id", birdId).maybeSingle(),
      ]);
      const uid = session.session?.user?.id ?? null;
      const owner = !!uid && (bird as any)?.owner_id === uid;
      const { data: defaults } = owner
        ? await supabase.from("owner_emergency_defaults").select("*").eq("owner_id", uid!).maybeSingle()
        : { data: null };
      if (cancelled) return;
      const o = clean(contacts);
      let d = clean(defaults);
      // No shared contacts yet, but this bird has its own (set before shared
      // contacts existed): they become the shared ones, as Reminders does.
      // Other birds with contacts of their own keep them.
      if (owner && !EMERGENCY_FIELDS.some((k) => d[k]) && EMERGENCY_FIELDS.some((k) => o[k])) {
        const row = Object.fromEntries(EMERGENCY_FIELDS.map((k) => [k, o[k] || null]));
        const { error } = await supabase.from("owner_emergency_defaults").upsert({ owner_id: uid, ...row } as any, { onConflict: "owner_id" });
        if (!error) d = { ...o };
      }
      if (cancelled) return;
      setUserId(uid);
      setIsOwner(owner);
      setOwn(o);
      setShared(d);
      // Different for this bird when it has a value of its own that isn't the shared one.
      const different = EMERGENCY_FIELDS.some((k) => o[k] !== "" && o[k] !== d[k]);
      setMode(!owner || different ? "bird" : "shared");
      setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [birdId]);

  // What this bird uses: its own value, else the shared one.
  const eff = (k: string) => own[k] || shared[k] || "";
  const display = (k: string) => eff(k) || (k === "poison_control" ? ASPCA_POISON_CONTROL : "");

  const missingOwnerPhone = loaded && !eff("owner_phone");
  const missingVetPhone = loaded && !eff("avian_vet_phone");
  useEffect(() => { if (loaded) onState({ missingOwnerPhone, missingVetPhone }); }, [loaded, missingOwnerPhone, missingVetPhone, onState]);
  useEffect(() => {
    onSubline(loaded && mode === "bird" ? t("birdSetup.reminders.differentTitle", "Different for {{name}}", { name: birdName }) : null);
    return () => onSubline(null);
  }, [loaded, mode, birdName, onSubline, t]);

  function open(k: RowKey) {
    setForm(Object.fromEntries(ROW_FIELDS[k].map((f) => [f, display(f)])));
    setSheet(k);
  }

  async function save() {
    if (!sheet) return;
    setSaving(true);
    try {
      const fields = ROW_FIELDS[sheet];
      const values = Object.fromEntries(fields.map((f) => [f, (form[f] ?? "").trim()]));
      if (mode === "shared" && isOwner && userId) {
        const row: Record<string, string | null> = {};
        for (const f of fields) row[f] = values[f] || null;
        const { error } = await supabase.from("owner_emergency_defaults").upsert({ owner_id: userId, ...row } as any, { onConflict: "owner_id" });
        if (error) throw error;
        // This bird follows the shared contacts for these fields.
        if (fields.some((f) => own[f])) {
          const clear = Object.fromEntries(fields.map((f) => [f, null]));
          const { error: e2 } = await supabase.from("emergency_contacts").update(clear as any).eq("bird_id", birdId);
          if (e2) throw e2;
        }
        setShared((s) => ({ ...s, ...Object.fromEntries(fields.map((f) => [f, values[f]])) }));
        setOwn((o) => ({ ...o, ...Object.fromEntries(fields.map((f) => [f, ""])) }));
      } else {
        // An override only where it differs from the shared value.
        const patch = Object.fromEntries(fields.map((f) => [f, values[f] === "" || values[f] === shared[f] ? null : values[f]]));
        const { error } = await supabase.from("emergency_contacts").update(patch as any).eq("bird_id", birdId);
        if (error) throw error;
        setOwn((o) => ({ ...o, ...Object.fromEntries(fields.map((f) => [f, (patch[f] as string | null) ?? ""])) }));
      }
      setSheet(null);
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setSaving(false);
    }
  }

  async function useShared() {
    const ok = await confirm({
      title: t("emergencySetup.useSharedConfirmTitle", "Use your shared contacts for {{name}}?", { name: birdName }),
      body: t("emergencySetup.useSharedConfirmBody", "The contacts that are different for {{name}} will be removed.", { name: birdName }),
      confirmLabel: t("emergencySetup.useSharedConfirmAction", "Use shared contacts"),
      cancelLabel: t("emergencySetup.useSharedConfirmKeep", "Keep them different"),
    });
    if (!ok) return;
    const clear = Object.fromEntries(EMERGENCY_FIELDS.map((f) => [f, null]));
    const { error } = await supabase.from("emergency_contacts").update(clear as any).eq("bird_id", birdId);
    if (error) { toast.error(friendlyError(error)); return; }
    setOwn(Object.fromEntries(EMERGENCY_FIELDS.map((f) => [f, ""])));
    setMode("shared");
  }

  async function pickContact() {
    try {
      const nav = navigator as any;
      const [c] = await nav.contacts.select(["name", "tel"], { multiple: false });
      if (!c) return;
      setForm((f) => ({ ...f, backup_name: c.name?.[0] ?? f.backup_name ?? "", backup_phone: formatPhoneOnBlur(c.tel?.[0] ?? f.backup_phone ?? "") }));
    } catch { /* cancelled or not allowed */ }
  }
  const canPickContacts = typeof navigator !== "undefined" && "contacts" in navigator && "ContactsManager" in window;

  if (!loaded) return <div className="h-32 animate-pulse rounded-2xl bg-white" />;

  const row = (k: RowKey, required = false) => {
    const fields = ROW_FIELDS[k];
    // Vets show the clinic, or the phone; the backup shows name and phone.
    const value = k === "backup"
      ? [display("backup_name"), display("backup_phone")].filter(Boolean).join(" · ")
      : k === "avian_vet" || k === "emergency_vet"
        ? display(fields[0]) || display(fields[1])
        : display(fields[0]);
    const needs = required && (k === "avian_vet" ? !eff("avian_vet_phone") : !eff("owner_phone"));
    const filled = !!value && !needs;
    return (
      <button
        key={k}
        type="button"
        onClick={() => open(k)}
        className={`flex min-h-[60px] w-full items-center gap-3 rounded-[14px] px-4 py-2.5 text-left ${filled ? "" : "border-2 border-dashed bg-white"}`}
        style={filled ? { background: S.card, color: S.forest } : { borderColor: S.footerLine, color: S.forest }}
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[13px]" style={{ color: S.quiet }}>{rowLabel(t, k)}</span>
          {filled ? (
            <span className="block truncate text-[15.5px] font-[700]">{value}</span>
          ) : (
            <span className="block text-[15px] font-[700]" style={{ color: S.moss }}>{value || t("emergencySetup.add", "+ Add")}</span>
          )}
        </span>
        {filled ? (
          <span className="grid size-7 shrink-0 place-items-center rounded-full" style={{ background: S.lime, color: S.forest }} aria-hidden="true">
            <Check className="size-4" strokeWidth={3} />
          </span>
        ) : needs ? <Tag kind="required" /> : null}
      </button>
    );
  };

  const sheetFields = sheet ? ROW_FIELDS[sheet] : [];

  return (
    <div className="flex flex-col gap-[14px]">
      {isOwner && (
        <div className="flex flex-col gap-1 rounded-[20px] bg-white p-4" style={{ color: S.forest }}>
          {mode === "shared" ? (
            <>
              <p className="m-0 text-[15px] font-[700]">{t("emergencySetup.sharedTitle", "Saved for every bird")}</p>
              <div><SetupTextButton onClick={() => setMode("bird")}>{t("emergencySetup.makeDifferent", "Make these different for {{name}}", { name: birdName })}</SetupTextButton></div>
            </>
          ) : (
            <>
              <p className="m-0 text-[15px] font-[700]">{t("birdSetup.reminders.differentTitle", "Different for {{name}}", { name: birdName })}</p>
              <p className="m-0 text-[14px]" style={{ color: S.helper }}>{t("emergencySetup.differentBody", "Changes here apply to {{name}} only.", { name: birdName })}</p>
              {EMERGENCY_FIELDS.some((k) => shared[k]) && (
                <div><SetupTextButton onClick={useShared}>{t("emergencySetup.useShared", "Use the shared contacts instead")}</SetupTextButton></div>
              )}
            </>
          )}
        </div>
      )}

      <TileCard icon={<Cross className="size-5" />} title={t("emergencySetup.vets", "Vets")}>
        <div className="flex flex-col gap-2">{row("avian_vet", true)}{row("emergency_vet")}</div>
      </TileCard>
      <TileCard icon={<Phone className="size-5" />} title={t("emergencySetup.you", "You")}>
        <div className="flex flex-col gap-2">{row("owner_phone", true)}{row("backup")}</div>
      </TileCard>
      <TileCard icon={<AlertTriangle className="size-5" />} title={t("emergencySetup.poisonControl", "Poison control")}>
        {row("poison_control")}
      </TileCard>
      <TileCard icon={<ShoppingBag className="size-5" />} title={t("emergencySetup.transport", "Transport & spending")}>
        <div className="flex flex-col gap-2">{row("carrier")}{row("first_aid")}{row("spending")}</div>
      </TileCard>

      {sheet && (
        <BottomSheet onClose={() => setSheet(null)}>
          <div className="flex flex-col gap-4" style={{ color: S.forest }}>
            <div className="flex items-start gap-3">
              <h2 className="m-0 min-w-0 flex-1 pt-2 text-[24px] font-[700] leading-[1.15]" style={{ fontFamily: SERIF }}>{rowLabel(t, sheet)}</h2>
              <button
                type="button"
                aria-label={t("foodEditor.closeSheet", "Close")}
                onClick={() => setSheet(null)}
                className="grid size-11 shrink-0 place-items-center rounded-full active:scale-95"
                style={{ background: S.card, color: S.forest }}
              >
                <X className="size-5" aria-hidden="true" />
              </button>
            </div>
            {sheet === "backup" && canPickContacts && (
              <SetupSecondaryButton onClick={pickContact}>
                <Contact className="size-5" aria-hidden="true" /> {t("emergencySetup.pickFromContacts", "Pick from contacts")}
              </SetupSecondaryButton>
            )}
            {sheetFields.map((f) => {
              const warn = isPhoneField(f) ? phoneWarning(form[f]) : null;
              const label = sheetFields.length > 1 ? fieldLabel(t, f) : null;
              const input: ReactNode = (
                <TextField
                  id={`emergency-${f}`}
                  value={form[f] ?? ""}
                  inputMode={isPhoneField(f) ? "tel" : undefined}
                  type={isPhoneField(f) ? "tel" : "text"}
                  maxLength={200}
                  ariaLabel={label ? undefined : rowLabel(t, sheet)}
                  onChange={(v) => setForm((p) => ({ ...p, [f]: v }))}
                />
              );
              return (
                <div key={f} className="flex flex-col gap-1.5" onBlur={isPhoneField(f) ? () => setForm((p) => ({ ...p, [f]: formatPhoneOnBlur(p[f] ?? "") })) : undefined}>
                  {label ? <Field label={label} htmlFor={`emergency-${f}`}>{input}</Field> : input}
                  {warn && <p className="m-0 text-[14px]" style={{ color: S.amberText }}>{warn}</p>}
                </div>
              );
            })}
            <SetupPrimaryButton onClick={save} disabled={saving} arrow={false}>{t("foodEditor.done", "Done")}</SetupPrimaryButton>
          </div>
        </BottomSheet>
      )}
      {confirmSheet}
    </div>
  );
}

// Emergency info as a contact list: "People to call" (you, backup, avian vet,
// after-hours vet, poison control) and "Around the house" (carrier, first-aid
// kit, vet spending limit). Shared by the account page (/account/emergency)
// and each bird's emergency page. Tapping a row opens a small sheet with only
// that row's fields.
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Phone, Stethoscope, Siren, FlaskConical, Briefcase, Cross, Wallet, Plus, UserRound } from "lucide-react";
import { K, KyaCard, KyaHeading, KyaField, KyaPrimaryButton, KyaRequiredTag, KyaSheet } from "@/components/kya";
import { AddressInput } from "@/components/AddressInput";
import { EMERGENCY_ROWS, REQUIRED_FIELDS, formatPhoneOnBlur, isPhoneField, phoneWarning, type EmergencyField, type EmergencyRowKey } from "@/lib/emergency";
import { isAddressField } from "@/lib/address";
import { useHomePoisonLine } from "@/lib/useHomePoisonLine";
import type { PoisonLine } from "@/lib/poisonControl";

export type EmergencyValues = Partial<Record<EmergencyField, string | null>>;

// The contact rows live in src/lib/emergency.ts so the one merge
// (mergeEmergency) and these screens group fields the same way.
export type RowKey = EmergencyRowKey;
export const ROW_FIELDS: Record<RowKey, EmergencyField[]> = EMERGENCY_ROWS;

const PEOPLE: RowKey[] = ["you", "backup", "avian_vet", "emergency_vet", "poison"];
const HOUSE: RowKey[] = ["carrier", "first_aid", "spending"];

const v = (vals: EmergencyValues, f: EmergencyField) => (vals[f] ?? "").toString().trim();

/** The value shown for a field: poison control falls back to the local line
 *  where there is one (US: ASPCA; see poisonControl.ts), else stays empty. */
export function shownValue(vals: EmergencyValues, f: EmergencyField, poisonLine: PoisonLine | null = null): string {
  return v(vals, f) || (f === "poison_control" ? poisonLine?.display ?? "" : "");
}

/** Required numbers a sitter needs that are still empty. */
export function missingRequired(vals: EmergencyValues): EmergencyField[] {
  return REQUIRED_FIELDS.filter((f) => !v(vals, f));
}

/** `viewerIsOwner` false (a household member viewing someone else's bird):
 *  the "you" row is the bird's owner, not the viewer. */
export function rowLabel(t: TFunction, k: RowKey, viewerIsOwner = true): string {
  switch (k) {
    case "you": return viewerIsOwner ? t("emergencyList.you", "You") : t("emergencyList.owner", "Owner");
    case "backup": return t("emergencyList.backup", "Backup contact");
    case "avian_vet": return t("emergencyList.avianVet", "Avian vet");
    case "emergency_vet": return t("emergencyList.emergencyVet", "After-hours emergency vet");
    case "poison": return t("emergencyList.poison", "Poison control");
    case "carrier": return t("emergencyList.carrier", "Carrier");
    case "first_aid": return t("emergencyList.firstAid", "First-aid kit");
    case "spending": return t("emergencyList.spending", "Vet spending limit");
  }
}

function fieldLabel(t: TFunction, f: EmergencyField, viewerIsOwner = true): string {
  switch (f) {
    case "owner_phone": return viewerIsOwner ? t("emergencyList.field.yourPhone", "Your phone") : t("emergencyList.field.ownerPhone", "Owner's phone");
    case "backup_name": return t("emergencyList.field.name", "Name");
    case "backup_phone": return t("emergencyList.field.phone", "Phone");
    case "avian_vet_name": return t("emergencyList.field.vetName", "Vet or clinic name");
    case "avian_vet_phone": return t("emergencyList.field.phone", "Phone");
    case "avian_vet_address": return t("emergencyList.field.address", "Address");
    case "emergency_vet_name": return t("emergencyList.field.clinicName", "Clinic name");
    case "emergency_vet_phone": return t("emergencyList.field.phone", "Phone");
    case "emergency_vet_address": return t("emergencyList.field.address", "Address");
    case "poison_control": return t("emergencyList.field.poisonNumber", "Poison control number");
    case "carrier_location": return t("emergencyList.field.carrier", "Where's the carrier?");
    case "first_aid_kit_location": return t("emergencyList.field.firstAid", "Where's the first-aid kit?");
    case "spending_limit": return t("emergencyList.field.spending", "Vet spending limit");
  }
}

/** "300" / "$300" → "Up to $300 without reaching you"; anything else as typed. */
function spendingLine(t: TFunction, raw: string): string {
  const m = raw.replace(/[,\s]/g, "").match(/^\$?(\d+(?:\.\d{1,2})?)$/);
  return m ? t("emergencyList.spendingUpTo", "Up to ${{amount}} without reaching you", { amount: m[1] }) : raw;
}

/** The whole address on one run of text (line breaks become commas); the row
 *  lets it wrap to two lines. */
function oneLineAddress(a: string): string {
  return a.split(/\n+/).map((l) => l.trim()).filter(Boolean).join(", ");
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}

function Avatar({ k, name }: { k: RowKey; name: string }) {
  const icon: Record<string, ReactNode> = {
    avian_vet: <Stethoscope className="size-5" />,
    emergency_vet: <Siren className="size-5" />,
    poison: <FlaskConical className="size-5" />,
    carrier: <Briefcase className="size-5" />,
    first_aid: <Cross className="size-5" />,
    spending: <Wallet className="size-5" />,
  };
  const content = icon[k] ?? (name.trim() ? <span className="text-[15px] font-[700]">{initialsOf(name)}</span> : <UserRound className="size-5" />);
  return (
    <span className="grid size-[42px] shrink-0 place-items-center rounded-full" style={{ background: K.forest, color: K.lime }} aria-hidden="true">
      {content}
    </span>
  );
}

function CallButton({ phone, label }: { phone: string; label: string }) {
  return (
    <a
      href={`tel:${phone.replace(/[^\d+]/g, "")}`}
      aria-label={label}
      onClick={(e) => e.stopPropagation()}
      className="grid size-11 shrink-0 place-items-center rounded-full border-2 bg-white active:scale-95"
      style={{ borderColor: K.forest, color: K.forest }}
    >
      <Phone className="size-[18px]" />
    </a>
  );
}

export function EmergencyList({ values, ownerName, editable, onEdit, badge, viewerIsOwner = true }: {
  values: EmergencyValues;
  /** The owner's name, for the "You" row. */
  ownerName: string;
  /** False when a household member views the owner's info ("Owner", not "You"). */
  viewerIsOwner?: boolean;
  editable: boolean;
  onEdit?: (k: RowKey) => void;
  /** Optional per-row tag (e.g. "Custom for Max"). */
  badge?: (k: RowKey) => ReactNode;
}) {
  const { t } = useTranslation();
  const poisonLine = useHomePoisonLine();

  const row = (k: RowKey, last: boolean) => {
    const fields = ROW_FIELDS[k];
    const phoneField = fields.find((f) => isPhoneField(f));
    const phone = phoneField ? shownValue(values, phoneField, poisonLine) : "";
    const nameField = fields.find((f) => f.endsWith("_name"));
    const addressField = fields.find((f) => isAddressField(f));
    const filled = fields.some((f) => shownValue(values, f));
    const requiredGap = fields.some((f) => REQUIRED_FIELDS.includes(f) && !v(values, f));
    const isHouse = HOUSE.includes(k);

    let title = "";
    let detail = "";
    let address = "";
    if (k === "you") { title = ownerName || rowLabel(t, k, viewerIsOwner); detail = phone; }
    else if (k === "poison") { title = phone; }
    else if (isHouse) {
      const val = shownValue(values, fields[0]);
      title = k === "spending" && val ? spendingLine(t, val) : val;
    } else {
      title = (nameField && shownValue(values, nameField)) || phone;
      const addr = addressField ? shownValue(values, addressField) : "";
      detail = nameField && shownValue(values, nameField) ? phone : "";
      address = addr ? oneLineAddress(addr) : "";
    }

    const body = (
      <>
        <Avatar k={k} name={title} />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px]" style={{ color: requiredGap ? K.amberText : K.quiet }}>
            {rowLabel(t, k, viewerIsOwner)}
            {badge?.(k)}
          </span>
          {requiredGap && <span className="block text-[12.5px] font-[700]" style={{ color: K.amberText }}>{t("emergencyList.neededBeforeSit", "Needed before a sitter can start")}</span>}
          {filled && title ? (
            <>
              <span className="mt-0.5 block truncate text-[15px] font-[700]">{title}</span>
              {detail && <span className="block truncate text-[13px]" style={{ color: K.quiet }}>{detail}</span>}
              {address && <span className="line-clamp-2 text-[13px] leading-[1.4]" style={{ color: K.quiet }}>{address}</span>}
            </>
          ) : (
            <span className="mt-0.5 block text-[15px]" style={{ color: K.quiet }}>{t("emergencyList.notAdded", "Not added")}</span>
          )}
        </span>
        {!isHouse && phone ? (
          <CallButton phone={phone} label={t("emergencyList.call", "Call {{who}}", { who: title || rowLabel(t, k, viewerIsOwner) })} />
        ) : !filled && editable ? (
          <span className="inline-flex shrink-0 items-center gap-1 text-[15px] font-[700]" style={{ color: K.moss }}>
            <Plus className="size-4" /> {t("emergencyList.add", "Add")}
          </span>
        ) : null}
      </>
    );
    const cls = "flex min-h-[64px] w-full items-center gap-3 px-4 py-2.5 text-left";
    const style = { borderBottom: last ? undefined : `1px solid ${K.line}`, background: requiredGap ? K.amberBg : undefined, color: K.forest };
    return editable && onEdit ? (
      <div
        key={k}
        role="button"
        tabIndex={0}
        onClick={() => onEdit(k)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onEdit(k); } }}
        className={`${cls} cursor-pointer active:bg-black/[0.03]`}
        style={style}
      >
        {body}
      </div>
    ) : (
      <div key={k} className={cls} style={style}>{body}</div>
    );
  };

  return (
    <>
      <section className="flex flex-col gap-2.5">
        <KyaHeading size={19}>{t("emergencyList.peopleToCall", "People to call")}</KyaHeading>
        <KyaCard>{PEOPLE.map((k, i) => row(k, i === PEOPLE.length - 1))}</KyaCard>
      </section>
      <section className="flex flex-col gap-2.5">
        <KyaHeading size={19}>{t("emergencyList.aroundTheHouse", "Around the house")}</KyaHeading>
        <KyaCard>{HOUSE.map((k, i) => row(k, i === HOUSE.length - 1))}</KyaCard>
      </section>
    </>
  );
}


/** The edit sheet for one row: only that row's fields, pinned Save. */
export function EmergencyRowSheet({ rowKey, initial, saving, onSave, onClose, extra, viewerIsOwner = true }: {
  rowKey: RowKey;
  viewerIsOwner?: boolean;
  initial: EmergencyValues;
  saving: boolean;
  onSave: (patch: Record<string, string | null>) => void;
  onClose: () => void;
  extra?: ReactNode;
}) {
  const { t } = useTranslation();
  const poisonLine = useHomePoisonLine();
  const fields = ROW_FIELDS[rowKey];
  const [form, setForm] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((f) => [f, shownValue(initial, f, poisonLine)])),
  );
  const bad = fields.some((f) => isPhoneField(f) && !!phoneWarning(form[f]));
  const save = () => onSave(Object.fromEntries(fields.map((f) => [f, (form[f] ?? "").trim() || null])));

  return (
    <KyaSheet
      onClose={onClose}
      closeLabel={t("emergencyList.close", "Close")}
      title={<KyaHeading size={24}>{rowLabel(t, rowKey, viewerIsOwner)}</KyaHeading>}
      footer={<KyaPrimaryButton onClick={save} disabled={saving || bad}>{saving ? t("emergencyList.saving", "Saving…") : t("emergencyList.save", "Save")}</KyaPrimaryButton>}
    >
      <div className="flex flex-col gap-4">
        {fields.map((f) => {
          const id = `em-${f}`;
          const tag = REQUIRED_FIELDS.includes(f) ? <KyaRequiredTag tone="forest">{t("emergencyList.required", "Required")}</KyaRequiredTag> : undefined;
          if (isAddressField(f)) {
            return (
              <div key={f} className="flex flex-col gap-2 pt-1">
                {/* Group heading; Street, City, State, and ZIP each have their label above. */}
                <span className="text-[15px] font-[700]" aria-hidden="true">{fieldLabel(t, f, viewerIsOwner)}</span>
                <AddressInput label={fieldLabel(t, f, viewerIsOwner)} value={form[f] ?? ""} onChange={(val) => setForm((p) => ({ ...p, [f]: val }))} />
              </div>
            );
          }
          const warn = isPhoneField(f) ? phoneWarning(form[f]) : null;
          const hint = f === "spending_limit"
            ? t("emergencyList.spendingHint", "The most a sitter can approve for vet care if they can't reach you.")
            : warn ? <span style={{ color: K.red }}>{warn}</span> : undefined;
          return (
            <KyaField
              key={f}
              id={id}
              label={fieldLabel(t, f, viewerIsOwner)}
              tag={tag}
              hint={hint}
              value={form[f] ?? ""}
              inputMode={isPhoneField(f) ? "tel" : f === "spending_limit" ? "decimal" : undefined}
              placeholder={f === "spending_limit" ? t("emergencyList.spendingPlaceholder", "e.g. $300") : undefined}
              onChange={(e) => setForm((p) => ({ ...p, [f]: e.target.value }))}
              onBlur={isPhoneField(f) ? (e) => setForm((p) => ({ ...p, [f]: formatPhoneOnBlur(e.target.value) })) : undefined}
            />
          );
        })}
        {extra}
      </div>
    </KyaSheet>
  );
}

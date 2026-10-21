import i18next from "i18next";

export const EMERGENCY_FIELDS = [
  "owner_phone",
  "backup_name",
  "backup_phone",
  "avian_vet_name",
  "avian_vet_phone",
  "avian_vet_address",
  "emergency_vet_name",
  "emergency_vet_phone",
  "emergency_vet_address",
  "poison_control",
  "carrier_location",
  "first_aid_kit_location",
  "spending_limit",
] as const;

export type EmergencyField = (typeof EMERGENCY_FIELDS)[number];

export const EMERGENCY_LABELS: Record<EmergencyField, string> = {
  owner_phone: "Owner phone",
  backup_name: "Backup contact name",
  backup_phone: "Backup contact phone",
  avian_vet_name: "Avian vet name",
  avian_vet_phone: "Avian vet phone",
  avian_vet_address: "Avian vet address",
  emergency_vet_name: "Emergency vet name",
  emergency_vet_phone: "Emergency vet phone",
  emergency_vet_address: "Emergency vet address",
  poison_control: "Poison control number",
  carrier_location: "Carrier location",
  first_aid_kit_location: "First-aid kit location",
  spending_limit: "Approved spending limit",
};

export const REQUIRED_FIELDS: EmergencyField[] = ["owner_phone", "avian_vet_phone"];

// Emergency fields that hold a phone number (validated as the owner types).
export const PHONE_FIELDS: EmergencyField[] = [
  "owner_phone",
  "backup_phone",
  "avian_vet_phone",
  "emergency_vet_phone",
  "poison_control",
];

export function isPhoneField(field: string): boolean {
  return (PHONE_FIELDS as string[]).includes(field);
}

// Lenient "looks like a phone number" check: common separators, an optional
// country code, and an optional extension, with a sane digit count (7–15, per
// E.164). Empty is treated as valid here — required-ness is handled separately.
const PHONE_RE = /^\+?[\d\s().-]{6,}(?:\s*(?:x|ext\.?)\s*\d+)?$/i;

/**
 * A short reason a phone value looks wrong, or null if it's fine (or empty).
 * Used to flag typos / wrong digit counts at the emergency-number inputs.
 */
export function phoneWarning(v: string | null | undefined): string | null {
  const s = (v ?? "").trim();
  if (!s) return null;
  const digits = (s.match(/\d/g) || []).length;
  if (digits < 7) return i18next.t("phoneCheck.tooShort", "That looks too short for a phone number.");
  if (digits > 15) return i18next.t("phoneCheck.tooLong", "That looks too long for a phone number.");
  if (!PHONE_RE.test(s)) return i18next.t("phoneCheck.invalid", "That doesn't look like a valid phone number.");
  return null;
}

/**
 * Tidy a US phone number into "(555) 555-5555" (or "+1 (555) 555-5555" with a
 * country code) once the owner leaves the field. Only touches plain 10-digit or
 * 1+10-digit US numbers — anything with an extension or a non-US format (e.g. a
 * leading + with another country code) is left exactly as typed.
 */
export function formatPhoneOnBlur(v: string | null | undefined): string {
  const s = (v ?? "").trim();
  if (!s) return s;
  const digits = s.replace(/\D/g, "");
  if (/^\d{10}$/.test(digits)) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (/^1\d{10}$/.test(digits)) {
    const d = digits.slice(1);
    return `+1 (${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  }
  return s;
}

// ASPCA Animal Poison Control — the poison-control default, auto-filled so the
// number is always present without the owner looking it up.
export const ASPCA_POISON_CONTROL = "(888) 426-4435";

function clean(v: unknown): string | null {
  if (typeof v !== "string") return v == null ? null : String(v);
  const t = v.trim();
  return t.length ? t : null;
}

// Emergency info is grouped into CONTACT ROWS: one person, clinic, or place
// each. A row's fields always travel together, so a bird's own vet never
// shows the account vet's name or address in one of its blanks.
export type EmergencyRowKey = "you" | "backup" | "avian_vet" | "emergency_vet" | "poison" | "carrier" | "first_aid" | "spending";

export const EMERGENCY_ROWS: Record<EmergencyRowKey, EmergencyField[]> = {
  you: ["owner_phone"],
  backup: ["backup_name", "backup_phone"],
  avian_vet: ["avian_vet_name", "avian_vet_phone", "avian_vet_address"],
  emergency_vet: ["emergency_vet_name", "emergency_vet_phone", "emergency_vet_address"],
  poison: ["poison_control"],
  carrier: ["carrier_location"],
  first_aid: ["first_aid_kit_location"],
  spending: ["spending_limit"],
};

export const EMERGENCY_ROW_KEYS = Object.keys(EMERGENCY_ROWS) as EmergencyRowKey[];

/**
 * True when the bird has its OWN version of this contact row: any of the
 * row's fields is set on the bird's emergency_contacts row. A row stored
 * partially under the old per-field rule (only the fields that differed from
 * the account were saved) counts as the bird's own, and its blanks stay blank.
 */
export function birdOwnsRow(bird: Record<string, any> | null | undefined, row: EmergencyRowKey): boolean {
  return EMERGENCY_ROWS[row].some((f) => clean(bird?.[f]) !== null);
}

/** The contact rows a bird has its own version of ("Custom for [bird]"). */
export function birdOwnRows(bird: Record<string, any> | null | undefined): EmergencyRowKey[] {
  return EMERGENCY_ROW_KEYS.filter((r) => birdOwnsRow(bird, r));
}

/**
 * The emergency info a bird actually uses, merged per CONTACT ROW: a row the
 * bird has its own version of is taken whole from the bird (its blanks stay
 * blank and show as "Not added"); every other row is taken whole from the
 * account. Never mixes the two inside one row. The one merge every screen,
 * server function, and sitter view uses.
 */
export function mergeEmergency(
  bird: Record<string, any> | null | undefined,
  defaults: Record<string, any> | null | undefined,
): Record<EmergencyField, string | null> {
  const out = {} as Record<EmergencyField, string | null>;
  for (const row of EMERGENCY_ROW_KEYS) {
    const src = birdOwnsRow(bird, row) ? bird : defaults;
    for (const f of EMERGENCY_ROWS[row]) out[f] = clean(src?.[f]);
  }
  return out;
}

/** True when this field comes from the account (its row isn't the bird's own). */
export function isInherited(
  field: EmergencyField,
  bird: Record<string, any> | null | undefined,
): boolean {
  const row = EMERGENCY_ROW_KEYS.find((r) => EMERGENCY_ROWS[r].includes(field));
  return !row || !birdOwnsRow(bird, row);
}

/** True when a bird has its own version of any contact row ("Different for
 *  [bird]"), so it no longer follows the account for that row. A row counts
 *  whether or not its values happen to match the account's today. `defaults`
 *  is accepted for the existing call sites and not needed. */
export function emergencyDifferent(contacts: Record<string, any> | null | undefined, _defaults?: Record<string, any> | null | undefined): boolean {
  return birdOwnRows(contacts).length > 0;
}

/** What to store when the bird saves its own version of a row: EVERY field of
 *  the row (blanks as null), never only the ones that differ from the account. */
export function birdRowPatch(row: EmergencyRowKey, values: Record<string, string | null | undefined>): Record<EmergencyField, string | null> {
  const out = {} as Record<EmergencyField, string | null>;
  for (const f of EMERGENCY_ROWS[row]) out[f] = clean(values[f]);
  return out;
}

export type VetRecord = { kind: "avian" | "emergency"; name: string | null; phone: string | null; address: string | null };

/**
 * The one vet to call when a screen shows a single vet row: the avian vet if
 * it has a number, else the after-hours emergency vet. The record is picked
 * FIRST and its name, phone, and address are read together, so a row never
 * shows one vet's name with the other's number. `kind` drives the row label
 * ("Avian vet" vs "After-hours emergency vet"). Null when neither has anything.
 */
export function pickVet(contacts: Record<string, any> | null | undefined): VetRecord | null {
  const rec = (kind: VetRecord["kind"]): VetRecord => ({
    kind,
    name: clean(contacts?.[`${kind}_vet_name`]),
    phone: clean(contacts?.[`${kind}_vet_phone`]),
    address: clean(contacts?.[`${kind}_vet_address`]),
  });
  const avian = rec("avian");
  const emergency = rec("emergency");
  if (avian.phone) return avian;
  if (emergency.phone) return emergency;
  if (avian.name || avian.address) return avian;
  if (emergency.name || emergency.address) return emergency;
  return null;
}

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
  if (digits < 7) return "That looks too short for a phone number.";
  if (digits > 15) return "That looks too long for a phone number.";
  if (!PHONE_RE.test(s)) return "That doesn't look like a valid phone number.";
  return null;
}

// ASPCA Animal Poison Control — the poison-control default, auto-filled so the
// number is always present without the owner looking it up.
export const ASPCA_POISON_CONTROL = "(888) 426-4435";

function clean(v: unknown): string | null {
  if (typeof v !== "string") return v == null ? null : String(v);
  const t = v.trim();
  return t.length ? t : null;
}

/** Merge per-bird contacts over owner defaults. Per-bird wins when non-empty. */
export function mergeEmergency(
  bird: Record<string, any> | null | undefined,
  defaults: Record<string, any> | null | undefined,
): Record<EmergencyField, string | null> {
  const out = {} as Record<EmergencyField, string | null>;
  for (const f of EMERGENCY_FIELDS) {
    out[f] = clean(bird?.[f]) ?? clean(defaults?.[f]);
  }
  return out;
}

export function isInherited(
  field: EmergencyField,
  bird: Record<string, any> | null | undefined,
): boolean {
  return clean(bird?.[field]) === null;
}

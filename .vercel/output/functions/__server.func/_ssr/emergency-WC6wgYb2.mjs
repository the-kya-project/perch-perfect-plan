const EMERGENCY_FIELDS = [
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
  "emergency_authorization",
  "spending_limit"
];
const EMERGENCY_LABELS = {
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
  emergency_authorization: "Emergency-care authorization",
  spending_limit: "Approved spending limit"
};
const REQUIRED_FIELDS = ["owner_phone", "avian_vet_phone"];
function clean(v) {
  if (typeof v !== "string") return v == null ? null : String(v);
  const t = v.trim();
  return t.length ? t : null;
}
function mergeEmergency(bird, defaults) {
  const out = {};
  for (const f of EMERGENCY_FIELDS) {
    out[f] = clean(bird?.[f]) ?? clean(defaults?.[f]);
  }
  return out;
}
export {
  EMERGENCY_FIELDS as E,
  REQUIRED_FIELDS as R,
  EMERGENCY_LABELS as a,
  mergeEmergency as m
};

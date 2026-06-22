// Structured address helpers. Emergency addresses are stored as a single text
// column (and shown as one line in the sitter view), but owners enter them via
// separate street / city / state / ZIP fields. These compose those parts into
// one string and parse a stored string back into parts (best-effort). Anything
// that doesn't fit the "street, city, ST zip" shape falls back to the whole
// value in `street`, so no data is ever lost on a round-trip.

export type AddressParts = { street: string; city: string; state: string; zip: string };

export const EMPTY_ADDRESS: AddressParts = { street: "", city: "", state: "", zip: "" };

export function isAddressField(field: string): boolean {
  return field.endsWith("_address");
}

/** Join parts into "123 Main St, Springfield, IL 62704", dropping empties. */
export function composeAddress(p: AddressParts): string {
  const stateZip = [p.state.trim(), p.zip.trim()].filter(Boolean).join(" ");
  const cityLine = [p.city.trim(), stateZip].filter(Boolean).join(", ");
  return [p.street.trim(), cityLine].filter(Boolean).join(", ").trim();
}

/** Best-effort split of a stored address back into parts. */
export function parseAddress(full: string | null | undefined): AddressParts {
  const s = (full ?? "").trim();
  if (!s) return { ...EMPTY_ADDRESS };

  const parts = s.split(",").map((p) => p.trim()).filter(Boolean);
  let state = "";
  let zip = "";

  if (parts.length) {
    const last = parts[parts.length - 1];
    const stateZip = last.match(/^([A-Za-z]{2,})\s+(\d{5}(?:-\d{4})?)$/);
    const zipOnly = last.match(/^(\d{5}(?:-\d{4})?)$/);
    if (stateZip) {
      state = stateZip[1].toUpperCase();
      zip = stateZip[2];
      parts.pop();
    } else if (zipOnly) {
      zip = zipOnly[1];
      parts.pop();
    }
  }

  let city = "";
  let street = "";
  if (parts.length >= 2) {
    city = parts.pop() as string;
    street = parts.join(", ");
  } else if (parts.length === 1) {
    // A single chunk left — keep it all in street rather than guessing.
    street = parts[0];
  }

  return { street, city, state, zip };
}

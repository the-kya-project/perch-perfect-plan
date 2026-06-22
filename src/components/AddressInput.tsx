import { useEffect, useState } from "react";
import { parseAddress, composeAddress, type AddressParts } from "@/lib/address";

// Structured street / city / state / ZIP input that reads and writes a single
// composed address string (the column shape the rest of the app expects). It
// holds the parts in local state while editing — re-parsing only when the
// external value changes to something we didn't just produce — so typing never
// glitches on the compose→parse round-trip.
export function AddressInput({ value, onChange }: { value: string; onChange: (composed: string) => void }) {
  const [parts, setParts] = useState<AddressParts>(() => parseAddress(value));

  useEffect(() => {
    // Re-sync only on an external change (e.g. switching which section is edited);
    // our own edits already match `value`, so this won't clobber in-progress typing.
    if (composeAddress(parts) !== (value ?? "").trim()) setParts(parseAddress(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const update = (patch: Partial<AddressParts>) => {
    const next = { ...parts, ...patch };
    setParts(next);
    onChange(composeAddress(next));
  };

  return (
    <div className="space-y-2">
      <input
        className="input"
        placeholder="Street address"
        autoComplete="address-line1"
        value={parts.street}
        onChange={(e) => update({ street: e.target.value })}
      />
      <input
        className="input"
        placeholder="City"
        autoComplete="address-level2"
        value={parts.city}
        onChange={(e) => update({ city: e.target.value })}
      />
      <div className="grid grid-cols-2 gap-2">
        <input
          className="input"
          placeholder="State"
          autoComplete="address-level1"
          autoCapitalize="characters"
          value={parts.state}
          onChange={(e) => update({ state: e.target.value })}
        />
        <input
          className="input"
          placeholder="ZIP"
          inputMode="numeric"
          autoComplete="postal-code"
          value={parts.zip}
          onChange={(e) => update({ zip: e.target.value })}
        />
      </div>
    </div>
  );
}

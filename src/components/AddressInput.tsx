import { useEffect, useId, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { parseAddress, composeAddress, type AddressParts } from "@/lib/address";
import { K } from "@/components/kya";

// The same 48px white pill as KyaField.
const PILL = "min-h-[48px] w-full rounded-full border-[1.5px] bg-white px-4 text-[16px] outline-none focus:border-[#2d6a4f]";
const PILL_STYLE: React.CSSProperties = { borderColor: "#d5dfd5", color: K.forest };

// Structured street / city / state / ZIP input that reads and writes a single
// composed address string (the column shape the rest of the app expects). It
// holds the parts in local state while editing — re-parsing only when the
// external value changes to something we didn't just produce — so typing never
// glitches on the compose→parse round-trip. Each field has its label above it.
export function AddressInput({ value, onChange, inputClassName = PILL, inputStyle = PILL_STYLE, label }: {
  value: string;
  onChange: (composed: string) => void;
  inputClassName?: string;
  inputStyle?: React.CSSProperties;
  /** Names the group for screen readers (e.g. "Address"). */
  label?: string;
}) {
  const { t } = useTranslation();
  const id = useId();
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

  const field = (key: keyof AddressParts, text: string, input: ReactNode) => (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={`${id}-${key}`} className="text-[13.5px] font-[700]" style={{ color: K.forest }}>{text}</label>
      {input}
    </div>
  );

  return (
    <div role="group" aria-label={label} className="flex flex-col gap-3">
      {field("street", t("addressInput.streetLabel", "Street"), (
        <input
          id={`${id}-street`}
          className={inputClassName}
          style={inputStyle}
          autoComplete="address-line1"
          value={parts.street}
          onChange={(e) => update({ street: e.target.value })}
        />
      ))}
      {field("city", t("addressInput.city", "City"), (
        <input
          id={`${id}-city`}
          className={inputClassName}
          style={inputStyle}
          autoComplete="address-level2"
          value={parts.city}
          onChange={(e) => update({ city: e.target.value })}
        />
      ))}
      <div className="grid grid-cols-2 gap-3">
        {field("state", t("addressInput.state", "State"), (
          <input
            id={`${id}-state`}
            className={inputClassName}
            style={inputStyle}
            autoComplete="address-level1"
            autoCapitalize="characters"
            value={parts.state}
            onChange={(e) => update({ state: e.target.value })}
          />
        ))}
        {field("zip", t("addressInput.zip", "ZIP"), (
          <input
            id={`${id}-zip`}
            className={inputClassName}
            style={inputStyle}
            inputMode="numeric"
            autoComplete="postal-code"
            value={parts.zip}
            onChange={(e) => update({ zip: e.target.value })}
          />
        ))}
      </div>
    </div>
  );
}

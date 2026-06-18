import { r as reactExports, j as jsxRuntimeExports } from "../_libs/react.mjs";
function parsePos(p) {
  if (!p) return { x: 50, y: 50 };
  const m = p.match(/(-?\d+(?:\.\d+)?)\s*%\s+(-?\d+(?:\.\d+)?)\s*%/);
  if (!m) return { x: 50, y: 50 };
  return { x: clamp(Number(m[1])), y: clamp(Number(m[2])) };
}
function clamp(n, min = 0, max = 100) {
  return Math.max(min, Math.min(max, n));
}
function PhotoCropper({ src, position, onChange, size = 160 }) {
  const ref = reactExports.useRef(null);
  const [pos, setPos] = reactExports.useState(() => parsePos(position));
  const [dragging, setDragging] = reactExports.useState(false);
  reactExports.useEffect(() => {
    setPos(parsePos(position));
  }, [position]);
  function commit(next) {
    setPos(next);
    onChange(`${next.x.toFixed(0)}% ${next.y.toFixed(0)}%`);
  }
  function onPointerDown(e) {
    e.target.setPointerCapture(e.pointerId);
    setDragging(true);
  }
  function onPointerMove(e) {
    if (!dragging || !ref.current) return;
    const dx = e.movementX / ref.current.clientWidth * 100;
    const dy = e.movementY / ref.current.clientHeight * 100;
    commit({ x: clamp(pos.x - dx), y: clamp(pos.y - dy) });
  }
  function onPointerUp(e) {
    e.target.releasePointerCapture(e.pointerId);
    setDragging(false);
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      "div",
      {
        ref,
        onPointerDown,
        onPointerMove,
        onPointerUp,
        onPointerCancel: onPointerUp,
        className: "touch-none select-none overflow-hidden rounded-xl ring-1 ring-sage-200",
        style: {
          width: size,
          height: size,
          backgroundImage: `url(${src})`,
          backgroundSize: "cover",
          backgroundRepeat: "no-repeat",
          backgroundPosition: `${pos.x}% ${pos.y}%`,
          cursor: dragging ? "grabbing" : "grab"
        },
        role: "img",
        "aria-label": "Drag to reposition photo"
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[10px] text-sage-600", children: "Drag inside the frame to adjust what shows." })
  ] });
}
const PARROT_SPECIES_GROUPS = [
  {
    label: "Amazon",
    options: [
      "Blue-fronted Amazon",
      "Double Yellow-headed Amazon",
      "Lilac-crowned Amazon",
      "Orange-winged Amazon",
      "Yellow-crowned Amazon",
      "Yellow-naped Amazon"
    ]
  },
  {
    label: "Caique",
    options: ["Black-headed Caique", "White-bellied Caique"]
  },
  {
    label: "Cockatoo",
    options: [
      "Bare-eyed Cockatoo",
      "Citron-crested Cockatoo",
      "Galah (Rose-breasted Cockatoo)",
      "Goffin's Cockatoo",
      "Major Mitchell's Cockatoo",
      "Moluccan Cockatoo",
      "Sulphur-crested Cockatoo",
      "Umbrella Cockatoo"
    ]
  },
  {
    label: "Conure",
    options: [
      "Blue-crowned Conure",
      "Cherry-headed Conure",
      "Green-cheeked Conure",
      "Half-moon Conure",
      "Jenday Conure",
      "Nanday Conure",
      "Pineapple Green-cheeked Conure",
      "Sun Conure"
    ]
  },
  {
    label: "Lovebird",
    options: ["Fischer's Lovebird", "Peach-faced Lovebird"]
  },
  {
    label: "Macaw",
    options: [
      "Blue and Gold Macaw",
      "Blue-throated Macaw",
      "Catalina Macaw",
      "Green-winged Macaw",
      "Hahn's Macaw",
      "Harlequin Macaw",
      "Hyacinth Macaw",
      "Military Macaw",
      "Scarlet Macaw"
    ]
  },
  {
    label: "Parakeet",
    options: [
      "Alexandrine Parakeet",
      "Indian Ringneck Parakeet",
      "Monk Parakeet (Quaker)",
      "Plum-headed Parakeet"
    ]
  },
  {
    label: "Pionus",
    options: ["Blue-headed Pionus", "Bronze-winged Pionus", "White-capped Pionus"]
  },
  {
    label: "Poicephalus",
    options: ["Meyer's Parrot", "Red-bellied Parrot", "Senegal Parrot"]
  },
  {
    label: "Other species",
    options: [
      "African Grey (Congo)",
      "African Grey (Timneh)",
      "Budgerigar (Budgie)",
      "Cockatiel",
      "Eclectus",
      "Pacific Parrotlet",
      "Rainbow Lorikeet"
    ]
  }
];
const PARROT_SPECIES = PARROT_SPECIES_GROUPS.flatMap((g) => g.options);
const AGE_OPTIONS = [
  "<1 year",
  ...Array.from({ length: 75 }, (_, i) => `${i + 1} year${i === 0 ? "" : "s"}`)
];
function ageFromBirthDate(birthDate) {
  if (!birthDate) return null;
  const b = new Date(birthDate);
  if (isNaN(b.getTime())) return null;
  const now = /* @__PURE__ */ new Date();
  let years = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || m === 0 && now.getDate() < b.getDate()) years--;
  if (years < 1) return "<1 year";
  return `${years} year${years === 1 ? "" : "s"}`;
}
function BirdField({ label, hint, children }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "block", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "mb-1 block text-xs font-semibold uppercase tracking-wider text-sage-600", children: label }),
    hint && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "mb-1 block text-[11px] text-sage-600", children: hint }),
    children
  ] });
}
function SpeciesPicker({ value, onChange }) {
  const known = PARROT_SPECIES.includes(value);
  const isOther = value !== "" && !known;
  const [mode, setMode] = reactExports.useState(isOther ? "other" : "known");
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(BirdField, { label: "Species", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "select",
      {
        className: "input",
        value: mode === "other" ? "__other__" : value,
        onChange: (e) => {
          if (e.target.value === "__other__") {
            setMode("other");
            onChange("");
          } else {
            setMode("known");
            onChange(e.target.value);
          }
        },
        children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "", children: "Select species…" }),
          PARROT_SPECIES_GROUPS.map((g) => /* @__PURE__ */ jsxRuntimeExports.jsx("optgroup", { label: g.label, children: g.options.map((s) => /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: s, children: s }, s)) }, g.label)),
          /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "__other__", children: "Other…" })
        ]
      }
    ),
    mode === "other" && /* @__PURE__ */ jsxRuntimeExports.jsx(
      "input",
      {
        className: "input mt-2",
        placeholder: "Enter species",
        value,
        onChange: (e) => onChange(e.target.value)
      }
    )
  ] });
}
function AgePicker({ age, birthDate, onChange }) {
  const computed = ageFromBirthDate(birthDate);
  const hasBirth = !!birthDate;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-2 gap-3", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(BirdField, { label: "Age", hint: hasBirth ? "From birthdate" : void 0, children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "select",
      {
        className: "input disabled:opacity-60",
        disabled: hasBirth,
        value: hasBirth ? computed ?? "" : age,
        onChange: (e) => onChange({ age: e.target.value, birthDate: null }),
        children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "", children: "Unknown" }),
          AGE_OPTIONS.map((a) => /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: a, children: a }, a))
        ]
      }
    ) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(BirdField, { label: "Birth date", hint: "Optional — sets age automatically", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
      "input",
      {
        className: "input",
        type: "date",
        max: (/* @__PURE__ */ new Date()).toISOString().slice(0, 10),
        value: birthDate ?? "",
        onChange: (e) => {
          const bd = e.target.value || null;
          onChange({ age: ageFromBirthDate(bd) ?? age, birthDate: bd });
        }
      }
    ) })
  ] });
}
export {
  AgePicker as A,
  BirdField as B,
  PhotoCropper as P,
  SpeciesPicker as S
};

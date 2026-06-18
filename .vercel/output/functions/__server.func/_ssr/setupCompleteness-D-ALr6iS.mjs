import { j as jsxRuntimeExports, r as reactExports } from "../_libs/react.mjs";
import { supabase } from "./client-HgPYj8QJ.mjs";
import { t as toast } from "../_libs/sonner.mjs";
import { a as useQueryClient, b as useQuery } from "../_libs/tanstack__react-query.mjs";
import { L as Link } from "../_libs/tanstack__react-router.mjs";
import { g as Calendar, h as Link2, i as Copy, a as ChevronDown, j as ChevronRight, k as CircleCheck, E as ExternalLink, l as Sparkles, P as Plus, C as Check, m as Trash2 } from "../_libs/lucide-react.mjs";
const CHECKLIST_ITEMS = [
  { key: "first_aid", label: "First-aid kit stocked, and its location noted", tag: "recommended" },
  { key: "carrier", label: "Carrier clean and accessible", tag: "recommended" },
  { key: "food_portioned", label: "Enough food portioned for the full sit, plus extra", tag: "recommended" },
  { key: "enrichment", label: "Foraging toys and enrichment set up", tag: "optional" },
  { key: "cage_clean", label: "Cage cleaned with fresh substrate", tag: "optional" },
  { key: "sitter_access", label: "Sitter has access (key, code, or entry plan)", tag: "recommended" },
  { key: "temperature", label: "Temperature and heating plan set", tag: "optional" },
  { key: "hazards", label: "Hazards handled (rooms closed, pets secured, windows checked)", tag: "recommended" },
  { key: "emergency_contacts", label: "Emergency contacts confirmed current", tag: "recommended" },
  { key: "invite_tested", label: "Sitter invite link tested", tag: "recommended" }
];
function daysBetween(start, end) {
  const s = /* @__PURE__ */ new Date(start + "T00:00:00");
  const e = /* @__PURE__ */ new Date(end + "T00:00:00");
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return 1;
  return Math.max(1, Math.round((e.getTime() - s.getTime()) / 864e5) + 1);
}
function computeAutoItems(args) {
  const out = [];
  for (const b of args.birds) {
    const data = args.bundles.get(b.id);
    if (!data) continue;
    const meds = (data.medications ?? "").trim();
    if (meds) {
      out.push({
        key: `auto:meds:${b.id}`,
        birdId: b.id,
        birdName: b.name,
        label: `Measure out ${args.days} day${args.days === 1 ? "" : "s"} of ${meds}.`,
        tag: "recommended"
      });
    }
    const hasFresh = (data.diet_types ?? []).includes("chop") || (data.fresh_foods ?? []).length > 0;
    if (hasFresh) {
      out.push({
        key: `auto:fresh:${b.id}`,
        birdId: b.id,
        birdName: b.name,
        label: "Portion fresh food for the week.",
        tag: "recommended"
      });
    }
    if ((data.flight_status ?? "") === "fully_flighted") {
      out.push({
        key: `auto:flight:${b.id}`,
        birdId: b.id,
        birdName: b.name,
        label: "Confirm the windows-and-doors plan with your sitter.",
        tag: "recommended"
      });
    }
  }
  return out;
}
function SitChecklist({
  sit,
  birds,
  onSitChanged
}) {
  const qc = useQueryClient();
  const [open, setOpen] = reactExports.useState(false);
  const [adding, setAdding] = reactExports.useState(false);
  const [newLabel, setNewLabel] = reactExports.useState("");
  const [newTag, setNewTag] = reactExports.useState("recommended");
  const [confirmReady, setConfirmReady] = reactExports.useState(null);
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["sit-checklist", sit.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("sit_checklist_items").select("id, item_key, checked, is_custom, custom_label, tag").eq("sit_id", sit.id);
      if (error) throw error;
      return data ?? [];
    }
  });
  const birdIds = birds.map((b) => b.id);
  const { data: autoBundles } = useQuery({
    queryKey: ["sit-checklist-auto", sit.id, birdIds],
    enabled: birdIds.length > 0,
    queryFn: async () => {
      const [birdsRes, plansRes] = await Promise.all([
        supabase.from("birds").select("id, medications, flight_status").in("id", birdIds),
        supabase.from("care_plans").select("bird_id, diet_types, fresh_foods").in("bird_id", birdIds)
      ]);
      const byBird = /* @__PURE__ */ new Map();
      for (const b of birdsRes.data ?? []) byBird.set(b.id, { ...b });
      for (const p of plansRes.data ?? []) {
        const existing = byBird.get(p.bird_id) ?? {};
        byBird.set(p.bird_id, { ...existing, diet_types: p.diet_types, fresh_foods: p.fresh_foods });
      }
      return byBird;
    }
  });
  const days = daysBetween(sit.start_date, sit.end_date);
  const autoItems = autoBundles ? computeAutoItems({ birds, bundles: autoBundles, days }) : [];
  const checkedSet = new Set(rows.filter((r) => r.checked).map((r) => r.item_key));
  const customRows = rows.filter((r) => r.is_custom);
  const allEntries = [
    ...CHECKLIST_ITEMS.map((i) => ({ key: i.key, label: i.label, tag: i.tag })),
    ...autoItems.map((i) => ({ key: i.key, label: i.label, tag: i.tag })),
    ...customRows.map((r) => ({
      key: r.item_key,
      label: r.custom_label ?? "Custom item",
      tag: r.tag ?? "recommended"
    }))
  ];
  const totalCount = allEntries.length;
  const doneCount = allEntries.filter((e) => checkedSet.has(e.key)).length;
  const pct = totalCount === 0 ? 0 : Math.round(doneCount / totalCount * 100);
  const itemsLeft = totalCount - doneCount;
  const today = /* @__PURE__ */ new Date();
  today.setHours(0, 0, 0, 0);
  const start = /* @__PURE__ */ new Date(sit.start_date + "T00:00:00");
  const msPerDay = 864e5;
  const daysToStart = Math.round((start.getTime() - today.getTime()) / msPerDay);
  const showReminder = daysToStart >= 0 && daysToStart <= 3 && itemsLeft > 0;
  async function toggle(itemKey, nextChecked) {
    qc.setQueryData(["sit-checklist", sit.id], (prev = []) => {
      const others = prev.filter((r) => r.item_key !== itemKey);
      const existing = prev.find((r) => r.item_key === itemKey);
      return [
        ...others,
        { ...existing ?? { item_key: itemKey }, checked: nextChecked }
      ];
    });
    const { error } = await supabase.from("sit_checklist_items").upsert(
      { sit_id: sit.id, item_key: itemKey, checked: nextChecked, checked_at: (/* @__PURE__ */ new Date()).toISOString() },
      { onConflict: "sit_id,item_key" }
    );
    if (error) {
      toast.error(error.message);
      qc.invalidateQueries({ queryKey: ["sit-checklist", sit.id] });
    }
  }
  async function addCustom() {
    const label = newLabel.trim();
    if (!label) return;
    const key = `custom:${crypto.randomUUID()}`;
    const { error } = await supabase.from("sit_checklist_items").insert({
      sit_id: sit.id,
      item_key: key,
      checked: false,
      is_custom: true,
      custom_label: label,
      tag: newTag
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    setNewLabel("");
    setNewTag("recommended");
    setAdding(false);
    qc.invalidateQueries({ queryKey: ["sit-checklist", sit.id] });
  }
  async function removeCustom(rowId) {
    const { error } = await supabase.from("sit_checklist_items").delete().eq("id", rowId);
    if (error) {
      toast.error(error.message);
      return;
    }
    qc.invalidateQueries({ queryKey: ["sit-checklist", sit.id] });
  }
  async function markReady(force = false) {
    const missing = allEntries.filter((e) => e.tag === "recommended" && !checkedSet.has(e.key)).map((e) => ({ key: e.key, label: e.label }));
    if (!force && missing.length > 0) {
      setConfirmReady({ missing });
      return;
    }
    setConfirmReady(null);
    const { error } = await supabase.from("sits").update({ marked_ready_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", sit.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Marked ready. Just for your view — the sitter isn't notified yet.");
    onSitChanged?.();
  }
  async function unmarkReady() {
    const { error } = await supabase.from("sits").update({ marked_ready_at: null }).eq("id", sit.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    onSitChanged?.();
  }
  const autoByBird = /* @__PURE__ */ new Map();
  for (const item of autoItems) {
    const arr = autoByBird.get(item.birdId) ?? [];
    arr.push(item);
    autoByBird.set(item.birdId, arr);
  }
  const isMultiBird = birds.length > 1;
  function tagBadge(tag) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx(
      "span",
      {
        className: `shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${tag === "recommended" ? "bg-sage-100 text-sage-700" : "bg-sage-50 text-sage-500"}`,
        children: tag
      }
    );
  }
  function renderItem(itemKey, label, tag, extra, onRemove) {
    const isChecked = checkedSet.has(itemKey);
    return /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "div",
      {
        className: `flex items-start gap-2 rounded-lg px-2 py-2 ring-1 ring-sage-100 ${isChecked ? "bg-warn-green/5" : "bg-white"}`,
        children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              type: "button",
              onClick: () => toggle(itemKey, !isChecked),
              "aria-pressed": isChecked,
              "aria-label": isChecked ? `Uncheck: ${label}` : `Check off: ${label}`,
              className: `mt-0.5 grid size-5 shrink-0 place-items-center rounded-md ring-1 transition-colors ${isChecked ? "bg-sage-600 ring-sage-600 text-white" : "bg-white ring-sage-300 text-transparent"}`,
              children: /* @__PURE__ */ jsxRuntimeExports.jsx(Check, { className: "size-3.5", strokeWidth: 3 })
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "min-w-0 flex-1", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-start gap-1.5", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "p",
                {
                  className: `flex-1 text-xs leading-snug ${isChecked ? "text-sage-600 line-through" : "text-sage-800"}`,
                  children: label
                }
              ),
              tagBadge(tag),
              onRemove && /* @__PURE__ */ jsxRuntimeExports.jsx(
                "button",
                {
                  type: "button",
                  onClick: onRemove,
                  className: "shrink-0 rounded p-0.5 text-sage-400 hover:text-warn-red",
                  "aria-label": `Remove: ${label}`,
                  children: /* @__PURE__ */ jsxRuntimeExports.jsx(Trash2, { className: "size-3" })
                }
              )
            ] }),
            extra
          ] })
        ]
      }
    );
  }
  const sitterLabel = sit.sitter_name && sit.sitter_name !== "__preview__" ? sit.sitter_name : "Your sitter";
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-3 rounded-xl border border-sage-100 bg-sage-50/60", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "button",
      {
        type: "button",
        onClick: () => setOpen((v) => !v),
        className: "flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left",
        "aria-expanded": open,
        children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
            open ? /* @__PURE__ */ jsxRuntimeExports.jsx(ChevronDown, { className: "size-4 text-sage-600" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(ChevronRight, { className: "size-4 text-sage-600" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs font-bold uppercase tracking-wider text-sage-700", children: "Pre-leaving checklist" }),
            sit.marked_ready_at && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "inline-flex items-center gap-0.5 rounded-full bg-warn-green/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-warn-green", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(CircleCheck, { className: "size-2.5" }),
              " Ready"
            ] })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-[11px] font-semibold text-sage-600", children: [
            doneCount,
            "/",
            totalCount
          ] })
        ]
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mx-3 mb-1 h-1 overflow-hidden rounded-full bg-sage-100", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
      "div",
      {
        className: "h-full rounded-full bg-sage-600 transition-all",
        style: { width: `${Math.max(2, pct)}%` }
      }
    ) }),
    showReminder && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mx-3 mb-2 rounded-lg bg-warn-amber/10 px-3 py-2 ring-1 ring-warn-amber/30", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-[11px] font-semibold text-warn-amber", children: [
      sitterLabel,
      " arrives in ",
      daysToStart === 0 ? "today" : `${daysToStart} day${daysToStart === 1 ? "" : "s"}`,
      " — ",
      itemsLeft,
      " prep item",
      itemsLeft === 1 ? "" : "s",
      " left"
    ] }) }),
    open && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2 px-2 pb-3", children: [
      isLoading && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "px-2 py-1 text-xs text-sage-600", children: "Loading…" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("ul", { className: "space-y-1", children: CHECKLIST_ITEMS.map((item) => /* @__PURE__ */ jsxRuntimeExports.jsx("li", { children: renderItem(
        item.key,
        item.label,
        item.tag,
        item.key === "emergency_contacts" && birds.length > 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-1 flex flex-wrap gap-1.5", children: birds.map((b) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
          Link,
          {
            to: "/birds/$birdId",
            params: { birdId: b.id },
            search: { tab: "emergency" },
            className: "inline-flex items-center gap-1 rounded-md bg-sage-100 px-1.5 py-0.5 text-[10px] font-semibold text-sage-700 hover:bg-sage-200",
            children: [
              b.name,
              /* @__PURE__ */ jsxRuntimeExports.jsx(ExternalLink, { className: "size-2.5" })
            ]
          },
          b.id
        )) }) : null
      ) }, item.key)) }),
      autoItems.length > 0 && !isMultiBird && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1 px-1 pt-1 text-[10px] font-bold uppercase tracking-wider text-sage-600", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Sparkles, { className: "size-3" }),
          " From the care plan"
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("ul", { className: "space-y-1", children: autoItems.map((item) => /* @__PURE__ */ jsxRuntimeExports.jsx("li", { children: renderItem(item.key, item.label, item.tag) }, item.key)) })
      ] }),
      autoItems.length > 0 && isMultiBird && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1 px-1 pt-1 text-[10px] font-bold uppercase tracking-wider text-sage-600", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Sparkles, { className: "size-3" }),
          " From the care plan"
        ] }),
        birds.map((b) => {
          const items = autoByBird.get(b.id) ?? [];
          if (items.length === 0) return null;
          return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-lg bg-white/70 p-2 ring-1 ring-sage-100", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "px-1 pb-1 text-[11px] font-bold text-sage-700", children: b.name }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("ul", { className: "space-y-1", children: items.map((item) => /* @__PURE__ */ jsxRuntimeExports.jsx("li", { children: renderItem(item.key, item.label, item.tag) }, item.key)) })
          ] }, b.id);
        })
      ] }),
      customRows.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "px-1 pt-1 text-[10px] font-bold uppercase tracking-wider text-sage-600", children: "Your additions" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("ul", { className: "space-y-1", children: customRows.map((r) => /* @__PURE__ */ jsxRuntimeExports.jsx("li", { children: renderItem(
          r.item_key,
          r.custom_label ?? "Custom item",
          r.tag ?? "recommended",
          null,
          r.id ? () => removeCustom(r.id) : void 0
        ) }, r.item_key)) })
      ] }),
      adding ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2 rounded-lg bg-white p-2 ring-1 ring-sage-200", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "input",
          {
            autoFocus: true,
            value: newLabel,
            onChange: (e) => setNewLabel(e.target.value),
            placeholder: "e.g. Top up humidifier",
            className: "w-full rounded-md border border-sage-200 px-2 py-1.5 text-xs focus:border-sage-600 focus:outline-none",
            onKeyDown: (e) => {
              if (e.key === "Enter") addCustom();
            }
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "select",
            {
              value: newTag,
              onChange: (e) => setNewTag(e.target.value),
              className: "rounded-md border border-sage-200 px-2 py-1 text-[11px]",
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "recommended", children: "Recommended" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "optional", children: "Optional" })
              ]
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              type: "button",
              onClick: addCustom,
              disabled: !newLabel.trim(),
              className: "ml-auto rounded-md bg-sage-600 px-3 py-1 text-[11px] font-semibold text-white disabled:opacity-40",
              children: "Add"
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              type: "button",
              onClick: () => {
                setAdding(false);
                setNewLabel("");
              },
              className: "rounded-md px-2 py-1 text-[11px] font-semibold text-sage-600",
              children: "Cancel"
            }
          )
        ] })
      ] }) : /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "button",
        {
          type: "button",
          onClick: () => setAdding(true),
          className: "flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-sage-300 bg-white px-3 py-2 text-[11px] font-semibold text-sage-700 hover:bg-sage-50",
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Plus, { className: "size-3" }),
            " Add a custom item"
          ]
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "pt-1", children: sit.marked_ready_at ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between gap-2 rounded-lg bg-warn-green/10 px-3 py-2 ring-1 ring-warn-green/30", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1.5 text-[11px] font-semibold text-warn-green", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(CircleCheck, { className: "size-3.5" }),
          "Marked ready · only visible to you for now"
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            type: "button",
            onClick: unmarkReady,
            className: "text-[10px] font-semibold text-sage-600 underline",
            children: "Undo"
          }
        )
      ] }) : /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          type: "button",
          onClick: () => markReady(false),
          className: "w-full rounded-lg bg-sage-900 px-3 py-2 text-xs font-semibold text-white",
          children: "Mark ready"
        }
      ) })
    ] }),
    confirmReady && /* @__PURE__ */ jsxRuntimeExports.jsx(
      "div",
      {
        className: "fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center",
        role: "dialog",
        "aria-modal": "true",
        onClick: () => setConfirmReady(null),
        children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "div",
          {
            className: "w-full max-w-md rounded-2xl bg-white p-4 shadow-lg",
            onClick: (e) => e.stopPropagation(),
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-sm font-bold", children: "Mark ready anyway?" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 text-xs text-sage-600", children: "A few recommended items aren't checked off yet. Nothing is blocked — this is just for you." }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("ul", { className: "mt-3 max-h-48 space-y-1 overflow-y-auto rounded-lg bg-sage-50 p-2", children: confirmReady.missing.map((m) => /* @__PURE__ */ jsxRuntimeExports.jsxs("li", { className: "text-[11px] text-sage-800", children: [
                "• ",
                m.label
              ] }, m.key)) }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-3 flex gap-2", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "button",
                  {
                    type: "button",
                    onClick: () => setConfirmReady(null),
                    className: "flex-1 rounded-lg border border-sage-200 bg-white py-2 text-xs font-semibold text-sage-700",
                    children: "Keep editing"
                  }
                ),
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "button",
                  {
                    type: "button",
                    onClick: () => markReady(true),
                    className: "flex-1 rounded-lg bg-sage-900 py-2 text-xs font-semibold text-white",
                    children: "Mark ready anyway"
                  }
                )
              ] })
            ]
          }
        )
      }
    )
  ] });
}
function SitCard({ sit, birds = [], onChange }) {
  const expired = new Date(sit.token_expires_at) < /* @__PURE__ */ new Date();
  const upcoming = new Date(sit.start_date) > new Date((/* @__PURE__ */ new Date()).toDateString());
  const status = sit.revoked ? "Revoked" : expired ? "Expired" : upcoming ? "Upcoming" : "Active";
  const tone = sit.revoked || expired ? "bg-[#e8e1d0] text-[#5f5e5a]" : upcoming ? "bg-[#f4e4c4] text-[#84600f]" : "bg-[#d6e8dc] text-[#1a5e3f]";
  const url = typeof window !== "undefined" ? `${window.location.origin}/sitter/${sit.invite_token}` : "";
  async function revoke() {
    if (!confirm("Revoke this invite link? The sitter will lose access.")) return;
    await supabase.from("sits").update({ revoked: true }).eq("id", sit.id);
    toast.success("Link revoked.");
    onChange();
  }
  async function remove() {
    if (!confirm("Delete this sit? This removes all sitter logs for it.")) return;
    await supabase.from("sits").delete().eq("id", sit.id);
    toast.success("Sit deleted.");
    onChange();
  }
  async function copy() {
    const birdIds = birds.map((b) => b.id);
    if (birdIds.length) {
      const [{ data: contacts }, { data: u }] = await Promise.all([
        supabase.from("emergency_contacts").select("bird_id, owner_phone, avian_vet_phone").in("bird_id", birdIds),
        supabase.auth.getUser()
      ]);
      const { data: defaults } = u.user ? await supabase.from("owner_emergency_defaults").select("owner_phone, avian_vet_phone").eq("owner_id", u.user.id).maybeSingle() : { data: null };
      const byBird = new Map((contacts ?? []).map((c) => [c.bird_id, c]));
      const eff = (c, k) => c?.[k]?.trim?.() || defaults?.[k]?.trim?.() || "";
      const missing = birds.map((b) => {
        const c = byBird.get(b.id);
        const needs = [];
        if (!eff(c, "owner_phone")) needs.push("your phone");
        if (!eff(c, "avian_vet_phone")) needs.push("avian vet phone");
        return needs.length ? `${b.name}: ${needs.join(" & ")}` : null;
      }).filter(Boolean);
      if (missing.length) {
        toast.error(
          `Add the required emergency contacts before sharing — ${missing.join("; ")}. Set account defaults on the dashboard or fill the bird's Emergency tab.`,
          { duration: 8e3 }
        );
        return;
      }
    }
    await navigator.clipboard.writeText(url);
    toast.success("Link copied.");
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-[20px] bg-[#efe9da] p-4 shadow-sm", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 text-sm font-medium", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Calendar, { className: "size-4 text-[#5f5e5a]" }),
        sit.start_date,
        " → ",
        sit.end_date
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `rounded-full px-2 py-0.5 text-[11px] font-medium ${tone}`, children: status })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "mt-1 text-xs text-[#5f5e5a]", children: [
      "Sitter: ",
      sit.sitter_name ?? "—",
      " ",
      sit.sitter_email && `(${sit.sitter_email})`
    ] }),
    birds.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "mt-1 text-xs text-sage-700", children: [
      "Birds: ",
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-medium", children: birds.map((b) => b.name).join(", ") })
    ] }),
    !sit.revoked && !expired && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-3 flex items-center gap-2 rounded-[12px] bg-[#e8e1d0] p-2", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Link2, { className: "size-3.5 text-[#5f5e5a]" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "flex-1 truncate text-[11px] text-sage-700", children: url }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: copy, className: "rounded p-1 text-[#5f5e5a]", "aria-label": "Copy link", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Copy, { className: "size-3.5" }) })
    ] }),
    !sit.revoked && /* @__PURE__ */ jsxRuntimeExports.jsx(SitChecklist, { sit, birds, onSitChanged: onChange }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-3 flex gap-3 text-xs font-medium", children: [
      !sit.revoked && !expired && /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: revoke, className: "text-[#5f5e5a] underline", children: "Revoke link" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: remove, className: "ml-auto text-[#5f5e5a] underline", children: "Delete" })
    ] })
  ] });
}
function nonEmpty(v) {
  if (v == null) return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "string") return v.trim().length > 0;
  if (typeof v === "number") return !Number.isNaN(v);
  return true;
}
function computeSetupCompleteness(args) {
  const { bird, plan, tasksCount = 0, contacts, defaults } = args;
  const eff = (k) => (contacts?.[k] ?? "").toString().trim() || (defaults?.[k] ?? "").toString().trim();
  const checks = [
    {
      step: 1,
      label: "The basics",
      // Bird record exists by definition once we're past /birds/new.
      // Species is the only optional basics field, but a bird row always means basics submitted.
      done: !!bird
    },
    {
      step: 2,
      label: "A day in the life",
      done: (tasksCount ?? 0) > 0
    },
    {
      step: 3,
      label: "Food & water",
      done: nonEmpty(plan?.diet_types) || nonEmpty(plan?.food_instructions)
    },
    {
      step: 4,
      label: "Personality & handling",
      done: nonEmpty(plan?.handlers) || nonEmpty(plan?.likes) || nonEmpty(plan?.fears_triggers)
    },
    {
      step: 5,
      label: "Environment & safety",
      done: nonEmpty(plan?.cage_location) || nonEmpty(plan?.out_of_cage_mode) || nonEmpty(plan?.hazards)
    },
    {
      step: 6,
      label: "Health baseline",
      done: nonEmpty(bird?.normal_weight) || nonEmpty(plan?.baseline_droppings_path) || nonEmpty(plan?.baseline_clip_path) || nonEmpty(plan?.whats_normal)
    },
    {
      step: 7,
      label: "Watch-first clips",
      done: nonEmpty(plan?.clip_step_up_path) || nonEmpty(plan?.clip_food_water_path) || nonEmpty(plan?.clip_locations_path) || nonEmpty(plan?.clip_bedtime_path)
    },
    {
      step: 8,
      label: "Emergency info",
      done: !!eff("owner_phone") && !!eff("avian_vet_phone")
    }
  ];
  const total = checks.length;
  const doneCount = checks.filter((c) => c.done).length;
  const pct = Math.round(doneCount / total * 100);
  const firstIncomplete = checks.find((c) => !c.done);
  return {
    checks,
    doneCount,
    total,
    pct,
    firstIncompleteStep: firstIncomplete ? firstIncomplete.step : null
  };
}
export {
  SitCard as S,
  computeSetupCompleteness as c
};

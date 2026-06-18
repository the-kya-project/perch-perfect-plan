import { r as reactExports, j as jsxRuntimeExports } from "../_libs/react.mjs";
import { e as useNavigate, L as Link } from "../_libs/tanstack__react-router.mjs";
import { a as useQueryClient, b as useQuery } from "../_libs/tanstack__react-query.mjs";
import { supabase } from "./client-HgPYj8QJ.mjs";
import { D as Disclaimer } from "./Disclaimer-BfRf9x0C.mjs";
import { c as computeSetupCompleteness, S as SitCard } from "./setupCompleteness-D-ALr6iS.mjs";
import { t as toast } from "../_libs/sonner.mjs";
import { a as Route$c, t as track } from "./router-Cu2Tdjxf.mjs";
import "../_libs/seroval.mjs";
import { B as Bell, d as Settings, L as LogOut, e as Bird, P as Plus, F as Feather, f as Share, X } from "../_libs/lucide-react.mjs";
import "../_libs/tanstack__router-core.mjs";
import "../_libs/tanstack__history.mjs";
import "../_libs/cookie-es.mjs";
import "../_libs/seroval-plugins.mjs";
import "node:stream/web";
import "node:stream";
import "../_libs/react-dom.mjs";
import "util";
import "crypto";
import "async_hooks";
import "stream";
import "../_libs/isbot.mjs";
import "../_libs/tanstack__query-core.mjs";
import "../_libs/supabase__supabase-js.mjs";
import "../_libs/supabase__postgrest-js.mjs";
import "../_libs/supabase__realtime-js.mjs";
import "../_libs/supabase__phoenix.mjs";
import "../_libs/supabase__storage-js.mjs";
import "../_libs/iceberg-js.mjs";
import "../_libs/supabase__auth-js.mjs";
import "tslib";
import "../_libs/supabase__functions-js.mjs";
import "./triage-DfSRYuT8.mjs";
import "./server-9nIpN7MJ.mjs";
import "node:async_hooks";
import "../_libs/h3-v2.mjs";
import "../_libs/rou3.mjs";
import "../_libs/srvx.mjs";
import "../_libs/zod.mjs";
const DISMISS_KEY = "kya:a2hs-dismissed";
function isIOSSafari() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const iOS = /iPhone|iPad|iPod/.test(ua);
  const isSafari = /^((?!chrome|crios|fxios|edgios).)*safari/i.test(ua);
  return iOS && isSafari;
}
function isStandalone() {
  if (typeof navigator === "undefined") return false;
  if (typeof navigator.standalone === "boolean" && navigator.standalone) return true;
  return window.matchMedia?.("(display-mode: standalone)").matches ?? false;
}
function AddToHomeScreenPrompt() {
  const [show, setShow] = reactExports.useState(false);
  reactExports.useEffect(() => {
    if (!isIOSSafari() || isStandalone()) return;
    try {
      if (localStorage.getItem(DISMISS_KEY) === "1") return;
    } catch {
    }
    const t = setTimeout(() => setShow(true), 1200);
    return () => clearTimeout(t);
  }, []);
  if (!show) return null;
  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
    }
    setShow(false);
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "rounded-2xl bg-white p-4 ring-1 ring-sage-200 shadow-sm", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-start gap-3", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm font-semibold text-sage-900", children: "Add Parrot Care to your Home Screen" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "mt-1 text-xs text-sage-600", children: [
        "Tap ",
        /* @__PURE__ */ jsxRuntimeExports.jsx(Share, { className: "inline size-3.5 align-text-bottom" }),
        " in Safari, then choose ",
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-semibold", children: "Add to Home Screen" }),
        ". This is required on iPhone to receive push alerts from sitters."
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      "button",
      {
        onClick: dismiss,
        "aria-label": "Dismiss",
        className: "rounded-full p-1 text-sage-500 hover:bg-sage-100",
        children: /* @__PURE__ */ jsxRuntimeExports.jsx(X, { className: "size-4" })
      }
    )
  ] }) });
}
function Dashboard() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const {
    newSit,
    preselectBirdId
  } = Route$c.useSearch();
  const {
    data: profile
  } = useQuery({
    queryKey: ["owner-profile-name"],
    queryFn: async () => {
      const {
        data: u
      } = await supabase.auth.getUser();
      if (!u.user) return null;
      const {
        data
      } = await supabase.from("profiles").select("display_name").eq("id", u.user.id).maybeSingle();
      return data ?? null;
    }
  });
  const firstName = (profile?.display_name ?? "").trim().split(/\s+/)[0] || "";
  const greeting = firstName ? `Welcome, ${firstName}!` : "Welcome!";
  const {
    data: birds = []
  } = useQuery({
    queryKey: ["birds"],
    queryFn: async () => {
      const {
        data,
        error
      } = await supabase.from("birds").select("id, owner_id, name, species, photo_url, photo_position, setup_complete, setup_step, normal_weight").order("created_at", {
        ascending: false
      });
      if (error) throw error;
      return data ?? [];
    }
  });
  const birdIds = reactExports.useMemo(() => birds.map((b) => b.id), [birds]);
  const ownerId = birds[0]?.owner_id;
  const {
    data: completenessData
  } = useQuery({
    queryKey: ["birds-completeness", birdIds, ownerId],
    enabled: birdIds.length > 0,
    queryFn: async () => {
      const [plansRes, contactsRes, defaultsRes] = await Promise.all([supabase.from("care_plans").select("*").in("bird_id", birdIds), supabase.from("emergency_contacts").select("*").in("bird_id", birdIds), ownerId ? supabase.from("owner_emergency_defaults").select("*").eq("owner_id", ownerId).maybeSingle() : Promise.resolve({
        data: null,
        error: null
      })]);
      const plans = plansRes.data ?? [];
      const planIds = plans.map((p) => p.id);
      const tasksRes = planIds.length ? await supabase.from("routine_tasks").select("care_plan_id").in("care_plan_id", planIds) : {
        data: []
      };
      const tasksByPlan = /* @__PURE__ */ new Map();
      for (const row of tasksRes.data ?? []) {
        tasksByPlan.set(row.care_plan_id, (tasksByPlan.get(row.care_plan_id) ?? 0) + 1);
      }
      const planByBird = new Map(plans.map((p) => [p.bird_id, p]));
      const contactByBird = new Map((contactsRes.data ?? []).map((c) => [c.bird_id, c]));
      return {
        planByBird,
        tasksByPlan,
        contactByBird,
        defaults: defaultsRes?.data ?? null
      };
    }
  });
  const {
    data: sits = []
  } = useQuery({
    queryKey: ["all-sits"],
    queryFn: async () => {
      const {
        data,
        error
      } = await supabase.from("sits").select("*, sit_birds(bird_id)").neq("sitter_name", "__preview__").order("start_date", {
        ascending: false
      });
      if (error) throw error;
      return data ?? [];
    }
  });
  async function signOut() {
    await supabase.auth.signOut();
    toast.success("Signed out.");
    navigate({
      to: "/"
    });
  }
  const refreshSits = () => qc.invalidateQueries({
    queryKey: ["all-sits"]
  });
  const birdLookup = Object.fromEntries(birds.map((b) => [b.id, b]));
  const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  const activeSit = sits.find((s) => s.start_date <= today && s.end_date >= today) ?? null;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "min-h-screen bg-[#f4f1e8] pb-20", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("header", { className: "bg-[#1a3d2e] pt-[max(env(safe-area-inset-top),1rem)]", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mx-auto flex max-w-md items-center justify-between gap-3 px-5 pb-6 pt-3", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { className: "text-[27px] font-medium leading-tight text-white", children: greeting }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1 text-white", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Link, { to: "/notifications", className: "rounded-full p-2 hover:bg-white/10", "aria-label": "Notifications", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Bell, { className: "size-5" }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Link, { to: "/account", className: "rounded-full p-2 hover:bg-white/10", "aria-label": "Account settings", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Settings, { className: "size-5" }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: signOut, className: "rounded-full p-2 hover:bg-white/10", "aria-label": "Sign out", children: /* @__PURE__ */ jsxRuntimeExports.jsx(LogOut, { className: "size-5" }) })
      ] })
    ] }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("main", { className: "mx-auto max-w-md space-y-6 px-4 py-6", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Disclaimer, { compact: true }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "space-y-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-end justify-between", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-[21px] font-medium text-[#1a3d2e]", children: "Your birds" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(Link, { to: "/birds/new", className: "text-sm font-medium text-[#1a3d2e]", children: "+ Add bird" })
        ] }),
        birds.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-[20px] border border-dashed border-[#d8cfb8] bg-[#efe9da] p-8 text-center", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Bird, { className: "mx-auto size-8 text-[#2d6a4f]" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-3 font-medium text-[#1a3d2e]", children: "Add your first bird" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 text-sm text-[#5f5e5a]", children: "Build a care plan once. Reuse and enrich it across every sit." }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(Link, { to: "/birds/new", className: "mt-4 inline-flex items-center gap-2 rounded-xl bg-[#1a3d2e] px-4 py-2.5 text-sm font-medium text-white", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Plus, { className: "size-4" }),
            " Add bird"
          ] })
        ] }) : /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "space-y-4", children: birds.map((b) => {
          const plan = completenessData?.planByBird.get(b.id) ?? null;
          const tasksCount = plan ? completenessData?.tasksByPlan.get(plan.id) ?? 0 : 0;
          const contacts = completenessData?.contactByBird.get(b.id) ?? null;
          const defaults = completenessData?.defaults ?? null;
          const completeness = computeSetupCompleteness({
            bird: b,
            plan,
            tasksCount,
            contacts,
            defaults
          });
          const resumeStep = completeness.firstIncompleteStep ?? Math.max(2, Number(b.setup_step ?? 2));
          return /* @__PURE__ */ jsxRuntimeExports.jsx(BirdCard, { bird: b, completeness, resumeStep }, b.id);
        }) })
      ] }),
      birds.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx(SitForm, { birds, onCreated: refreshSits, initialOpen: !!newSit, preselectBirdId, activeSit }),
      birds.length > 0 && sits.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { id: "sits", className: "scroll-mt-4 space-y-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-[21px] font-medium text-[#1a3d2e]", children: "Sits" }),
        sits.map((s) => {
          const sitBirds = (s.sit_birds ?? []).map((sb) => birdLookup[sb.bird_id]).filter(Boolean);
          return /* @__PURE__ */ jsxRuntimeExports.jsx(SitCard, { sit: s, birds: sitBirds, onChange: refreshSits }, s.id);
        })
      ] }),
      birds.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx(DefaultsPanel, {}),
      /* @__PURE__ */ jsxRuntimeExports.jsx(AddToHomeScreenPrompt, {})
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("style", { children: `.input{width:100%;border-radius:.75rem;background:white;border:1px solid var(--sage-200);padding:.65rem .8rem;font-size:16px;outline:none}.input:focus{border-color:var(--sage-600);box-shadow:0 0 0 3px rgb(74 103 65 / .15)}.area{min-height:70px}` })
  ] });
}
function BirdCard({
  bird,
  completeness,
  resumeStep
}) {
  const ready = completeness.pct >= 100;
  const missing = (completeness.checks ?? []).filter((c) => !c.done).map((c) => c.label);
  const needCount = missing.length;
  (bird.name?.slice(0, 1) ?? "?").toUpperCase();
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "overflow-hidden rounded-[20px] bg-[#efe9da] shadow-sm", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs(Link, { to: "/birds/$birdId", params: {
      birdId: bird.id
    }, className: "block active:scale-[0.99]", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "relative grid aspect-[4/3] w-full place-items-center bg-[#e3dcc9]", children: [
        bird.photo_url ? /* @__PURE__ */ jsxRuntimeExports.jsx("img", { src: bird.photo_url, alt: bird.name, loading: "lazy", style: {
          objectPosition: bird.photo_position ?? "50% 20%"
        }, className: "absolute inset-0 size-full object-cover" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(Feather, { className: "size-9 text-[#2d6a4f]" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "absolute left-3 top-3 rounded-full bg-white/[0.92] px-2.5 py-1 text-[11px] font-medium text-[#1a3d2e] shadow-sm", children: [
          "Care plan ",
          completeness.pct,
          "%"
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "p-4", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-start justify-between gap-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "min-w-0", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[18px] font-medium leading-tight text-[#1a3d2e]", children: bird.name }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-0.5 text-sm text-[#5f5e5a]", children: bird.species ?? "Parrot" })
        ] }),
        ready ? /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "shrink-0 rounded-full bg-[#d6e8dc] px-3 py-1 text-xs font-medium text-[#1a5e3f]", children: "Ready to share" }) : /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "shrink-0 rounded-full bg-[#f4e4c4] px-3 py-1 text-xs font-medium text-[#84600f]", children: [
          "Needs ",
          needCount,
          " ",
          needCount === 1 ? "thing" : "things"
        ] })
      ] }) })
    ] }),
    !ready && /* @__PURE__ */ jsxRuntimeExports.jsxs(Link, { to: "/birds/$birdId/setup", params: {
      birdId: bird.id
    }, search: {
      step: resumeStep
    }, "aria-label": `Care plan ${completeness.pct}% complete — open setup at step ${resumeStep}`, className: "block border-t border-[#e0d8c4] px-4 py-2.5 transition-colors hover:bg-black/[0.03]", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-xs text-[#5f5e5a]", children: [
        "Add ",
        missing.slice(0, 2).join(" and ").toLowerCase(),
        " to be sitter-ready."
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-1.5 h-1 w-full overflow-hidden rounded-full bg-[#e0d8c4]", children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "h-full rounded-full bg-[#2d6a4f] transition-all", style: {
        width: `${Math.max(4, completeness.pct)}%`
      } }) })
    ] })
  ] });
}
function SitForm({
  birds,
  onCreated,
  initialOpen = false,
  preselectBirdId,
  activeSit
}) {
  const navigate = useNavigate();
  const [open, setOpen] = reactExports.useState(initialOpen);
  const initialSelection = preselectBirdId ? /* @__PURE__ */ new Set([preselectBirdId]) : new Set(birds.length === 1 ? [birds[0].id] : []);
  const [selected, setSelected] = reactExports.useState(initialSelection);
  reactExports.useEffect(() => {
    if (initialOpen) {
      setOpen(true);
      navigate({
        to: "/dashboard",
        search: {},
        replace: true
      });
    }
  }, []);
  const [sitterName, setSitterName] = reactExports.useState("");
  const [sitterEmail, setSitterEmail] = reactExports.useState("");
  const [start, setStart] = reactExports.useState("");
  const [end, setEnd] = reactExports.useState("");
  const [notes, setNotes] = reactExports.useState("");
  const [saving, setSaving] = reactExports.useState(false);
  function toggle(id) {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  }
  function selectAll() {
    setSelected(new Set(birds.map((b) => b.id)));
  }
  async function submit(e) {
    e.preventDefault();
    if (selected.size === 0) {
      toast.error("Pick at least one bird.");
      return;
    }
    if (!start || !end) {
      toast.error("Pick a start and end date.");
      return;
    }
    if (end < start) {
      toast.error("End date must be on or after start date.");
      return;
    }
    setSaving(true);
    try {
      const birdIds = Array.from(selected);
      const [{
        data: contacts,
        error: ecErr
      }, {
        data: u
      }] = await Promise.all([supabase.from("emergency_contacts").select("bird_id, owner_phone, avian_vet_phone").in("bird_id", birdIds), supabase.auth.getUser()]);
      if (ecErr) {
        toast.error(ecErr.message);
        setSaving(false);
        return;
      }
      if (!u.user) {
        toast.error("You're signed out.");
        setSaving(false);
        return;
      }
      const {
        data: defaults
      } = await supabase.from("owner_emergency_defaults").select("owner_phone, avian_vet_phone").eq("owner_id", u.user.id).maybeSingle();
      const contactByBird = new Map((contacts ?? []).map((c) => [c.bird_id, c]));
      const eff = (c, k) => c?.[k]?.trim?.() || defaults?.[k]?.trim?.() || "";
      const missing = birdIds.map((id) => {
        const c = contactByBird.get(id);
        const needs = [];
        if (!eff(c, "owner_phone")) needs.push("your phone");
        if (!eff(c, "avian_vet_phone")) needs.push("avian vet phone");
        return needs.length ? {
          bird: birds.find((b) => b.id === id),
          needs
        } : null;
      }).filter(Boolean);
      if (missing.length) {
        const details = missing.map((m) => `${m.bird?.name ?? "Bird"}: ${m.needs.join(" & ")}`).join("; ");
        toast.error(`Add the required emergency contacts before sharing a sitter link — ${details}. Set account defaults below, or open the bird's Emergency tab.`, {
          duration: 8e3
        });
        setSaving(false);
        return;
      }
      const expires = (/* @__PURE__ */ new Date(end + "T23:59:59Z")).toISOString();
      const {
        data: sit,
        error
      } = await supabase.from("sits").insert({
        owner_id: u.user.id,
        sitter_name: sitterName || null,
        sitter_email: sitterEmail || null,
        start_date: start,
        end_date: end,
        notes: notes || null,
        token_expires_at: expires,
        status: "upcoming"
      }).select().single();
      if (error || !sit) {
        toast.error(error?.message ?? "Could not create sit.");
        setSaving(false);
        return;
      }
      const rows = birdIds.map((bird_id) => ({
        sit_id: sit.id,
        bird_id
      }));
      const {
        error: linkErr
      } = await supabase.from("sit_birds").insert(rows);
      if (linkErr) {
        toast.error(linkErr.message);
        setSaving(false);
        return;
      }
      const days = Math.max(1, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 864e5) + 1);
      track("sit_created", {
        bird_count: birdIds.length,
        days,
        has_email: !!sitterEmail
      });
      toast.success("Sit created.");
      setOpen(false);
      setSitterName("");
      setSitterEmail("");
      setStart("");
      setEnd("");
      setNotes("");
      setSelected(new Set(birds.length === 1 ? [birds[0].id] : []));
      onCreated();
    } finally {
      setSaving(false);
    }
  }
  if (!open) {
    if (activeSit) {
      return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-[20px] bg-[#cdeab0] p-5", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-lg font-medium text-[#1f3d12]", children: "Sit active" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 text-sm text-[#3f5e22]", children: "A sit is underway right now. Your sitter has their private link." }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("a", { href: "#sits", className: "mt-4 inline-flex items-center gap-2 rounded-[14px] bg-[#1a3d2e] px-4 py-2.5 text-sm font-medium text-white", children: "View details" })
      ] });
    }
    return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "relative overflow-hidden rounded-[20px] bg-[#cdeab0] p-5", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Feather, { className: "pointer-events-none absolute -right-3 -top-3 size-20 rotate-12 text-[#1f3d12]/10" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-lg font-medium text-[#1f3d12]", children: "Going away soon?" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 max-w-[18rem] text-sm text-[#3f5e22]", children: "Create a sit and send your sitter a private link with everything they need." }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { onClick: () => setOpen(true), className: "mt-4 inline-flex items-center gap-2 rounded-[14px] bg-[#1a3d2e] px-4 py-2.5 text-sm font-medium text-white", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Plus, { className: "size-4" }),
        " New sit"
      ] })
    ] });
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("form", { onSubmit: submit, noValidate: true, className: "space-y-3 rounded-[20px] bg-[#efe9da] p-4", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm font-medium text-[#1a3d2e]", children: "New sit" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", onClick: () => setOpen(false), className: "text-xs text-[#5f5e5a] underline", children: "Cancel" })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[11px] font-medium uppercase tracking-wider text-[#5f5e5a]", children: "Birds included" }),
        birds.length > 1 && /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", onClick: selectAll, className: "text-[11px] font-medium text-[#1a3d2e] underline", children: "Select all" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-2 grid grid-cols-2 gap-2", children: birds.map((b) => {
        const on = selected.has(b.id);
        return /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { type: "button", onClick: () => toggle(b.id), className: `flex items-center gap-2 rounded-lg border px-2 py-2 text-left text-sm ${on ? "border-[#2d6a4f] bg-[#e8f0ec]" : "border-[#e0d8c4] bg-white"}`, children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `grid size-4 shrink-0 place-items-center rounded border-2 ${on ? "border-[#2d6a4f] bg-[#2d6a4f]" : "border-[#bcb6a3]"}`, children: on && /* @__PURE__ */ jsxRuntimeExports.jsx("svg", { viewBox: "0 0 20 20", className: "size-3 text-white", children: /* @__PURE__ */ jsxRuntimeExports.jsx("path", { fill: "currentColor", d: "M7.629 13.314 4.4 10.085l1.214-1.214 2.015 2.015 5.757-5.757 1.214 1.214z" }) }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "truncate text-[#1a3d2e]", children: b.name })
        ] }, b.id);
      }) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "Sitter name", children: /* @__PURE__ */ jsxRuntimeExports.jsx("input", { className: "input", value: sitterName, onChange: (e) => setSitterName(e.target.value) }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "Sitter email", children: /* @__PURE__ */ jsxRuntimeExports.jsx("input", { className: "input", type: "email", value: sitterEmail, onChange: (e) => setSitterEmail(e.target.value) }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-2 gap-3", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "Start", children: /* @__PURE__ */ jsxRuntimeExports.jsx("input", { className: "input", type: "date", value: start, onChange: (e) => setStart(e.target.value) }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "End", children: /* @__PURE__ */ jsxRuntimeExports.jsx("input", { className: "input", type: "date", value: end, onChange: (e) => setEnd(e.target.value) }) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "Notes for this sit", children: /* @__PURE__ */ jsxRuntimeExports.jsx("textarea", { className: "input area", value: notes, onChange: (e) => setNotes(e.target.value) }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "submit", disabled: saving, className: "w-full rounded-[14px] bg-[#1a3d2e] py-3 text-sm font-medium text-white disabled:opacity-50", children: saving ? "Creating..." : "Create sit & generate link" })
  ] });
}
function Field({
  label,
  children
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "block", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "mb-1 block text-xs font-medium uppercase tracking-wider text-[#5f5e5a]", children: label }),
    children
  ] });
}
function DefaultsPanel() {
  const qc = useQueryClient();
  const [open, setOpen] = reactExports.useState(false);
  const {
    data: defaults
  } = useQuery({
    queryKey: ["owner-defaults"],
    queryFn: async () => {
      const {
        data: u
      } = await supabase.auth.getUser();
      if (!u.user) return null;
      const {
        data
      } = await supabase.from("owner_emergency_defaults").select("*").eq("owner_id", u.user.id).maybeSingle();
      return data ?? {
        owner_id: u.user.id
      };
    }
  });
  const [d, setD] = reactExports.useState(defaults ?? {});
  const [saving, setSaving] = reactExports.useState(false);
  const fields = [["owner_phone", "Owner phone", true], ["backup_name", "Backup contact name"], ["backup_phone", "Backup contact phone"], ["avian_vet_name", "Avian vet name"], ["avian_vet_phone", "Avian vet phone", true], ["avian_vet_address", "Avian vet address"], ["emergency_vet_name", "Emergency vet name"], ["emergency_vet_phone", "Emergency vet phone"], ["emergency_vet_address", "Emergency vet address"], ["poison_control", "Poison control number"], ["carrier_location", "Carrier location"], ["first_aid_kit_location", "First-aid kit location"], ["emergency_authorization", "Emergency-care authorization"], ["spending_limit", "Approved spending limit"]];
  const filledCount = defaults ? fields.filter(([k]) => typeof defaults[k] === "string" && defaults[k].trim()).length : 0;
  async function save() {
    setSaving(true);
    const {
      data: u
    } = await supabase.auth.getUser();
    if (!u.user) {
      toast.error("Signed out.");
      setSaving(false);
      return;
    }
    const row = {
      owner_id: u.user.id
    };
    for (const [k] of fields) {
      const v = d[k];
      row[k] = typeof v === "string" && v.trim() === "" ? null : v ?? null;
    }
    const {
      error
    } = await supabase.from("owner_emergency_defaults").upsert(row, {
      onConflict: "owner_id"
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Defaults saved. New and existing birds inherit any empty fields.");
    setOpen(false);
    qc.invalidateQueries({
      queryKey: ["owner-defaults"]
    });
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "space-y-3", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-end justify-between", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-[21px] font-medium text-[#1a3d2e]", children: "Account emergency defaults" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", onClick: () => {
        setD(defaults ?? {});
        setOpen((o) => !o);
      }, className: "text-sm font-medium text-[#1a3d2e] underline", children: open ? "Close" : filledCount > 0 ? "Edit" : "Set up" })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-xs text-[#5f5e5a]", children: [
      "Set owner phone, avian vet, and other emergency info ",
      /* @__PURE__ */ jsxRuntimeExports.jsx("em", { children: "once" }),
      ". Every bird inherits these unless its Emergency tab overrides a field."
    ] }),
    !open ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "rounded-[20px] bg-[#efe9da] p-4 text-xs text-[#5f5e5a]", children: filledCount === 0 ? "No defaults set yet — each bird needs its own contacts until you fill these in." : `${filledCount} of ${fields.length} default fields set.` }) : /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-3 rounded-[20px] bg-[#efe9da] p-4", children: [
      fields.map(([k, l, required]) => /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: required ? `${l} *` : l, children: /* @__PURE__ */ jsxRuntimeExports.jsx("input", { className: "input", value: d[k] ?? "", onChange: (e) => setD({
        ...d,
        [k]: e.target.value
      }) }) }, k)),
      /* @__PURE__ */ jsxRuntimeExports.jsx("button", { disabled: saving, onClick: save, className: "mt-2 w-full rounded-[14px] bg-[#1a3d2e] py-3 text-sm font-medium text-white disabled:opacity-50", children: saving ? "Saving..." : "Save account defaults" })
    ] })
  ] });
}
export {
  Dashboard as component
};

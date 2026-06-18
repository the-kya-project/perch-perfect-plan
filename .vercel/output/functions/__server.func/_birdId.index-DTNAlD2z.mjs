import { r as reactExports, j as jsxRuntimeExports } from "./_libs/react.mjs";
import { L as Link, e as useNavigate } from "./_libs/tanstack__react-router.mjs";
import { a as useQueryClient, b as useQuery } from "./_libs/tanstack__react-query.mjs";
import { supabase } from "./_ssr/client-HgPYj8QJ.mjs";
import { c as computeSetupCompleteness, S as SitCard } from "./_ssr/setupCompleteness-D-ALr6iS.mjs";
import { t as toast } from "./_libs/sonner.mjs";
import { D as Disclaimer } from "./_ssr/Disclaimer-BfRf9x0C.mjs";
import { P as PhotoCropper, S as SpeciesPicker, A as AgePicker } from "./_ssr/BirdPickers-CgSvo35-.mjs";
import { n as Route$2 } from "./_ssr/router-Cu2Tdjxf.mjs";
import "./_libs/seroval.mjs";
import { A as ArrowLeft, y as WandSparkles, m as Trash2, P as Plus, T as TriangleAlert, a as ChevronDown } from "./_libs/lucide-react.mjs";
import "./_libs/tanstack__router-core.mjs";
import "./_libs/tanstack__history.mjs";
import "./_libs/cookie-es.mjs";
import "./_libs/seroval-plugins.mjs";
import "node:stream/web";
import "node:stream";
import "./_libs/react-dom.mjs";
import "util";
import "crypto";
import "async_hooks";
import "stream";
import "./_libs/isbot.mjs";
import "./_libs/tanstack__query-core.mjs";
import "./_libs/supabase__supabase-js.mjs";
import "./_libs/supabase__postgrest-js.mjs";
import "./_libs/supabase__realtime-js.mjs";
import "./_libs/supabase__phoenix.mjs";
import "./_libs/supabase__storage-js.mjs";
import "./_libs/iceberg-js.mjs";
import "./_libs/supabase__auth-js.mjs";
import "tslib";
import "./_libs/supabase__functions-js.mjs";
import "./_ssr/triage-DfSRYuT8.mjs";
import "./_ssr/server-9nIpN7MJ.mjs";
import "node:async_hooks";
import "./_libs/h3-v2.mjs";
import "./_libs/rou3.mjs";
import "./_libs/srvx.mjs";
import "./_libs/zod.mjs";
function BirdEditor() {
  const {
    birdId
  } = Route$2.useParams();
  const {
    tab: tabParam
  } = Route$2.useSearch();
  const qc = useQueryClient();
  const [tab, setTab] = reactExports.useState(tabParam ?? "basics");
  reactExports.useEffect(() => {
    if (tabParam) setTab(tabParam);
  }, [tabParam]);
  const {
    data: bird
  } = useQuery({
    queryKey: ["bird", birdId],
    queryFn: async () => {
      const {
        data,
        error
      } = await supabase.from("birds").select("*").eq("id", birdId).single();
      if (error) throw error;
      return data;
    }
  });
  const {
    data: plan
  } = useQuery({
    queryKey: ["plan", birdId],
    queryFn: async () => {
      const {
        data
      } = await supabase.from("care_plans").select("*").eq("bird_id", birdId).maybeSingle();
      return data;
    }
  });
  const {
    data: contacts
  } = useQuery({
    queryKey: ["contacts", birdId],
    queryFn: async () => {
      const {
        data
      } = await supabase.from("emergency_contacts").select("*").eq("bird_id", birdId).maybeSingle();
      return data;
    }
  });
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
      return data;
    }
  });
  const {
    data: tasks = []
  } = useQuery({
    queryKey: ["tasks", plan?.id],
    enabled: !!plan?.id,
    queryFn: async () => {
      const {
        data
      } = await supabase.from("routine_tasks").select("*").eq("care_plan_id", plan.id).order("category").order("sort_order");
      return data ?? [];
    }
  });
  const {
    data: sits = []
  } = useQuery({
    queryKey: ["sits", birdId],
    queryFn: async () => {
      const {
        data
      } = await supabase.from("sit_birds").select("sit:sits(*)").eq("bird_id", birdId);
      const rows = (data ?? []).map((r) => r.sit).filter(Boolean);
      rows.sort((a, b) => a.start_date < b.start_date ? 1 : -1);
      return rows;
    }
  });
  if (!bird) return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "p-6 text-sm text-sage-600", children: "Loading..." });
  const tabs = [{
    id: "basics",
    label: "Basics"
  }, {
    id: "routine",
    label: "Routine"
  }, {
    id: "food",
    label: "Food"
  }, {
    id: "behavior",
    label: "Behavior"
  }, {
    id: "home",
    label: "Home"
  }, {
    id: "health",
    label: "Health"
  }, {
    id: "clips",
    label: "Clips"
  }, {
    id: "emergency",
    label: "Emergency"
  }, {
    id: "sits",
    label: "Sits"
  }, {
    id: "logs",
    label: "Logs"
  }];
  const completeness = computeSetupCompleteness({
    bird,
    plan,
    tasksCount: tasks.length,
    contacts,
    defaults
  });
  const isComplete = completeness.firstIncompleteStep === null;
  const onPlanSaved = () => {
    qc.invalidateQueries({
      queryKey: ["plan", birdId]
    });
    qc.invalidateQueries({
      queryKey: ["bird", birdId]
    });
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "min-h-screen bg-sage-50 pb-20", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("header", { className: "sticky top-0 z-10 border-b border-sage-100 bg-white", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mx-auto max-w-md px-4 py-3", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Link, { to: "/dashboard", className: "rounded p-1 text-sage-600", children: /* @__PURE__ */ jsxRuntimeExports.jsx(ArrowLeft, { className: "size-5" }) }),
        bird.photo_url && /* @__PURE__ */ jsxRuntimeExports.jsx("img", { src: bird.photo_url, alt: bird.name, className: "size-9 rounded-full object-cover ring-1 ring-sage-200", style: {
          objectPosition: bird.photo_position ?? "50% 50%"
        } }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 min-w-0", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { className: "text-sm font-bold truncate", children: bird.name }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[10px] uppercase tracking-wider text-sage-600", children: bird.species ?? "Parrot" })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "-mx-1 mt-3 flex gap-1 overflow-x-auto pb-1", children: tabs.map((t) => /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: () => setTab(t.id), className: `shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${tab === t.id ? "bg-sage-900 text-white" : "bg-sage-100 text-sage-700"}`, children: t.label }, t.id)) })
    ] }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("main", { className: "mx-auto max-w-md space-y-4 px-4 py-5", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Link, { to: "/birds/$birdId/setup", params: {
        birdId
      }, search: completeness.firstIncompleteStep ? {
        step: completeness.firstIncompleteStep
      } : void 0, className: "block rounded-2xl bg-sage-900 p-4 text-white shadow-sm ring-1 ring-sage-900/10 active:scale-[0.99]", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-start gap-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/10", children: /* @__PURE__ */ jsxRuntimeExports.jsx(WandSparkles, { className: "size-5" }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "min-w-0 flex-1", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[10px] font-bold uppercase tracking-wider text-sage-300", children: "Guided care plan editor" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "mt-0.5 text-sm font-semibold leading-snug", children: [
            "Build and edit ",
            bird.name,
            "'s full care plan"
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 text-[11px] leading-snug text-sage-200", children: "Step through every section — feeding, behavior, home, health, clips, emergency — and update it anytime." }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-2 text-[11px] font-semibold text-sage-300", children: isComplete ? `All ${completeness.total} sections complete.` : `${completeness.doneCount} of ${completeness.total} sections complete.` })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "shrink-0 self-center rounded-lg bg-white px-3 py-1.5 text-[11px] font-bold text-sage-900", children: isComplete ? "Open editor" : completeness.doneCount === 0 ? "Open editor" : "Continue" })
      ] }) }),
      ["basics", "food", "behavior", "home", "health", "clips"].includes(tab) && plan && /* @__PURE__ */ jsxRuntimeExports.jsx(PlanFormSection, { section: tab, birdId, bird, plan, onSaved: onPlanSaved }),
      tab === "routine" && plan && /* @__PURE__ */ jsxRuntimeExports.jsx(RoutineEditor, { planId: plan.id, tasks, onChange: () => qc.invalidateQueries({
        queryKey: ["tasks", plan.id]
      }) }),
      tab === "emergency" && contacts && /* @__PURE__ */ jsxRuntimeExports.jsx(ContactsForm, { birdId, contacts, defaults: defaults ?? null, onSaved: () => qc.invalidateQueries({
        queryKey: ["contacts", birdId]
      }) }),
      tab === "sits" && /* @__PURE__ */ jsxRuntimeExports.jsx(SitsPanel, { birdId, sits, onChange: () => qc.invalidateQueries({
        queryKey: ["sits", birdId]
      }) }),
      tab === "logs" && /* @__PURE__ */ jsxRuntimeExports.jsx(LogsPanel, { birdId })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("style", { children: `.input{width:100%;border-radius:.75rem;background:white;border:1px solid var(--sage-200);padding:.65rem .8rem;font-size:16px;outline:none}.input:focus{border-color:var(--sage-600);box-shadow:0 0 0 3px rgb(74 103 65 / .15)}.area{min-height:80px;line-height:1.4}` })
  ] });
}
function Field({
  label,
  hint,
  children
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "block", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "mb-1 block text-xs font-semibold uppercase tracking-wider text-sage-600", children: label }),
    hint && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "mb-1 block text-[11px] text-sage-600", children: hint }),
    children
  ] });
}
const CLIP_FIELDS = [{
  key: "clip_step_up_path",
  label: "How she steps up",
  hint: "Hand position, cue word, what works."
}, {
  key: "clip_food_water_path",
  label: "Refilling food & water",
  hint: "Bowls, fill amount, cage-door routine."
}, {
  key: "clip_locations_path",
  label: "Where everything is",
  hint: "Food, treats, towels, carrier, first aid."
}, {
  key: "clip_bedtime_path",
  label: "Settling for the night",
  hint: "Cover, lights, sounds."
}];
function PlanFormSection({
  section,
  birdId,
  bird,
  plan,
  onSaved
}) {
  const [b, setB] = reactExports.useState(bird);
  const [p, setP] = reactExports.useState(plan);
  const [saving, setSaving] = reactExports.useState(false);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [confirmDelete, setConfirmDelete] = reactExports.useState(false);
  const [deleteText, setDeleteText] = reactExports.useState("");
  const [deleting, setDeleting] = reactExports.useState(false);
  reactExports.useEffect(() => {
    setB(bird);
  }, [bird, section]);
  reactExports.useEffect(() => {
    setP(plan);
  }, [plan, section]);
  async function deleteBird() {
    if (deleteText.trim() !== (bird.name ?? "").trim()) {
      toast.error(`Type "${bird.name}" exactly to confirm.`);
      return;
    }
    setDeleting(true);
    await supabase.from("sit_birds").delete().eq("bird_id", birdId);
    await supabase.from("weight_logs").delete().eq("bird_id", birdId);
    await supabase.from("photo_logs").delete().eq("bird_id", birdId);
    await supabase.from("daily_logs").delete().eq("bird_id", birdId);
    await supabase.from("emergency_contacts").delete().eq("bird_id", birdId);
    if (plan?.id) {
      await supabase.from("routine_tasks").delete().eq("care_plan_id", plan.id);
      await supabase.from("care_plans").delete().eq("id", plan.id);
    }
    const {
      error
    } = await supabase.from("birds").delete().eq("id", birdId);
    setDeleting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`${bird.name} removed.`);
    qc.invalidateQueries({
      queryKey: ["birds"]
    });
    navigate({
      to: "/dashboard"
    });
  }
  async function save() {
    setSaving(true);
    const {
      id: bId,
      owner_id,
      created_at,
      updated_at,
      ...birdPatch
    } = b;
    const {
      id: pId,
      bird_id,
      created_at: pc,
      updated_at: pu,
      ...planPatch
    } = p;
    await Promise.all([supabase.from("birds").update(birdPatch).eq("id", birdId), supabase.from("care_plans").update(planPatch).eq("id", plan.id)]);
    setSaving(false);
    toast.success("Saved.");
    onSaved();
  }
  async function onPhoto(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2e6) {
      toast.error("Photo must be under 2MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setB({
      ...b,
      photo_url: reader.result
    });
    reader.readAsDataURL(file);
  }
  const guidedHint = /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-[11px] text-sage-600", children: [
    "Need to capture richer details?",
    " ",
    /* @__PURE__ */ jsxRuntimeExports.jsx(Link, { to: "/birds/$birdId/setup", params: {
      birdId
    }, className: "font-semibold text-sage-800 underline", children: "Open guided setup" }),
    "."
  ] });
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(Disclaimer, { compact: true }),
    section === "basics" && /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "rounded-2xl bg-white p-4 space-y-3 ring-1 ring-sage-100", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-sm font-bold", children: "Basics" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-start gap-3", children: [
        b.photo_url ? /* @__PURE__ */ jsxRuntimeExports.jsx(PhotoCropper, { src: b.photo_url, position: b.photo_position, onChange: (pos) => setB({
          ...b,
          photo_position: pos
        }), size: 120 }) : /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex size-[120px] items-center justify-center rounded-xl bg-sage-100 text-[10px] uppercase tracking-wider text-sage-600", children: "No photo" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 space-y-2 pt-1", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "inline-block cursor-pointer rounded-lg bg-sage-100 px-3 py-1.5 text-xs font-semibold text-sage-700", children: [
            b.photo_url ? "Change photo" : "Add photo",
            /* @__PURE__ */ jsxRuntimeExports.jsx("input", { type: "file", accept: "image/*", className: "hidden", onChange: onPhoto })
          ] }),
          b.photo_url && /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", onClick: () => setB({
            ...b,
            photo_url: null,
            photo_position: null
          }), className: "ml-2 text-xs font-semibold text-warn-red underline", children: "Remove" })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "Name", children: /* @__PURE__ */ jsxRuntimeExports.jsx("input", { className: "input", value: b.name ?? "", onChange: (e) => setB({
        ...b,
        name: e.target.value
      }) }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(SpeciesPicker, { value: b.species ?? "", onChange: (v) => setB({
        ...b,
        species: v
      }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(AgePicker, { age: b.age ?? "", birthDate: b.birth_date ?? "", onChange: (next) => setB({
        ...b,
        age: next.age,
        birth_date: next.birthDate
      }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-2 gap-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "Sex", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("select", { className: "input", value: b.sex ?? "", onChange: (e) => setB({
          ...b,
          sex: e.target.value || null
        }), children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "", children: "Unknown" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("option", { children: "Male" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("option", { children: "Female" })
        ] }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "Flight", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("select", { className: "input", value: b.flight_status ?? "unknown", onChange: (e) => setB({
          ...b,
          flight_status: e.target.value
        }), children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "unknown", children: "Unknown" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "fully_flighted", children: "Fully flighted" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "clipped", children: "Clipped" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "partially_clipped", children: "Partially clipped" })
        ] }) })
      ] })
    ] }),
    section === "food" && /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "rounded-2xl bg-white p-4 space-y-3 ring-1 ring-sage-100", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-sm font-bold", children: "Food & water" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "rounded-lg bg-warn-amber/10 p-2 text-[11px] font-semibold text-warn-amber", children: "Reminder: do not introduce new foods while the owner is away." }),
      guidedHint,
      [["food_instructions", "Food instructions (pellets, fresh, treats)"], ["water_instructions", "Water"], ["fresh_food_removal", "Fresh food removal timing"], ["treats_allowed", "Treats allowed"], ["foods_never_allowed", "Foods NEVER allowed for this bird"]].map(([k, l]) => /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: l, children: /* @__PURE__ */ jsxRuntimeExports.jsx("textarea", { className: "input area", value: p[k] ?? "", onChange: (e) => setP({
        ...p,
        [k]: e.target.value
      }) }) }, k)),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-xl bg-sage-50/60 p-3 ring-1 ring-sage-100 space-y-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs font-bold uppercase tracking-wider text-sage-700", children: "Freshness & hygiene" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "Remove fresh or wet food after", hint: "Fresh food spoils fast and can grow bacteria.", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("select", { className: "input", value: String(p.fresh_food_removal_minutes ?? 120), onChange: (e) => setP({
          ...p,
          fresh_food_removal_minutes: Number(e.target.value)
        }), children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "60", children: "1 hour" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "120", children: "2 hours" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "180", children: "3 hours" })
        ] }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "Wash food bowls", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("select", { className: "input", value: p.food_bowl_wash_cadence ?? "after_each_fresh", onChange: (e) => setP({
          ...p,
          food_bowl_wash_cadence: e.target.value
        }), children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "after_each_fresh", children: "After every fresh-food serving" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "once_daily", children: "Once a day" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "every_few_days", children: "Every few days" })
        ] }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "Wash water bowl or bottle", hint: "Separate from how often water is changed.", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("select", { className: "input", value: p.water_bowl_wash_cadence ?? "once_daily", onChange: (e) => setP({
          ...p,
          water_bowl_wash_cadence: e.target.value
        }), children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "once_daily", children: "Once a day" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "twice_daily", children: "Twice a day" })
        ] }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "Other food hygiene notes", children: /* @__PURE__ */ jsxRuntimeExports.jsx("textarea", { className: "input area", value: p.food_hygiene_notes ?? "", onChange: (e) => setP({
          ...p,
          food_hygiene_notes: e.target.value
        }) }) })
      ] })
    ] }),
    section === "behavior" && /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "rounded-2xl bg-white p-4 space-y-3 ring-1 ring-sage-100", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-sm font-bold", children: "Personality & handling" }),
      guidedHint,
      /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "Step-up cue & technique", children: /* @__PURE__ */ jsxRuntimeExports.jsx("textarea", { className: "input area", value: p.step_up ?? "", onChange: (e) => setP({
        ...p,
        step_up: e.target.value
      }) }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "Step-up notes (refusal, exceptions)", children: /* @__PURE__ */ jsxRuntimeExports.jsx("textarea", { className: "input area", value: p.step_up_notes ?? "", onChange: (e) => setP({
        ...p,
        step_up_notes: e.target.value
      }) }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "Who can handle her", children: /* @__PURE__ */ jsxRuntimeExports.jsx("textarea", { className: "input area", value: p.handlers ?? "", onChange: (e) => setP({
        ...p,
        handlers: e.target.value
      }) }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "Likes", children: /* @__PURE__ */ jsxRuntimeExports.jsx("textarea", { className: "input area", value: p.likes ?? "", onChange: (e) => setP({
        ...p,
        likes: e.target.value
      }) }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "Fears & triggers", children: /* @__PURE__ */ jsxRuntimeExports.jsx("textarea", { className: "input area", value: p.fears_triggers ?? "", onChange: (e) => setP({
        ...p,
        fears_triggers: e.target.value
      }) }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "Bite warning signs", children: /* @__PURE__ */ jsxRuntimeExports.jsx("textarea", { className: "input area", value: p.known_triggers ?? "", onChange: (e) => setP({
        ...p,
        known_triggers: e.target.value
      }) }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "Handling rules summary", children: /* @__PURE__ */ jsxRuntimeExports.jsx("textarea", { className: "input area", value: p.handling_rules ?? "", onChange: (e) => setP({
        ...p,
        handling_rules: e.target.value
      }) }) })
    ] }),
    section === "home" && /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "rounded-2xl bg-white p-4 space-y-3 ring-1 ring-sage-100", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-sm font-bold", children: "Environment & safety" }),
      guidedHint,
      /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "Cage location", children: /* @__PURE__ */ jsxRuntimeExports.jsx("textarea", { className: "input area", value: p.cage_location ?? "", onChange: (e) => setP({
        ...p,
        cage_location: e.target.value
      }) }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "Out-of-cage rules", children: /* @__PURE__ */ jsxRuntimeExports.jsx("textarea", { className: "input area", value: p.out_of_cage_rules ?? "", onChange: (e) => setP({
        ...p,
        out_of_cage_rules: e.target.value
      }) }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "Home hazards (windows, fans, appliances)", children: /* @__PURE__ */ jsxRuntimeExports.jsx("textarea", { className: "input area", value: p.safety_rules ?? "", onChange: (e) => setP({
        ...p,
        safety_rules: e.target.value
      }) }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "Other pets & separation rules", children: /* @__PURE__ */ jsxRuntimeExports.jsx("textarea", { className: "input area", value: p.other_pets ?? "", onChange: (e) => setP({
        ...p,
        other_pets: e.target.value
      }) }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "Cleaning products / instructions", children: /* @__PURE__ */ jsxRuntimeExports.jsx("textarea", { className: "input area", value: p.cleaning_instructions ?? "", onChange: (e) => setP({
        ...p,
        cleaning_instructions: e.target.value
      }) }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "Off-limits rooms", children: /* @__PURE__ */ jsxRuntimeExports.jsx("textarea", { className: "input area", value: p.off_limits_rooms ?? "", onChange: (e) => setP({
        ...p,
        off_limits_rooms: e.target.value
      }) }) })
    ] }),
    section === "health" && /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "rounded-2xl bg-white p-4 space-y-3 ring-1 ring-sage-100", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-sm font-bold", children: "Baseline weight (grams)" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-sage-600", children: "Used by the sitter's daily health scan to flag weight loss." }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-3 gap-3", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "Normal", children: /* @__PURE__ */ jsxRuntimeExports.jsx("input", { className: "input", inputMode: "decimal", value: b.normal_weight ?? "", onChange: (e) => setB({
            ...b,
            normal_weight: e.target.value === "" ? null : Number(e.target.value)
          }) }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "Min", children: /* @__PURE__ */ jsxRuntimeExports.jsx("input", { className: "input", inputMode: "decimal", value: b.normal_weight_min ?? "", onChange: (e) => setB({
            ...b,
            normal_weight_min: e.target.value === "" ? null : Number(e.target.value)
          }) }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "Max", children: /* @__PURE__ */ jsxRuntimeExports.jsx("input", { className: "input", inputMode: "decimal", value: b.normal_weight_max ?? "", onChange: (e) => setB({
            ...b,
            normal_weight_max: e.target.value === "" ? null : Number(e.target.value)
          }) }) })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "rounded-2xl bg-white p-4 space-y-3 ring-1 ring-sage-100", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-sm font-bold", children: "Conditions & medications" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "Medical conditions", children: /* @__PURE__ */ jsxRuntimeExports.jsx("textarea", { className: "input area", value: b.medical_conditions ?? "", onChange: (e) => setB({
          ...b,
          medical_conditions: e.target.value
        }) }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "Medications", children: /* @__PURE__ */ jsxRuntimeExports.jsx("textarea", { className: "input area", value: b.medications ?? "", onChange: (e) => setB({
          ...b,
          medications: e.target.value
        }) }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "Notes", children: /* @__PURE__ */ jsxRuntimeExports.jsx("textarea", { className: "input area", value: b.notes ?? "", onChange: (e) => setB({
          ...b,
          notes: e.target.value
        }) }) })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "rounded-2xl bg-white p-4 space-y-3 ring-1 ring-sage-100", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-sm font-bold", children: "What's normal" }),
        guidedHint,
        /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "Normal appetite & behavior summary", children: /* @__PURE__ */ jsxRuntimeExports.jsx("textarea", { className: "input area", value: p.whats_normal ?? "", onChange: (e) => setP({
          ...p,
          whats_normal: e.target.value
        }) }) }),
        [["normal_appetite", "Normal appetite"], ["normal_droppings", "Normal droppings"], ["normal_noise", "Normal noise level"], ["normal_activity", "Normal activity"], ["normal_sleep", "Sleep / nap habits"], ["normal_behavior_with_strangers", "Behavior with strangers"]].map(([k, l]) => /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: l, children: /* @__PURE__ */ jsxRuntimeExports.jsx("textarea", { className: "input area", value: p[k] ?? "", onChange: (e) => setP({
          ...p,
          [k]: e.target.value
        }) }) }, k))
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "rounded-2xl bg-white p-4 space-y-3 ring-1 ring-sage-100", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-sm font-bold", children: "Baseline media" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(MediaRow, { label: "Baseline droppings photo", path: p.baseline_droppings_path, onClear: () => setP({
          ...p,
          baseline_droppings_path: null
        }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(MediaRow, { label: "Normal-behavior clip", path: p.baseline_clip_path, onClear: () => setP({
          ...p,
          baseline_clip_path: null
        }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-[11px] text-sage-600", children: [
          "Record or replace in",
          " ",
          /* @__PURE__ */ jsxRuntimeExports.jsx(Link, { to: "/birds/$birdId/setup", params: {
            birdId
          }, className: "font-semibold text-sage-800 underline", children: "guided setup" }),
          "."
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "rounded-2xl bg-white p-4 space-y-3 ring-1 ring-sage-100", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-sm font-bold", children: "When to call" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "When to call the owner", children: /* @__PURE__ */ jsxRuntimeExports.jsx("textarea", { className: "input area", value: p.when_to_call_owner ?? "", onChange: (e) => setP({
          ...p,
          when_to_call_owner: e.target.value
        }) }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "When to call the vet", children: /* @__PURE__ */ jsxRuntimeExports.jsx("textarea", { className: "input area", value: p.when_to_call_vet ?? "", onChange: (e) => setP({
          ...p,
          when_to_call_vet: e.target.value
        }) }) })
      ] })
    ] }),
    section === "clips" && /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "rounded-2xl bg-white p-4 space-y-3 ring-1 ring-sage-100", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-sm font-bold", children: "Watch-first clips" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-[11px] text-sage-600", children: [
        "Short videos sitters watch first. Record or replace in",
        " ",
        /* @__PURE__ */ jsxRuntimeExports.jsx(Link, { to: "/birds/$birdId/setup", params: {
          birdId
        }, className: "font-semibold text-sage-800 underline", children: "guided setup" }),
        "."
      ] }),
      CLIP_FIELDS.map((c) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-xl bg-sage-50/60 p-3 ring-1 ring-sage-100 space-y-1", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs font-semibold text-sage-800", children: c.label }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[11px] text-sage-600", children: c.hint }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(MediaRow, { label: "", path: p[c.key], onClear: () => setP({
          ...p,
          [c.key]: null
        }) })
      ] }, c.key))
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("button", { disabled: saving, onClick: save, className: "sticky bottom-4 w-full rounded-xl bg-sage-600 py-3 text-sm font-semibold text-white shadow-lg disabled:opacity-50", children: saving ? "Saving..." : "Save changes" }),
    section === "basics" && /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "rounded-2xl border-2 border-warn-red/30 bg-warn-red/5 p-4 space-y-3", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-sm font-bold text-warn-red", children: "Danger zone" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-xs text-sage-700", children: [
        "Permanently delete ",
        bird.name,
        " and all of their care plan, routine, emergency info, weight logs, daily scans, and photos. This cannot be undone."
      ] }),
      !confirmDelete ? /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { type: "button", onClick: () => setConfirmDelete(true), className: "inline-flex items-center gap-2 rounded-xl border border-warn-red/40 bg-white px-3 py-2 text-xs font-semibold text-warn-red", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Trash2, { className: "size-4" }),
        " Delete ",
        bird.name
      ] }) : /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "block text-[11px] font-semibold text-sage-700", children: [
          "Type ",
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-bold", children: bird.name }),
          " to confirm"
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("input", { className: "input", value: deleteText, onChange: (e) => setDeleteText(e.target.value), placeholder: bird.name, autoFocus: true }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", disabled: deleting || deleteText.trim() !== (bird.name ?? "").trim(), onClick: deleteBird, className: "flex-1 rounded-xl bg-warn-red py-2.5 text-sm font-semibold text-white disabled:opacity-50", children: deleting ? "Deleting..." : `Permanently delete ${bird.name}` }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", onClick: () => {
            setConfirmDelete(false);
            setDeleteText("");
          }, className: "rounded-xl border border-sage-200 px-3 py-2.5 text-sm", children: "Cancel" })
        ] })
      ] })
    ] })
  ] });
}
function MediaRow({
  label,
  path,
  onClear
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between gap-2", children: [
    label && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs font-semibold text-sage-700", children: label }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "ml-auto flex items-center gap-2", children: path ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "rounded-full bg-warn-green/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-warn-green", children: "Recorded" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", onClick: onClear, className: "text-[11px] font-semibold text-warn-red underline", children: "Clear" })
    ] }) : /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "rounded-full bg-sage-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-sage-600", children: "Not recorded" }) })
  ] });
}
function RoutineEditor({
  planId,
  tasks,
  onChange
}) {
  const [adding, setAdding] = reactExports.useState(false);
  const [title, setTitle] = reactExports.useState("");
  const [category, setCategory] = reactExports.useState("morning");
  const [time, setTime] = reactExports.useState("");
  const [instructions, setInstructions] = reactExports.useState("");
  async function add(e) {
    e.preventDefault();
    await supabase.from("routine_tasks").insert({
      care_plan_id: planId,
      title,
      category,
      time_of_day: time,
      instructions
    });
    setTitle("");
    setTime("");
    setInstructions("");
    setAdding(false);
    onChange();
  }
  async function remove(id) {
    await supabase.from("routine_tasks").delete().eq("id", id);
    onChange();
  }
  const grouped = {};
  for (const t of tasks) (grouped[t.category] ??= []).push(t);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-sage-600", children: "Tasks the sitter will check off each day, grouped by time of day." }),
    ["morning", "midday", "evening", "bedtime", "custom"].map((cat) => /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "rounded-2xl bg-white p-4 ring-1 ring-sage-100", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-[11px] font-bold uppercase tracking-widest text-sage-600", children: cat }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("ul", { className: "mt-2 space-y-2", children: [
        (grouped[cat] ?? []).map((t) => /* @__PURE__ */ jsxRuntimeExports.jsxs("li", { className: "flex items-start gap-3 rounded-lg bg-sage-50 p-3", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-sm font-semibold", children: [
              t.title,
              t.time_of_day && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "ml-2 text-[10px] uppercase text-sage-600", children: t.time_of_day })
            ] }),
            t.instructions && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-0.5 text-xs text-sage-600", children: t.instructions })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: () => remove(t.id), className: "rounded p-1 text-sage-600", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Trash2, { className: "size-4" }) })
        ] }, t.id)),
        (grouped[cat] ?? []).length === 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("li", { className: "text-xs text-sage-400", children: "No tasks yet." })
      ] })
    ] }, cat)),
    !adding ? /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { onClick: () => setAdding(true), className: "flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-sage-200 py-3 text-sm font-semibold text-sage-700", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Plus, { className: "size-4" }),
      " Add task"
    ] }) : /* @__PURE__ */ jsxRuntimeExports.jsxs("form", { onSubmit: add, className: "space-y-3 rounded-2xl bg-white p-4 ring-1 ring-sage-100", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "Title", children: /* @__PURE__ */ jsxRuntimeExports.jsx("input", { className: "input", required: true, value: title, onChange: (e) => setTitle(e.target.value), placeholder: "Fresh water & chop" }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-2 gap-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "Time of day", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("select", { className: "input", value: category, onChange: (e) => setCategory(e.target.value), children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "morning", children: "Morning" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "midday", children: "Midday" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "evening", children: "Evening" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "bedtime", children: "Bedtime" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "custom", children: "Custom" })
        ] }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "Time (optional)", children: /* @__PURE__ */ jsxRuntimeExports.jsx("input", { className: "input", value: time, onChange: (e) => setTime(e.target.value), placeholder: "8:00 AM" }) })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "Instructions", children: /* @__PURE__ */ jsxRuntimeExports.jsx("textarea", { className: "input area", value: instructions, onChange: (e) => setInstructions(e.target.value) }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "submit", className: "flex-1 rounded-xl bg-sage-600 py-2.5 text-sm font-semibold text-white", children: "Add" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", onClick: () => setAdding(false), className: "rounded-xl border border-sage-200 px-3 py-2.5 text-sm", children: "Cancel" })
      ] })
    ] })
  ] });
}
function ContactsForm({
  birdId,
  contacts,
  defaults,
  onSaved
}) {
  const [c, setC] = reactExports.useState(contacts);
  const [saving, setSaving] = reactExports.useState(false);
  async function save() {
    setSaving(true);
    const {
      id,
      bird_id,
      updated_at,
      ...rest
    } = c;
    const patch = {};
    for (const [k, v] of Object.entries(rest)) {
      patch[k] = typeof v === "string" && v.trim() === "" ? null : v;
    }
    await supabase.from("emergency_contacts").update(patch).eq("bird_id", birdId);
    setSaving(false);
    toast.success("Emergency info saved.");
    onSaved();
  }
  const fields = [["owner_phone", "Owner phone", true], ["backup_name", "Backup contact name"], ["backup_phone", "Backup contact phone"], ["avian_vet_name", "Avian vet name"], ["avian_vet_phone", "Avian vet phone", true], ["avian_vet_address", "Avian vet address"], ["emergency_vet_name", "Emergency vet name"], ["emergency_vet_phone", "Emergency vet phone"], ["emergency_vet_address", "Emergency vet address"], ["poison_control", "Poison control number"], ["carrier_location", "Carrier location"], ["first_aid_kit_location", "First-aid kit location"], ["emergency_authorization", "Emergency-care authorization"], ["spending_limit", "Approved spending limit"]];
  const hasAnyDefault = defaults && Object.values(defaults).some((v) => typeof v === "string" && v.trim());
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "space-y-3 rounded-2xl bg-white p-4 ring-1 ring-sage-100", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-sm font-bold", children: "Emergency contacts & home info" }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-xs text-sage-600", children: [
      "Empty fields use your ",
      /* @__PURE__ */ jsxRuntimeExports.jsx(Link, { to: "/dashboard", className: "font-semibold underline", children: "account defaults" }),
      ". Type anything here to override the default for this bird. Owner phone and avian vet phone are required (default or override) before you can share a sitter link."
    ] }),
    !hasAnyDefault && /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "rounded-lg bg-sage-50 px-3 py-2 text-[11px] text-sage-700", children: [
      "No account defaults set yet. Add them once on the ",
      /* @__PURE__ */ jsxRuntimeExports.jsx(Link, { to: "/dashboard", className: "font-semibold underline", children: "dashboard" }),
      " and every bird will inherit them."
    ] }),
    fields.map(([k, l, required]) => {
      const raw = c[k];
      const isOverride = typeof raw === "string" && raw.trim() !== "";
      const defaultVal = (defaults?.[k] ?? "").toString();
      const inheriting = !isOverride && defaultVal.trim() !== "";
      return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "block text-xs font-semibold text-sage-700", children: [
            l,
            required && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-warn-red", children: " *" })
          ] }),
          isOverride ? /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", onClick: () => setC({
            ...c,
            [k]: ""
          }), className: "rounded-full bg-warn-amber/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-warn-amber", title: "Clear override and use account default", children: "Override · reset" }) : inheriting ? /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "rounded-full bg-sage-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-sage-700", children: "Default" }) : required ? /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "rounded-full bg-warn-red/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-warn-red", children: "Missing" }) : /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "rounded-full bg-sage-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-sage-500", children: "Empty" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("input", { className: "input", value: raw ?? "", placeholder: inheriting ? `Default: ${defaultVal}` : required ? "Required" : "Optional", onChange: (e) => setC({
          ...c,
          [k]: e.target.value
        }) })
      ] }, k);
    }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("button", { disabled: saving, onClick: save, className: "mt-2 w-full rounded-xl bg-sage-600 py-3 text-sm font-semibold text-white disabled:opacity-50", children: saving ? "Saving..." : "Save emergency info" })
  ] });
}
function SitsPanel({
  birdId,
  sits,
  onChange
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-xl bg-sage-100/60 p-3 text-xs text-sage-700", children: [
      "Sits are created from the ",
      /* @__PURE__ */ jsxRuntimeExports.jsx(Link, { to: "/dashboard", className: "font-semibold underline", children: "owner dashboard" }),
      ", where you can include multiple birds in one sit."
    ] }),
    sits.length === 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-sage-600", children: "This bird isn't part of any sit yet." }),
    sits.map((s) => /* @__PURE__ */ jsxRuntimeExports.jsx(SitCard, { sit: s, onChange }, s.id))
  ] });
}
function LogsPanel({
  birdId
}) {
  const qc = useQueryClient();
  const [weight, setWeight] = reactExports.useState("");
  const [wNotes, setWNotes] = reactExports.useState("");
  const [saving, setSaving] = reactExports.useState(false);
  const [expandedScan, setExpandedScan] = reactExports.useState(null);
  const {
    data: weights = []
  } = useQuery({
    queryKey: ["weights", birdId],
    queryFn: async () => {
      const {
        data
      } = await supabase.from("weight_logs").select("*").eq("bird_id", birdId).order("logged_at", {
        ascending: false
      }).limit(30);
      return data ?? [];
    }
  });
  const {
    data: daily = []
  } = useQuery({
    queryKey: ["daily-logs", birdId],
    queryFn: async () => {
      const {
        data
      } = await supabase.from("daily_logs").select("*").eq("bird_id", birdId).order("created_at", {
        ascending: false
      }).limit(30);
      return data ?? [];
    }
  });
  const {
    data: photos = []
  } = useQuery({
    queryKey: ["photo-logs", birdId],
    queryFn: async () => {
      const {
        data
      } = await supabase.from("photo_logs").select("*").eq("bird_id", birdId).order("created_at", {
        ascending: false
      }).limit(20);
      return data ?? [];
    }
  });
  async function addWeight(e) {
    e.preventDefault();
    const grams = parseFloat(weight);
    if (!grams || grams <= 0) {
      toast.error("Enter a weight in grams.");
      return;
    }
    setSaving(true);
    const {
      error
    } = await supabase.from("weight_logs").insert({
      bird_id: birdId,
      weight: grams,
      notes: wNotes || null,
      logged_at: (/* @__PURE__ */ new Date()).toISOString()
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setWeight("");
    setWNotes("");
    qc.invalidateQueries({
      queryKey: ["weights", birdId]
    });
    toast.success("Weight logged.");
  }
  const triageColor = (s) => s === "red" ? "bg-warn-red/10 text-warn-red" : s === "yellow" ? "bg-warn-amber/10 text-warn-amber" : "bg-warn-green/10 text-warn-green";
  const SCAN_COLS = [{
    col: "alertness_status",
    label: "Alert and responsive"
  }, {
    col: "food_status",
    label: "Eating normally"
  }, {
    col: "droppings_status",
    label: "Droppings look normal"
  }, {
    col: "breathing_status",
    label: "Breathing normally"
  }, {
    col: "posture_status",
    label: "Perched normally"
  }, {
    col: "behavior_status",
    label: "Vocalizing as usual"
  }, {
    col: "energy_status",
    label: "Not fluffed for long stretches"
  }, {
    col: "injury_status",
    label: "No injury, fall, bite, or scratch"
  }, {
    col: "exposure_status",
    label: "No exposure to fumes / unsafe items"
  }];
  const severityRank = (s) => s === "red" ? 0 : s === "yellow" ? 1 : 2;
  const sortedDaily = [...daily].sort((a, b) => {
    const r = severityRank(a.triage_status) - severityRank(b.triage_status);
    if (r !== 0) return r;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
  const answerStyle = (a) => a === "concerning" ? "bg-warn-red/10 text-warn-red" : a === "not_sure" ? "bg-warn-amber/10 text-warn-amber" : a === "normal" ? "bg-warn-green/10 text-warn-green" : "bg-sage-100 text-sage-500";
  const answerLabel = (a) => a === "concerning" ? "Concerning" : a === "not_sure" ? "Not sure" : a === "normal" ? "Normal" : "—";
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(Disclaimer, { compact: true }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "rounded-2xl bg-white p-4 ring-1 ring-sage-100", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-sm font-bold", children: "Log weight" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 text-[11px] text-sage-600", children: "Weigh at the same time of day on the same scale for trustworthy trends." }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("form", { onSubmit: addWeight, className: "mt-3 space-y-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("input", { className: "input", type: "number", step: "0.1", placeholder: "Weight (g)", value: weight, onChange: (e) => setWeight(e.target.value) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("button", { disabled: saving, className: "rounded-xl bg-sage-600 px-4 text-sm font-semibold text-white disabled:opacity-50", children: "Add" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("input", { className: "input", placeholder: "Notes (optional)", value: wNotes, onChange: (e) => setWNotes(e.target.value) })
      ] }),
      weights.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("ul", { className: "mt-3 divide-y divide-sage-100 text-sm", children: weights.map((w) => /* @__PURE__ */ jsxRuntimeExports.jsxs("li", { className: "flex items-center justify-between py-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "font-semibold", children: [
          w.weight,
          " g"
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[11px] text-sage-600", children: new Date(w.logged_at).toLocaleString(void 0, {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit"
        }) })
      ] }, w.id)) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "rounded-2xl bg-white p-4 ring-1 ring-sage-100", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-sm font-bold", children: "Health scans from sitters" }),
      daily.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-2 text-sm text-sage-600", children: "No scans logged yet." }) : /* @__PURE__ */ jsxRuntimeExports.jsx("ul", { className: "mt-3 space-y-3", children: sortedDaily.map((d) => {
        const isOpen = expandedScan === d.id;
        const needsAttention = d.triage_status === "red" || d.triage_status === "yellow";
        const linkedPhotos = photos.filter((p) => p.daily_log_id === d.id);
        const wrap = d.triage_status === "red" ? "border-2 border-warn-red bg-warn-red/5" : d.triage_status === "yellow" ? "border-2 border-warn-amber bg-warn-amber/5" : "border border-sage-100 bg-sage-50";
        return /* @__PURE__ */ jsxRuntimeExports.jsxs("li", { className: `rounded-xl ${wrap}`, children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { type: "button", onClick: () => setExpandedScan(isOpen ? null : d.id), className: "flex w-full items-center justify-between gap-2 p-3 text-left", "aria-expanded": isOpen, children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex min-w-0 flex-1 items-center gap-2", children: [
              needsAttention && /* @__PURE__ */ jsxRuntimeExports.jsx(TriangleAlert, { className: `size-4 shrink-0 ${d.triage_status === "red" ? "text-warn-red" : "text-warn-amber"}` }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "min-w-0", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${triageColor(d.triage_status)}`, children: d.triage_status }),
                  needsAttention && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `text-[11px] font-bold uppercase tracking-wide ${d.triage_status === "red" ? "text-warn-red" : "text-warn-amber"}`, children: "Needs attention" })
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 text-[11px] text-sage-600", children: new Date(d.created_at).toLocaleString(void 0, {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit"
                }) })
              ] })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(ChevronDown, { className: `size-4 shrink-0 text-sage-500 transition ${isOpen ? "rotate-180" : ""}` })
          ] }),
          isOpen && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-3 border-t border-sage-100 px-3 py-3", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[10px] font-bold uppercase tracking-widest text-sage-600", children: "Per-question answers" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("ul", { className: "mt-2 space-y-1.5", children: SCAN_COLS.map((f) => /* @__PURE__ */ jsxRuntimeExports.jsxs("li", { className: "flex items-center justify-between gap-3 text-xs", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sage-800", children: f.label }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${answerStyle(d[f.col])}`, children: answerLabel(d[f.col]) })
              ] }, f.col)) })
            ] }),
            d.triage_reasons && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[10px] font-bold uppercase tracking-widest text-sage-600", children: "Flagged" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 whitespace-pre-line text-xs text-sage-800", children: d.triage_reasons })
            ] }),
            d.notes && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[10px] font-bold uppercase tracking-widest text-sage-600", children: "Sitter notes" }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "mt-1 text-xs italic text-sage-700", children: [
                '"',
                d.notes,
                '"'
              ] })
            ] }),
            linkedPhotos.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[10px] font-bold uppercase tracking-widest text-sage-600", children: "Photos" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-2 grid grid-cols-3 gap-2", children: linkedPhotos.map((p) => /* @__PURE__ */ jsxRuntimeExports.jsx("a", { href: p.photo_url, target: "_blank", rel: "noreferrer", className: "block aspect-square overflow-hidden rounded-lg bg-sage-100", children: /* @__PURE__ */ jsxRuntimeExports.jsx("img", { src: p.photo_url, alt: p.photo_type, className: "size-full object-cover" }) }, p.id)) })
            ] })
          ] })
        ] }, d.id);
      }) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "rounded-2xl bg-white p-4 ring-1 ring-sage-100", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-sm font-bold", children: "Photos from sitters" }),
      photos.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-2 text-sm text-sage-600", children: "No photos logged yet." }) : /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-3 grid grid-cols-3 gap-2", children: photos.map((p) => /* @__PURE__ */ jsxRuntimeExports.jsx("a", { href: p.photo_url, target: "_blank", rel: "noreferrer", className: "block aspect-square overflow-hidden rounded-lg bg-sage-100", children: /* @__PURE__ */ jsxRuntimeExports.jsx("img", { src: p.photo_url, alt: p.photo_type, className: "size-full object-cover" }) }, p.id)) })
    ] })
  ] });
}
export {
  BirdEditor as component
};

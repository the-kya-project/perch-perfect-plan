import { r as reactExports, j as jsxRuntimeExports } from "../_libs/react.mjs";
import { e as useNavigate } from "../_libs/tanstack__react-router.mjs";
import { supabase } from "./client-HgPYj8QJ.mjs";
import { t as toast } from "../_libs/sonner.mjs";
import { P as PhotoCropper, B as BirdField, S as SpeciesPicker, A as AgePicker } from "./BirdPickers-CgSvo35-.mjs";
import { S as SetupShell } from "./router-Cu2Tdjxf.mjs";
import "../_libs/seroval.mjs";
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
import "../_libs/supabase__supabase-js.mjs";
import "../_libs/supabase__postgrest-js.mjs";
import "../_libs/supabase__realtime-js.mjs";
import "../_libs/supabase__phoenix.mjs";
import "../_libs/supabase__storage-js.mjs";
import "../_libs/iceberg-js.mjs";
import "../_libs/supabase__auth-js.mjs";
import "tslib";
import "../_libs/supabase__functions-js.mjs";
import "../_libs/tanstack__query-core.mjs";
import "../_libs/tanstack__react-query.mjs";
import "./server-9nIpN7MJ.mjs";
import "node:async_hooks";
import "../_libs/h3-v2.mjs";
import "../_libs/rou3.mjs";
import "../_libs/srvx.mjs";
import "../_libs/lucide-react.mjs";
import "../_libs/zod.mjs";
function NewBird() {
  const navigate = useNavigate();
  const [name, setName] = reactExports.useState("");
  const [species, setSpecies] = reactExports.useState("");
  const [age, setAge] = reactExports.useState("");
  const [birthDate, setBirthDate] = reactExports.useState("");
  const [sex, setSex] = reactExports.useState("");
  const [flight, setFlight] = reactExports.useState("unknown");
  const [photo, setPhoto] = reactExports.useState(null);
  const [photoPos, setPhotoPos] = reactExports.useState("50% 50%");
  const [saving, setSaving] = reactExports.useState(false);
  function onPhoto(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2e6) {
      toast.error("Photo must be under 2MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setPhoto(reader.result);
    reader.readAsDataURL(file);
  }
  async function createBird(targetStep) {
    if (!name.trim()) {
      toast.error("Give your bird a name.");
      return null;
    }
    if (!species.trim()) {
      toast.error("Choose a species.");
      return null;
    }
    setSaving(true);
    const {
      data: u
    } = await supabase.auth.getUser();
    if (!u.user) {
      setSaving(false);
      return null;
    }
    const {
      data: bird,
      error
    } = await supabase.from("birds").insert({
      owner_id: u.user.id,
      name,
      species: species || null,
      age: age || null,
      birth_date: birthDate || null,
      sex: sex || null,
      flight_status: flight,
      photo_url: photo,
      photo_position: photo ? photoPos : null,
      setup_complete: false,
      setup_step: targetStep
    }).select().single();
    if (error || !bird) {
      toast.error(error?.message ?? "Could not create bird.");
      setSaving(false);
      return null;
    }
    await supabase.from("care_plans").insert({
      bird_id: bird.id
    });
    await supabase.from("emergency_contacts").insert({
      bird_id: bird.id
    });
    setSaving(false);
    return bird.id;
  }
  async function onNext() {
    const id = await createBird(2);
    if (id) navigate({
      to: "/birds/$birdId/setup",
      params: {
        birdId: id
      }
    });
  }
  async function onSaveAndExit() {
    const id = await createBird(1);
    if (id) {
      toast.success(`${name} saved. Finish setup any time.`);
      navigate({
        to: "/dashboard"
      });
    }
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(SetupShell, { step: 1, title: "The basics", subtitle: "Start with your bird's name and the details a sitter needs at a glance.", backDisabled: true, saving, onNext, onSaveAndExit, nextDisabled: !name.trim() || !species.trim(), children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "rounded-2xl bg-white p-4 space-y-3 ring-1 ring-sage-100", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-start gap-3", children: [
        photo ? /* @__PURE__ */ jsxRuntimeExports.jsx(PhotoCropper, { src: photo, position: photoPos, onChange: setPhotoPos, size: 120 }) : /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex size-[120px] items-center justify-center rounded-xl bg-sage-100 text-[10px] uppercase tracking-wider text-sage-600", children: "No photo" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 space-y-2 pt-1", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "inline-block cursor-pointer rounded-lg bg-sage-100 px-3 py-1.5 text-xs font-semibold text-sage-700", children: [
            photo ? "Change photo" : "Add photo",
            /* @__PURE__ */ jsxRuntimeExports.jsx("input", { type: "file", accept: "image/*", className: "hidden", onChange: onPhoto })
          ] }),
          photo && /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", onClick: () => {
            setPhoto(null);
            setPhotoPos("50% 50%");
          }, className: "ml-2 text-xs font-semibold text-warn-red underline", children: "Remove" })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(BirdField, { label: "Name", children: /* @__PURE__ */ jsxRuntimeExports.jsx("input", { className: "input", value: name, onChange: (e) => setName(e.target.value) }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(SpeciesPicker, { value: species, onChange: setSpecies }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(AgePicker, { age, birthDate, onChange: (next) => {
        setAge(next.age);
        setBirthDate(next.birthDate ?? "");
      } }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-2 gap-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(BirdField, { label: "Sex", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("select", { className: "input", value: sex, onChange: (e) => setSex(e.target.value), children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "", children: "Unknown" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("option", { children: "Male" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("option", { children: "Female" })
        ] }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(BirdField, { label: "Flight", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("select", { className: "input", value: flight, onChange: (e) => setFlight(e.target.value), children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "unknown", children: "Unknown" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "fully_flighted", children: "Fully flighted" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "clipped", children: "Clipped" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "partially_clipped", children: "Partially clipped" })
        ] }) })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("style", { children: `.input{width:100%;border-radius:.75rem;background:white;border:1px solid var(--sage-200);padding:.65rem .8rem;font-size:16px;outline:none}.input:focus{border-color:var(--sage-600);box-shadow:0 0 0 3px rgb(74 103 65 / .15)}` })
  ] });
}
export {
  NewBird as component
};

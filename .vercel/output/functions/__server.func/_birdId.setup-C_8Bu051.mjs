import { r as reactExports, j as jsxRuntimeExports } from "./_libs/react.mjs";
import { e as useNavigate, L as Link } from "./_libs/tanstack__react-router.mjs";
import { b as useQuery, a as useQueryClient } from "./_libs/tanstack__react-query.mjs";
import { supabase } from "./_ssr/client-HgPYj8QJ.mjs";
import { t as toast } from "./_libs/sonner.mjs";
import { o as Route, t as track, T as TOTAL_STEPS, S as SetupShell, p as SETUP_STEPS } from "./_ssr/router-Cu2Tdjxf.mjs";
import { E as EMERGENCY_FIELDS, m as mergeEmergency, R as REQUIRED_FIELDS, a as EMERGENCY_LABELS } from "./_ssr/emergency-WC6wgYb2.mjs";
import { P as PhotoCropper, B as BirdField, S as SpeciesPicker, A as AgePicker } from "./_ssr/BirdPickers-CgSvo35-.mjs";
import { f as formatAmountUnit } from "./_ssr/labels-p1Eyqujr.mjs";
import "./_libs/seroval.mjs";
import { P as Plus, X, z as Video, G as Upload, T as TriangleAlert, R as RotateCcw, J as Square, C as Check } from "./_libs/lucide-react.mjs";
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
import "./_ssr/server-9nIpN7MJ.mjs";
import "node:async_hooks";
import "./_libs/h3-v2.mjs";
import "./_libs/rou3.mjs";
import "./_libs/srvx.mjs";
import "./_libs/zod.mjs";
const MAX_SECONDS = 180;
const MAX_BYTES = 150 * 1024 * 1024;
const CANDIDATES = [
  { mime: "video/mp4;codecs=h264,aac", ext: "mp4", contentType: "video/mp4" },
  { mime: "video/mp4;codecs=avc1,mp4a", ext: "mp4", contentType: "video/mp4" },
  { mime: "video/mp4", ext: "mp4", contentType: "video/mp4" },
  { mime: "video/webm;codecs=vp9,opus", ext: "webm", contentType: "video/webm" },
  { mime: "video/webm;codecs=vp8,opus", ext: "webm", contentType: "video/webm" },
  { mime: "video/webm", ext: "webm", contentType: "video/webm" }
];
function pickCandidate() {
  if (typeof MediaRecorder === "undefined") return null;
  for (const c of CANDIDATES) {
    try {
      if (MediaRecorder.isTypeSupported(c.mime)) return c;
    } catch {
    }
  }
  return null;
}
function fmt(s) {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}
function readDuration(file) {
  return new Promise((resolve) => {
    try {
      const url = URL.createObjectURL(file);
      const v = document.createElement("video");
      v.preload = "metadata";
      v.onloadedmetadata = () => {
        URL.revokeObjectURL(url);
        resolve(Number.isFinite(v.duration) ? v.duration : null);
      };
      v.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(null);
      };
      v.src = url;
    } catch {
      resolve(null);
    }
  });
}
function ClipRecorder({
  baseName,
  disabled,
  onRecorded
}) {
  const videoRef = reactExports.useRef(null);
  const streamRef = reactExports.useRef(null);
  const recorderRef = reactExports.useRef(null);
  const chunksRef = reactExports.useRef([]);
  const candidateRef = reactExports.useRef(null);
  const tickRef = reactExports.useRef(null);
  const fileInputRef = reactExports.useRef(null);
  const [phase, setPhase] = reactExports.useState("idle");
  const [elapsed, setElapsed] = reactExports.useState(0);
  const [error, setError] = reactExports.useState(null);
  const [checking, setChecking] = reactExports.useState(false);
  reactExports.useEffect(() => {
    return () => stopAll();
  }, []);
  function stopAll() {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    try {
      recorderRef.current?.state !== "inactive" && recorderRef.current?.stop();
    } catch {
    }
    recorderRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }
  async function start() {
    setError(null);
    const cand = pickCandidate();
    if (!cand) {
      setError("Your browser can't record video here. Try Safari (iOS) or Chrome.");
      return;
    }
    candidateRef.current = cand;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: { ideal: "environment" }
        },
        audio: true
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.muted = true;
        await videoRef.current.play().catch(() => {
        });
      }
      setPhase("ready");
    } catch (e) {
      setError(e?.message ?? "Couldn't access the camera. Check your browser permissions.");
      setPhase("idle");
    }
  }
  function beginRecording() {
    const stream = streamRef.current;
    const cand = candidateRef.current;
    if (!stream || !cand) return;
    chunksRef.current = [];
    let rec;
    try {
      rec = new MediaRecorder(stream, { mimeType: cand.mime });
    } catch {
      try {
        rec = new MediaRecorder(stream);
      } catch (e) {
        setError(e?.message ?? "Couldn't start the recorder.");
        return;
      }
    }
    recorderRef.current = rec;
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size) chunksRef.current.push(e.data);
    };
    rec.onerror = () => setError("Recording failed. Please try again.");
    rec.onstop = () => finalize();
    rec.start(1e3);
    setElapsed(0);
    setPhase("recording");
    const startedAt = Date.now();
    tickRef.current = setInterval(() => {
      const s = Math.floor((Date.now() - startedAt) / 1e3);
      setElapsed(s);
      if (s >= MAX_SECONDS) stop();
    }, 250);
  }
  function stop() {
    if (phase !== "recording") return;
    setPhase("stopping");
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    try {
      recorderRef.current?.stop();
    } catch {
    }
  }
  async function finalize() {
    const cand = candidateRef.current;
    const blob = new Blob(chunksRef.current, { type: cand.contentType });
    chunksRef.current = [];
    stopAll();
    setPhase("idle");
    if (!blob.size) {
      setError("No video captured. Please try again.");
      return;
    }
    if (blob.size > MAX_BYTES) {
      setError("Clip is too large. Try a shorter recording.");
      return;
    }
    const file = new File([blob], `${baseName}.${cand.ext}`, { type: cand.contentType });
    await onRecorded(file);
  }
  function cancel() {
    chunksRef.current = [];
    stopAll();
    setPhase("idle");
    setElapsed(0);
  }
  async function onPick(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    if (!file.type.startsWith("video/")) {
      setError("Please choose a video file.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(`That video is too large (max ${Math.round(MAX_BYTES / (1024 * 1024))}MB). Try a shorter clip.`);
      return;
    }
    setChecking(true);
    const duration = await readDuration(file);
    setChecking(false);
    if (duration != null && duration > MAX_SECONDS + 1) {
      setError(`That video is ${fmt(Math.round(duration))} long. Please trim it to ${Math.floor(MAX_SECONDS / 60)} minutes or less first.`);
      return;
    }
    await onRecorded(file);
  }
  if (phase === "idle") {
    return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "button",
        {
          type: "button",
          disabled: disabled || checking,
          onClick: start,
          className: "flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-sage-200 bg-sage-50 p-4 text-sm font-semibold text-sage-700 disabled:opacity-50",
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Video, { className: "size-4" }),
            " Record a clip (up to ",
            Math.floor(MAX_SECONDS / 60),
            " min)"
          ]
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3 text-[11px] uppercase tracking-widest text-sage-500", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "h-px flex-1 bg-sage-200" }),
        "or",
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "h-px flex-1 bg-sage-200" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "label",
        {
          className: `flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-sage-200 bg-sage-50 p-4 text-sm font-semibold text-sage-700 ${disabled || checking ? "pointer-events-none opacity-50" : ""}`,
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Upload, { className: "size-4" }),
            checking ? "Checking video…" : "Upload a video",
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "input",
              {
                ref: fileInputRef,
                type: "file",
                accept: "video/*",
                className: "hidden",
                disabled: disabled || checking,
                onChange: onPick
              }
            )
          ]
        }
      ),
      error && /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "flex items-start gap-1.5 text-xs text-warn-red", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(TriangleAlert, { className: "size-3.5 shrink-0" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: error })
      ] })
    ] });
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "relative overflow-hidden rounded-xl bg-black ring-1 ring-sage-200", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("video", { ref: videoRef, playsInline: true, muted: true, className: "aspect-video w-full object-contain" }),
      phase === "recording" && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "absolute left-2 top-2 flex items-center gap-1.5 rounded-full bg-warn-red/90 px-2 py-0.5 text-[11px] font-bold text-white", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "size-1.5 animate-pulse rounded-full bg-white" }),
        "REC ",
        fmt(elapsed),
        " / ",
        fmt(MAX_SECONDS)
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex gap-2", children: [
      phase === "ready" && /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            type: "button",
            onClick: beginRecording,
            className: "flex-1 rounded-xl bg-warn-red py-2 text-sm font-semibold text-white",
            children: /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "inline-flex items-center justify-center gap-1.5", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Video, { className: "size-4" }),
              " Start recording"
            ] })
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            type: "button",
            onClick: cancel,
            className: "rounded-xl border border-sage-200 bg-white px-3 py-2 text-sm font-semibold text-sage-700",
            children: /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "inline-flex items-center gap-1.5", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(RotateCcw, { className: "size-4" }),
              " Cancel"
            ] })
          }
        )
      ] }),
      phase === "recording" && /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          type: "button",
          onClick: stop,
          className: "flex-1 rounded-xl bg-sage-900 py-2 text-sm font-semibold text-white",
          children: /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "inline-flex items-center justify-center gap-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Square, { className: "size-4" }),
            " Stop & save"
          ] })
        }
      ),
      phase === "stopping" && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1 rounded-xl bg-sage-100 py-2 text-center text-sm font-semibold text-sage-700", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "inline-flex items-center gap-1.5", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Check, { className: "size-4" }),
        " Finalizing\\u2026"
      ] }) })
    ] }),
    error && /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "flex items-start gap-1.5 text-xs text-warn-red", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(TriangleAlert, { className: "size-3.5 shrink-0" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: error })
    ] })
  ] });
}
function pronoun(sex) {
  const s = (sex ?? "").trim().toLowerCase();
  if (s.startsWith("f")) return { subj: "she", Subj: "She", obj: "her", poss: "her", pl: false };
  if (s.startsWith("m")) return { subj: "he", Subj: "He", obj: "him", poss: "his", pl: false };
  return { subj: "they", Subj: "They", obj: "them", poss: "their", pl: true };
}
const isC = (p) => p.pl ? "'re" : "'s";
const s3 = (p) => p.pl ? "" : "s";
const NUMBER_WORDS = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
  "twenty"
];
function spelledAge(age) {
  const n = parseInt((age ?? "").trim(), 10);
  if (!Number.isFinite(n) || n < 1) return null;
  return n <= 20 ? NUMBER_WORDS[n] : String(n);
}
function cap(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
function pick(birdId, salt, options) {
  let h = 2166136261;
  const key = birdId + "|" + salt;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return options[(h >>> 0) % options.length];
}
function splitLikes(likes) {
  return (likes ?? "").split(/,|\band\b/gi).map((x) => x.trim()).filter(Boolean);
}
function joinOxford(items) {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}
const OWNER_ONLY = /\bowner[- ]only\b|\btalk only\b|\bonly (me|the owner|her owner|his owner|their owner)\b|\bdon'?t (try to )?(pick|handle)\b|\bno handling\b|\bhands?[- ]off\b/i;
function assembleSitterIntro(bird, plan) {
  const p = pronoun(bird.sex);
  const name = (bird.name ?? "").trim() || "your bird";
  const species = (bird.species ?? "").trim() || "parrot";
  const age = spelledAge(bird.age);
  const opening = age ? pick(bird.id, "opening", [
    `Meet ${name}, a ${age}-year-old ${species}.`,
    `This is ${name}, your ${age}-year-old ${species} for the week.`,
    `Say hello to ${name}, a ${age}-year-old ${species}.`
  ]) : pick(bird.id, "opening-noage", [
    `Meet ${name}, a ${species}.`,
    `This is ${name}, your ${species} for the week.`,
    `Say hello to ${name}, a ${species}.`
  ]);
  const handlingText = `${plan.handlers ?? ""} ${plan.step_up_notes ?? ""}`;
  const stepUp = (plan.step_up ?? "").trim().toLowerCase();
  let handling = "";
  if (OWNER_ONLY.test(handlingText)) {
    handling = pick(bird.id, "handling", [
      `${p.Subj}'d love your company, but let ${p.obj} come to you — only ${p.poss} owner does the handling.`,
      `Feel free to talk to ${p.obj} and keep ${p.obj} company, but leave the handling to ${p.poss} owner.`,
      `${p.Subj} enjoy${s3(p)} company through the bars — please don't try to pick ${p.obj} up; that's an owner-only job.`
    ]);
  } else if (stepUp === "yes") {
    handling = pick(bird.id, "handling", [
      `${p.Subj}${isC(p)} happy to step up onto a familiar hand.`,
      `${p.Subj}'ll step right up onto your hand once ${p.subj} know${s3(p)} you.`,
      `Offer a steady hand and ${p.subj}${isC(p)} glad to step up.`
    ]);
  } else if (stepUp === "sometimes") {
    handling = pick(bird.id, "handling", [
      `${p.Subj}'ll step up when ${p.subj}${isC(p)} in the mood — no pressure if ${p.subj}${isC(p)} not.`,
      `Some days ${p.subj}'ll step up, some days ${p.subj} won't — let ${p.obj} decide.`,
      `${p.Subj} step${s3(p)} up on ${p.poss} own terms, so follow ${p.poss} lead.`
    ]);
  } else if (stepUp === "no") {
    handling = pick(bird.id, "handling", [
      `${p.Subj}'d rather not step up, so let ${p.obj} stay where ${p.subj}${isC(p)} comfortable.`,
      `Stepping up isn't ${p.poss} thing — keep interactions calm and hands-off.`,
      `${p.Subj} prefer${s3(p)} to stay put; no need to get ${p.obj} to step up.`
    ]);
  }
  const likes = splitLikes(plan.likes);
  let likesSentence = "";
  if (likes.length === 1) {
    const like = likes[0];
    likesSentence = pick(bird.id, "likes", [
      `${p.Subj}${isC(p)} a sucker for ${like}.`,
      `${cap(like)} is the quickest way to win ${p.obj} over.`,
      `${p.Subj} love${s3(p)} ${like}.`
    ]);
  } else if (likes.length >= 2) {
    const joined = joinOxford(likes);
    likesSentence = pick(bird.id, "likes", [
      `${cap(joined)} are the way to ${p.poss} heart.`,
      `${p.Subj} love${s3(p)} ${joined}.`,
      `Win ${p.obj} over with ${joined}.`
    ]);
  }
  return [opening, handling, likesSentence].map((x) => x.trim()).filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}
async function recomputeSitterIntro(birdId) {
  const { supabase: supabase2 } = await import("./_ssr/client-HgPYj8QJ.mjs");
  const [{ data: bird }, { data: plan }] = await Promise.all([
    supabase2.from("birds").select("id, name, sex, species, age").eq("id", birdId).maybeSingle(),
    supabase2.from("care_plans").select("step_up, step_up_notes, handlers, likes").eq("bird_id", birdId).maybeSingle()
  ]);
  if (!bird) return;
  const intro = assembleSitterIntro(bird, plan ?? {});
  await supabase2.from("birds").update({ sitter_intro: intro }).eq("id", birdId);
}
const SetupDirtyContext = reactExports.createContext(() => {
});
function useDebouncedAutosave(save, deps, enabled, registerFlush, delay = 500) {
  const saveRef = reactExports.useRef(save);
  saveRef.current = save;
  const timerRef = reactExports.useRef(null);
  const setDirty = reactExports.useContext(SetupDirtyContext);
  const setDirtyRef = reactExports.useRef(setDirty);
  setDirtyRef.current = setDirty;
  const hydratedOnce = reactExports.useRef(false);
  reactExports.useEffect(() => {
    if (!enabled) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    if (hydratedOnce.current) setDirtyRef.current(true);
    else hydratedOnce.current = true;
    timerRef.current = setTimeout(async () => {
      timerRef.current = null;
      await saveRef.current();
      setDirtyRef.current(false);
    }, delay);
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [enabled, ...deps]);
  reactExports.useEffect(() => {
    if (!registerFlush) return;
    const flush = async () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      await saveRef.current();
      setDirtyRef.current(false);
    };
    registerFlush(flush);
    return () => registerFlush(null);
  }, [registerFlush]);
}
function BirdSetup() {
  const {
    birdId
  } = Route.useParams();
  const {
    step: stepParam
  } = Route.useSearch();
  const navigate = useNavigate();
  const {
    data: bird,
    isLoading
  } = useQuery({
    queryKey: ["bird-setup", birdId],
    queryFn: async () => {
      const {
        data,
        error
      } = await supabase.from("birds").select("*").eq("id", birdId).single();
      if (error) throw error;
      return data;
    }
  });
  const [step, setStep] = reactExports.useState(1);
  const [blockNext, setBlockNext] = reactExports.useState(false);
  const [dirty, setDirty] = reactExports.useState(false);
  reactExports.useEffect(() => {
    setBlockNext(false);
    setDirty(false);
  }, [step]);
  const [saving, setSaving] = reactExports.useState(false);
  reactExports.useEffect(() => {
    track("guided_editor_opened", {
      entry_step: stepParam ?? 1
    });
  }, []);
  const flushRef = reactExports.useRef(null);
  const registerFlush = reactExports.useCallback((fn) => {
    flushRef.current = fn;
  }, []);
  async function flushPending() {
    try {
      await flushRef.current?.();
    } catch {
    }
  }
  reactExports.useEffect(() => {
    if (stepParam != null) setStep(Math.min(TOTAL_STEPS, Math.max(1, stepParam)));
  }, [stepParam]);
  const initializedRef = reactExports.useRef(false);
  reactExports.useEffect(() => {
    if (!bird || initializedRef.current) return;
    initializedRef.current = true;
    if (stepParam != null) return;
    const stored = Number(bird.setup_step ?? 0);
    setStep(!bird.setup_complete && stored > 1 ? Math.min(TOTAL_STEPS, stored) : 1);
  }, [bird, stepParam]);
  async function persistStep(nextStep, complete = false) {
    setSaving(true);
    const {
      error
    } = await supabase.from("birds").update({
      setup_step: nextStep,
      setup_complete: complete
    }).eq("id", birdId);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return false;
    }
    return true;
  }
  async function onNext() {
    await flushPending();
    const completedSection = SETUP_STEPS[step - 1]?.key;
    if (step >= TOTAL_STEPS) {
      const ok2 = await persistStep(TOTAL_STEPS, true);
      if (ok2) {
        track("care_plan_section_completed", {
          section: completedSection,
          step
        });
        track("care_plan_progress", {
          percent_complete: 100,
          sections_complete: TOTAL_STEPS,
          total: TOTAL_STEPS
        });
        toast.success(`${bird?.name ?? "Bird"} setup complete.`);
        navigate({
          to: "/birds/$birdId",
          params: {
            birdId
          }
        });
      }
      return;
    }
    const next = step + 1;
    const ok = await persistStep(next);
    if (ok) {
      track("care_plan_section_completed", {
        section: completedSection,
        step
      });
      track("care_plan_progress", {
        percent_complete: Math.round((next - 1) / TOTAL_STEPS * 100),
        sections_complete: next - 1,
        total: TOTAL_STEPS
      });
      setStep(next);
    }
  }
  async function onBack() {
    if (step <= 1) return;
    await flushPending();
    const prev = step - 1;
    const ok = await persistStep(prev);
    if (ok) setStep(prev);
  }
  async function onSaveAndExit() {
    await flushPending();
    const ok = await persistStep(step);
    if (ok) {
      toast.success("Progress saved.");
      navigate({
        to: "/dashboard"
      });
    }
  }
  async function jumpToStep(target) {
    const clamped = Math.min(TOTAL_STEPS, Math.max(1, target));
    if (clamped === step) return;
    await flushPending();
    const ok = await persistStep(clamped);
    if (ok) setStep(clamped);
  }
  function exitToProfile() {
    navigate({
      to: "/birds/$birdId",
      params: {
        birdId
      }
    });
  }
  async function finishAndGo(opts) {
    await flushPending();
    const ok = await persistStep(TOTAL_STEPS, true);
    if (!ok) return;
    if (opts.to === "dashboard-newsit") {
      navigate({
        to: "/dashboard",
        search: {
          newSit: true,
          preselectBirdId: birdId
        }
      });
    } else {
      navigate({
        to: "/birds/$birdId",
        params: {
          birdId
        }
      });
    }
  }
  if (isLoading || !bird) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx(SetupShell, { step, title: "Loading…", children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "h-32 animate-pulse rounded-2xl bg-sage-100" }) });
  }
  const meta = SETUP_STEPS[step - 1];
  const isLast = step === TOTAL_STEPS;
  return /* @__PURE__ */ jsxRuntimeExports.jsx(SetupShell, { step, title: meta.title, birdName: bird.name, birdSpecies: bird.species, saving, isDirty: dirty, onExit: exitToProfile, onNavigateStep: jumpToStep, onBack, onNext, onSaveAndExit, nextLabel: isLast ? "Finish setup" : "Next", backDisabled: step <= 1, nextDisabled: blockNext, hideFooter: step === TOTAL_STEPS, children: /* @__PURE__ */ jsxRuntimeExports.jsx(SetupDirtyContext.Provider, { value: setDirty, children: /* @__PURE__ */ jsxRuntimeExports.jsx(StepBody, { step, birdId, birdName: bird.name, onBlockNext: setBlockNext, onJumpToStep: jumpToStep, onFinish: finishAndGo, registerFlush }) }) });
}
function StepBody({
  step,
  birdId,
  birdName,
  onBlockNext,
  onJumpToStep,
  onFinish,
  registerFlush
}) {
  if (step === 1) return /* @__PURE__ */ jsxRuntimeExports.jsx(BasicsStep, { birdId, onBlockNext, registerFlush });
  if (step === 2) return /* @__PURE__ */ jsxRuntimeExports.jsx(DayInLifeStep, { birdId });
  if (step === 3) return /* @__PURE__ */ jsxRuntimeExports.jsx(FoodWaterStep, { birdId, birdName, onBlockNext, registerFlush });
  if (step === 4) return /* @__PURE__ */ jsxRuntimeExports.jsx(PersonalityStep, { birdId, birdName, registerFlush });
  if (step === 5) return /* @__PURE__ */ jsxRuntimeExports.jsx(EnvironmentStep, { birdId, registerFlush });
  if (step === 6) return /* @__PURE__ */ jsxRuntimeExports.jsx(HealthBaselineStep, { birdId, birdName, registerFlush });
  if (step === 7) return /* @__PURE__ */ jsxRuntimeExports.jsx(WatchFirstClipsStep, { birdId });
  if (step === 8) return /* @__PURE__ */ jsxRuntimeExports.jsx(EmergencyStep, { birdId, onBlockNext, registerFlush });
  if (step === 9) return /* @__PURE__ */ jsxRuntimeExports.jsx(ReviewStep, { birdId, birdName, onJumpToStep, onFinish });
  const blurbs = {
    8: {
      lead: "Emergency info — vets, contacts, and home info for sitters.",
      hint: "Most of this is inherited from your account defaults. The full form lives on the Emergency tab."
    }
  };
  const b = blurbs[step] ?? {
    lead: "",
    hint: ""
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-3", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-2xl bg-white p-4 ring-1 ring-sage-100", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm font-semibold", children: b.lead }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-2 text-sm text-sage-600", children: b.hint })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(Link, { to: "/birds/$birdId", params: {
      birdId
    }, className: "block rounded-xl border border-sage-200 bg-white p-3 text-center text-sm font-semibold text-sage-700", children: "Open the full editor for this step" })
  ] });
}
const TIME_BLOCKS = [{
  key: "morning",
  label: "Morning"
}, {
  key: "midday",
  label: "Midday"
}, {
  key: "evening",
  label: "Evening"
}, {
  key: "bedtime",
  label: "Bedtime"
}, {
  key: "custom",
  label: "Custom"
}];
const COMMON_TASKS = ["Uncover cage", "Fresh food", "Fresh water", "Out-of-cage time", "Misting or bath", "Training or play", "Medication", "Cover for night"];
function BasicsStep({
  birdId,
  onBlockNext,
  registerFlush
}) {
  const qc = useQueryClient();
  const {
    data: bird,
    isLoading
  } = useQuery({
    queryKey: ["bird-basics", birdId],
    queryFn: async () => {
      const {
        data,
        error
      } = await supabase.from("birds").select("*").eq("id", birdId).single();
      if (error) throw error;
      return data;
    }
  });
  const [form, setForm] = reactExports.useState(null);
  const [hydrated, setHydrated] = reactExports.useState(false);
  reactExports.useEffect(() => {
    if (!bird || hydrated) return;
    setForm(bird);
    setHydrated(true);
  }, [bird, hydrated]);
  reactExports.useEffect(() => {
    onBlockNext(!form?.name?.trim() || !form?.species?.trim());
  }, [form?.name, form?.species, onBlockNext]);
  useDebouncedAutosave(async () => {
    if (!form) return;
    const {
      id,
      owner_id,
      created_at,
      updated_at,
      ...patch
    } = form;
    await supabase.from("birds").update(patch).eq("id", birdId);
    qc.invalidateQueries({
      queryKey: ["bird", birdId]
    });
    qc.invalidateQueries({
      queryKey: ["bird-setup", birdId]
    });
    void recomputeSitterIntro(birdId);
  }, [form, birdId, qc], !!form && hydrated, registerFlush);
  if (isLoading || !form) return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "h-32 animate-pulse rounded-2xl bg-sage-100" });
  function onPhoto(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2e6) {
      toast.error("Photo must be under 2MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setForm({
      ...form,
      photo_url: reader.result
    });
    reader.readAsDataURL(file);
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "rounded-2xl bg-white p-4 space-y-3 ring-1 ring-sage-100", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-start gap-3", children: [
        form.photo_url ? /* @__PURE__ */ jsxRuntimeExports.jsx(PhotoCropper, { src: form.photo_url, position: form.photo_position, onChange: (pos) => setForm({
          ...form,
          photo_position: pos
        }), size: 120 }) : /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex size-[120px] items-center justify-center rounded-xl bg-sage-100 text-[10px] uppercase tracking-wider text-sage-600", children: "No photo" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 space-y-2 pt-1", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "inline-block cursor-pointer rounded-lg bg-sage-100 px-3 py-1.5 text-xs font-semibold text-sage-700", children: [
            form.photo_url ? "Change photo" : "Add photo",
            /* @__PURE__ */ jsxRuntimeExports.jsx("input", { type: "file", accept: "image/*", className: "hidden", onChange: onPhoto })
          ] }),
          form.photo_url && /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", onClick: () => setForm({
            ...form,
            photo_url: null,
            photo_position: null
          }), className: "ml-2 text-xs font-semibold text-warn-red underline", children: "Remove" })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(BirdField, { label: "Name", children: /* @__PURE__ */ jsxRuntimeExports.jsx("input", { className: "input", value: form.name ?? "", onChange: (e) => setForm({
        ...form,
        name: e.target.value
      }) }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(SpeciesPicker, { value: form.species ?? "", onChange: (v) => setForm({
        ...form,
        species: v
      }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(AgePicker, { age: form.age ?? "", birthDate: form.birth_date ?? "", onChange: (next) => setForm({
        ...form,
        age: next.age,
        birth_date: next.birthDate
      }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-2 gap-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(BirdField, { label: "Sex", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("select", { className: "input", value: form.sex ?? "", onChange: (e) => setForm({
          ...form,
          sex: e.target.value || null
        }), children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "", children: "Unknown" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("option", { children: "Male" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("option", { children: "Female" })
        ] }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(BirdField, { label: "Flight", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("select", { className: "input", value: form.flight_status ?? "unknown", onChange: (e) => setForm({
          ...form,
          flight_status: e.target.value
        }), children: [
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
function DayInLifeStep({
  birdId
}) {
  const qc = useQueryClient();
  const {
    data: plan
  } = useQuery({
    queryKey: ["plan", birdId],
    queryFn: async () => {
      const {
        data
      } = await supabase.from("care_plans").select("id").eq("bird_id", birdId).maybeSingle();
      return data;
    }
  });
  const {
    data: tasks = [],
    isLoading
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
  const grouped = reactExports.useMemo(() => {
    const g = {};
    for (const t of tasks) (g[t.category] ??= []).push(t);
    return g;
  }, [tasks]);
  function refresh() {
    if (plan?.id) qc.invalidateQueries({
      queryKey: ["tasks", plan.id]
    });
  }
  if (isLoading || !plan) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "h-32 animate-pulse rounded-2xl bg-sage-100" });
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-2xl bg-white p-4 ring-1 ring-sage-100", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm font-semibold", children: "Walk through a normal day." }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 text-sm text-sage-600", children: "What happens, and when? Tap chips to add the usual tasks to each block — they'll appear in the Routine tab." })
    ] }),
    TIME_BLOCKS.map((block) => /* @__PURE__ */ jsxRuntimeExports.jsx(TimeBlockSection, { block, planId: plan.id, tasks: grouped[block.key] ?? [], onChange: refresh }, block.key))
  ] });
}
function TimeBlockSection({
  block,
  planId,
  tasks,
  onChange
}) {
  const [custom, setCustom] = reactExports.useState("");
  const [busy, setBusy] = reactExports.useState(false);
  const present = new Map(tasks.map((t) => [t.title.trim().toLowerCase(), t]));
  async function add(title) {
    if (busy) return;
    setBusy(true);
    await supabase.from("routine_tasks").insert({
      care_plan_id: planId,
      title,
      category: block.key,
      sort_order: tasks.length
    });
    setBusy(false);
    onChange();
  }
  async function remove(id) {
    if (busy) return;
    setBusy(true);
    await supabase.from("routine_tasks").delete().eq("id", id);
    setBusy(false);
    onChange();
  }
  async function toggle(title) {
    const existing = present.get(title.trim().toLowerCase());
    if (existing) await remove(existing.id);
    else await add(title);
  }
  async function addCustom() {
    const t = custom.trim();
    if (!t) return;
    await add(t);
    setCustom("");
  }
  async function saveNote(id, value) {
    await supabase.from("routine_tasks").update({
      instructions: value || null
    }).eq("id", id);
    onChange();
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "rounded-2xl bg-white p-4 ring-1 ring-sage-100", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-[11px] font-bold uppercase tracking-widest text-sage-600", children: block.label }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-3 flex flex-wrap gap-2", children: COMMON_TASKS.map((t) => {
      const isOn = present.has(t.trim().toLowerCase());
      return /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { type: "button", onClick: () => toggle(t), disabled: busy, className: "rounded-full border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 " + (isOn ? "border-sage-600 bg-sage-600 text-white" : "border-sage-200 bg-white text-sage-700 hover:bg-sage-50"), children: [
        isOn ? "✓ " : "+ ",
        t
      ] }, t);
    }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-3 flex gap-2", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("input", { className: "input flex-1", value: custom, onChange: (e) => setCustom(e.target.value), placeholder: "Add your own…", onKeyDown: (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          addCustom();
        }
      } }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", onClick: addCustom, disabled: !custom.trim() || busy, className: "rounded-xl bg-sage-100 px-3 text-sm font-semibold text-sage-700 disabled:opacity-50", "aria-label": "Add custom task", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Plus, { className: "size-4" }) })
    ] }),
    tasks.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("ul", { className: "mt-4 space-y-2", children: tasks.map((t) => /* @__PURE__ */ jsxRuntimeExports.jsxs("li", { className: "rounded-lg bg-sage-50 p-3", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-start gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "flex-1 text-sm font-semibold", children: t.title }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", onClick: () => remove(t.id), className: "rounded p-1 text-sage-600 hover:bg-sage-100", "aria-label": `Remove ${t.title}`, children: /* @__PURE__ */ jsxRuntimeExports.jsx(X, { className: "size-4" }) })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("textarea", { className: "input area mt-2 text-xs", placeholder: "Add a note (optional)", defaultValue: t.instructions ?? "", onBlur: (e) => {
        if ((e.target.value ?? "") !== (t.instructions ?? "")) {
          saveNote(t.id, e.target.value);
        }
      } })
    ] }, t.id)) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("style", { children: `.input{width:100%;border-radius:.75rem;background:white;border:1px solid var(--sage-200);padding:.55rem .7rem;font-size:14px;outline:none}.input:focus{border-color:var(--sage-600);box-shadow:0 0 0 3px rgb(74 103 65 / .15)}.area{min-height:50px;line-height:1.4}` })
  ] });
}
const DIET_OPTIONS = [{
  value: "pelleted",
  label: "Pelleted diet"
}, {
  value: "seed",
  label: "Seed mix"
}, {
  value: "pellet_seed",
  label: "Pellet & seed blend"
}, {
  value: "chop",
  label: "Fresh chop / formulated"
}, {
  value: "other",
  label: "Other"
}];
const UNITS = ["tablespoons", "cups", "grams", "scoops", "pieces"];
const FRESH_FOOD_OPTIONS = ["Pre-made chop", "Leafy greens", "Carrot", "Bell pepper", "Broccoli", "Sweet potato", "Squash", "Apple (no seeds)", "Berries", "Banana", "Cooked grains", "Cooked legumes", "Sprouts", "Quinoa"];
const TREAT_FREQ = [{
  value: "daily",
  label: "Daily"
}, {
  value: "few_per_week",
  label: "A few times a week"
}, {
  value: "training_only",
  label: "Training only"
}, {
  value: "rarely",
  label: "Rarely"
}];
const WATER_FREQ = [{
  value: "once",
  label: "Changed once daily"
}, {
  value: "twice",
  label: "Changed twice daily"
}, {
  value: "more",
  label: "More than twice daily"
}];
const NEVER_DEFAULTS = ["Chocolate", "Avocado", "Caffeine", "Alcohol", "Onion & garlic", "Salt", "Fruit pits & apple seeds"];
const REMOVAL_OPTIONS = [{
  value: 60,
  label: "1 hour"
}, {
  value: 120,
  label: "2 hours"
}, {
  value: 180,
  label: "3 hours"
}];
const FOOD_BOWL_WASH_OPTIONS = [{
  value: "after_each_fresh",
  label: "After every fresh-food serving"
}, {
  value: "once_daily",
  label: "Once a day"
}, {
  value: "every_few_days",
  label: "Every few days"
}];
const WATER_BOWL_WASH_OPTIONS = [{
  value: "once_daily",
  label: "Once a day"
}, {
  value: "twice_daily",
  label: "Twice a day"
}];
const HYG_REMOVE_PREFIX = "Remove fresh food";
const HYG_WASH_FOOD_PREFIX = "Wash food bowls";
const HYG_WASH_WATER_PREFIX = "Wash water bowl";
const FEED_PREFIX = "Feed:";
function FoodWaterStep({
  birdId,
  birdName,
  onBlockNext,
  registerFlush
}) {
  const qc = useQueryClient();
  const {
    data: plan,
    isLoading
  } = useQuery({
    queryKey: ["plan-food", birdId],
    queryFn: async () => {
      const {
        data,
        error
      } = await supabase.from("care_plans").select("*").eq("bird_id", birdId).maybeSingle();
      if (error) throw error;
      return data;
    }
  });
  const [diet, setDiet] = reactExports.useState([]);
  const [dietOther, setDietOther] = reactExports.useState("");
  const [dietDetails, setDietDetails] = reactExports.useState({});
  const [brand, setBrand] = reactExports.useState("");
  const [amountValue, setAmountValue] = reactExports.useState("");
  const [amountUnit, setAmountUnit] = reactExports.useState("");
  const [freshOther, setFreshOther] = reactExports.useState("");
  const [treatsNotes, setTreatsNotes] = reactExports.useState("");
  const [treatsFreq, setTreatsFreq] = reactExports.useState("");
  const [never, setNever] = reactExports.useState([]);
  const [newNever, setNewNever] = reactExports.useState("");
  const [waterFreq, setWaterFreq] = reactExports.useState("");
  const [waterNotes, setWaterNotes] = reactExports.useState("");
  const [storage, setStorage] = reactExports.useState("");
  const [removalMinutes, setRemovalMinutes] = reactExports.useState(120);
  const [foodBowlWash, setFoodBowlWash] = reactExports.useState("after_each_fresh");
  const [waterBowlWash, setWaterBowlWash] = reactExports.useState("once_daily");
  const [hygieneNotes, setHygieneNotes] = reactExports.useState("");
  const [timeDraft, setTimeDraft] = reactExports.useState({});
  const [hydrated, setHydrated] = reactExports.useState(false);
  reactExports.useEffect(() => {
    if (!plan || hydrated) return;
    const dietTypes = plan.diet_types ?? [];
    setDiet(dietTypes);
    setDietOther(plan.diet_other ?? "");
    const seedBrand = plan.food_brand ?? "";
    const seedAmt = plan.amount_value != null ? String(plan.amount_value) : "";
    const seedUnit = plan.amount_unit ?? "";
    setBrand(seedBrand);
    setAmountValue(seedAmt);
    setAmountUnit(seedUnit);
    const dd = {
      ...plan.diet_details ?? {}
    };
    const hasAny = Object.values(dd).some((arr) => Array.isArray(arr) && arr.length);
    if (!hasAny && dietTypes.length && (seedBrand || seedAmt || seedUnit)) {
      dd[dietTypes[0]] = [{
        name: seedBrand,
        amount: seedAmt,
        unit: seedUnit,
        times: []
      }];
    }
    if (dietTypes.includes("chop")) {
      const existing = dd["chop"] ?? [];
      const existingNames = new Set(existing.map((i) => i.name.trim().toLowerCase()));
      const legacyFresh = plan.fresh_foods ?? [];
      const seeded = [...existing];
      for (const f of legacyFresh) {
        if (!existingNames.has(f.trim().toLowerCase())) {
          seeded.push({
            name: f,
            amount: "",
            unit: "",
            times: []
          });
          existingNames.add(f.trim().toLowerCase());
        }
      }
      dd["chop"] = seeded;
    }
    setDietDetails(dd);
    setFreshOther(plan.fresh_foods_other ?? "");
    setTreatsNotes(plan.treats_notes ?? "");
    setTreatsFreq(plan.treats_frequency ?? "");
    const nv = plan.never_feed ?? [];
    setNever(nv.length ? nv : NEVER_DEFAULTS);
    setWaterFreq(plan.water_frequency ?? "");
    setWaterNotes(plan.water_notes ?? "");
    setStorage(plan.food_storage ?? "");
    setRemovalMinutes(plan.fresh_food_removal_minutes ?? 120);
    setFoodBowlWash(plan.food_bowl_wash_cadence ?? "after_each_fresh");
    setWaterBowlWash(plan.water_bowl_wash_cadence ?? "once_daily");
    setHygieneNotes(plan.food_hygiene_notes ?? "");
    setHydrated(true);
  }, [plan, hydrated]);
  const dietRowsValid = reactExports.useMemo(() => {
    for (const t of diet) {
      for (const it of dietDetails[t] ?? []) {
        const a = (it.amount ?? "").trim();
        const u = (it.unit ?? "").trim();
        if (a === "" !== (u === "")) return false;
      }
    }
    return true;
  }, [diet, dietDetails]);
  reactExports.useEffect(() => {
    onBlockNext(!dietRowsValid);
  }, [dietRowsValid, onBlockNext]);
  useDebouncedAutosave(async () => {
    if (!plan) return;
    const dietLabels = diet.map((d) => DIET_OPTIONS.find((o) => o.value === d)?.label).filter(Boolean);
    if (diet.includes("other") && dietOther.trim()) dietLabels.push(dietOther.trim());
    const perTypeLines = [];
    const allFeedingTimes = /* @__PURE__ */ new Set();
    for (const t of diet) {
      const label = DIET_OPTIONS.find((o) => o.value === t)?.label ?? t;
      const items = (dietDetails[t] ?? []).filter((it) => it.name.trim() || it.amount.trim());
      if (!items.length) continue;
      const parts = items.map((it) => {
        const amt = formatAmountUnit(it.amount, it.unit);
        const when = it.freeFed ? "available all day" : (it.times ?? []).length ? `@ ${(it.times ?? []).join(", ")}` : "";
        (it.times ?? []).forEach((tm) => allFeedingTimes.add(tm));
        return [it.name.trim(), amt, when].filter(Boolean).join(" — ");
      }).filter(Boolean);
      if (parts.length) perTypeLines.push(`${label}: ${parts.join("; ")}`);
    }
    const firstItem = diet.flatMap((t) => dietDetails[t] ?? []).find((it) => it.name.trim() || it.amount.trim());
    const legacyBrand = (firstItem?.name?.trim() || brand) ?? "";
    const legacyAmtVal = (firstItem?.amount?.trim() || amountValue) ?? "";
    const legacyAmtUnit = firstItem?.unit || amountUnit;
    const amountStr = formatAmountUnit(legacyAmtVal, legacyAmtUnit);
    const removalLabel = REMOVAL_OPTIONS.find((o) => o.value === removalMinutes)?.label ?? `${removalMinutes} min`;
    const foodWashLabel = FOOD_BOWL_WASH_OPTIONS.find((o) => o.value === foodBowlWash)?.label ?? foodBowlWash;
    const waterWashLabel = WATER_BOWL_WASH_OPTIONS.find((o) => o.value === waterBowlWash)?.label ?? waterBowlWash;
    const chopItems = diet.includes("chop") ? dietDetails["chop"] ?? [] : [];
    const freshList = chopItems.map((it) => it.name.trim()).filter(Boolean);
    const feedingTimesArr = Array.from(allFeedingTimes);
    const foodSummaryParts = [dietLabels.length ? `Diet: ${dietLabels.join(", ")}` : "", ...perTypeLines, perTypeLines.length === 0 && legacyBrand.trim() ? `Brand: ${legacyBrand.trim()}` : "", perTypeLines.length === 0 && amountStr ? `Amount per serving: ${amountStr}` : "", diet.includes("chop") && freshOther.trim() ? `Other fresh foods: ${freshOther.trim()}` : "", storage.trim() ? `Stored: ${storage.trim()}` : "", `Freshness & hygiene:
  • Remove fresh/wet food after ${removalLabel}
  • Wash food bowls: ${foodWashLabel}
  • Wash water bowl/bottle: ${waterWashLabel}${hygieneNotes.trim() ? `
  • Notes: ${hygieneNotes.trim()}` : ""}`].filter(Boolean);
    const treatLabel = TREAT_FREQ.find((f) => f.value === treatsFreq)?.label;
    const treatsSummary = [treatsNotes.trim(), treatLabel ? `Frequency: ${treatLabel}` : ""].filter(Boolean).join(" — ");
    const waterLabel = WATER_FREQ.find((f) => f.value === waterFreq)?.label;
    const waterSummary = [waterLabel ?? "", waterNotes.trim(), `Wash bowl/bottle ${waterWashLabel.toLowerCase()}`].filter(Boolean).join(" — ");
    const detailsToSave = {};
    for (const t of diet) if ((dietDetails[t] ?? []).length) detailsToSave[t] = dietDetails[t];
    const freshRemovalSummary = `Remove fresh / wet food after ${removalLabel}. Fresh food spoils fast and can grow bacteria.`;
    await supabase.from("care_plans").update({
      diet_types: diet,
      diet_other: dietOther || null,
      diet_details: detailsToSave,
      food_brand: legacyBrand || null,
      amount_value: legacyAmtVal ? Number(legacyAmtVal) : null,
      amount_unit: legacyAmtUnit || null,
      feeding_times: feedingTimesArr,
      fresh_foods: freshList,
      fresh_foods_other: diet.includes("chop") ? freshOther || null : null,
      treats_notes: treatsNotes || null,
      treats_frequency: treatsFreq || null,
      never_feed: never,
      water_frequency: waterFreq || null,
      water_notes: waterNotes || null,
      food_storage: storage || null,
      fresh_food_removal_minutes: removalMinutes,
      food_bowl_wash_cadence: foodBowlWash,
      water_bowl_wash_cadence: waterBowlWash,
      food_hygiene_notes: hygieneNotes || null,
      food_instructions: foodSummaryParts.join("\n") || null,
      treats_allowed: treatsSummary || null,
      foods_never_allowed: never.join(", ") || null,
      water_instructions: waterSummary || null,
      fresh_food_removal: freshRemovalSummary
    }).eq("id", plan.id);
    const allItems = diet.flatMap((t) => dietDetails[t] ?? []);
    await syncFeedingTasks(plan.id, allItems);
    const hasFresh = diet.includes("chop") || freshList.length > 0 || freshOther.trim().length > 0;
    await syncHygieneTasks(plan.id, {
      removalLabel,
      foodWashLabel,
      waterWashLabel,
      hasFresh
    });
    qc.invalidateQueries({
      queryKey: ["plan", birdId]
    });
    qc.invalidateQueries({
      queryKey: ["tasks", plan.id]
    });
  }, [diet, dietOther, dietDetails, brand, amountValue, amountUnit, freshOther, treatsNotes, treatsFreq, never, waterFreq, waterNotes, storage, removalMinutes, foodBowlWash, waterBowlWash, hygieneNotes], !!plan && hydrated, registerFlush);
  if (isLoading || !plan) return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "h-32 animate-pulse rounded-2xl bg-sage-100" });
  function toggleArr(arr, v, setter) {
    setter(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  }
  function toggleFreshFood(label) {
    const items = dietDetails["chop"] ?? [];
    const lower = label.trim().toLowerCase();
    const exists = items.some((i) => i.name.trim().toLowerCase() === lower);
    const next = exists ? items.filter((i) => i.name.trim().toLowerCase() !== lower) : [...items, {
      name: label,
      amount: "",
      unit: "",
      times: []
    }];
    setDietDetails({
      ...dietDetails,
      chop: next
    });
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-2xl bg-white p-4 ring-1 ring-sage-100", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-sm font-semibold", children: [
        "What does ",
        birdName,
        " eat, and how much?"
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 text-sm text-sage-600", children: "Structured answers help the sitter know exactly what to serve and when." })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(Card, { title: "Primary diet", hint: "Choose all that apply.", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex flex-wrap gap-2", children: DIET_OPTIONS.map((o) => /* @__PURE__ */ jsxRuntimeExports.jsx(Chip, { on: diet.includes(o.value), onClick: () => toggleArr(diet, o.value, setDiet), children: o.label }, o.value)) }),
      diet.includes("other") && /* @__PURE__ */ jsxRuntimeExports.jsx("input", { className: "input mt-3", placeholder: "Describe the other diet", value: dietOther, maxLength: 200, onChange: (e) => setDietOther(e.target.value) })
    ] }),
    diet.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx(Card, { title: diet.length === 1 ? "Items, amounts & feed time(s)" : "Items & amounts per food type", hint: "For each item, add the amount and when it's served. Use “Available all day” for food left in the cage.", children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "space-y-4", children: diet.map((t) => {
      const label = DIET_OPTIONS.find((o) => o.value === t)?.label ?? t;
      const items = dietDetails[t] ?? [];
      const update = (next) => setDietDetails({
        ...dietDetails,
        [t]: next
      });
      const isChop = t === "chop";
      const selectedFreshNames = new Set(items.map((i) => i.name.trim().toLowerCase()));
      return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-xl bg-sage-50/60 p-3 ring-1 ring-sage-100", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mb-2 flex items-center justify-between", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm font-semibold text-sage-800", children: label }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { type: "button", onClick: () => update([...items, {
            name: "",
            amount: "",
            unit: "",
            times: []
          }]), className: "inline-flex items-center gap-1 rounded-lg bg-sage-100 px-2.5 py-1 text-xs font-semibold text-sage-700 hover:bg-sage-200", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Plus, { className: "size-3.5" }),
            " Add item"
          ] })
        ] }),
        isChop && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mb-3 rounded-lg bg-white p-2 ring-1 ring-sage-100", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mb-1.5 text-xs font-semibold text-sage-600", children: "Fresh foods offered — tap to add as items" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex flex-wrap gap-1.5", children: FRESH_FOOD_OPTIONS.map((f) => /* @__PURE__ */ jsxRuntimeExports.jsx(Chip, { on: selectedFreshNames.has(f.trim().toLowerCase()), onClick: () => toggleFreshFood(f), children: f }, f)) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("input", { className: "input mt-2 text-sm", placeholder: "Other fresh foods (free text)", value: freshOther, maxLength: 300, onChange: (e) => setFreshOther(e.target.value) })
        ] }),
        items.length === 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-sage-500", children: isChop ? "Pick fresh foods above or tap “Add item” to list your own." : "No items yet. Tap “Add item” to list a brand or food." }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "space-y-2", children: items.map((it, idx) => {
          const rowInvalid = it.amount?.trim() === "" !== (it.unit === "");
          const rowKey = `${t}:${idx}`;
          const draft = timeDraft[rowKey] ?? "";
          const setDraft = (v) => setTimeDraft({
            ...timeDraft,
            [rowKey]: v
          });
          const addRowTime = () => {
            const v = draft.trim();
            if (!v) return;
            const cur = it.times ?? [];
            if (cur.includes(v)) {
              setDraft("");
              return;
            }
            const next = items.slice();
            next[idx] = {
              ...it,
              times: [...cur, v],
              freeFed: false
            };
            update(next);
            setDraft("");
          };
          return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-lg bg-white p-2 ring-1 ring-sage-100", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-[1fr,auto] gap-2", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("input", { className: "input", placeholder: isChop ? "e.g. Morning chop mix" : "Brand or item name", value: it.name, maxLength: 120, onChange: (e) => {
                const next = items.slice();
                next[idx] = {
                  ...it,
                  name: e.target.value
                };
                update(next);
              } }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", "aria-label": "Remove item", onClick: () => update(items.filter((_, i) => i !== idx)), className: "rounded-lg p-2 text-sage-500 hover:bg-sage-100", children: /* @__PURE__ */ jsxRuntimeExports.jsx(X, { className: "size-4" }) })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-2 grid grid-cols-[1fr,1.4fr] gap-2", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("input", { className: "input", inputMode: "decimal", placeholder: "Amount (e.g. 2)", value: it.amount, onChange: (e) => {
                const next = items.slice();
                next[idx] = {
                  ...it,
                  amount: e.target.value.replace(/[^0-9.]/g, "")
                };
                update(next);
              } }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("select", { className: "input", value: it.unit, onChange: (e) => {
                const next = items.slice();
                next[idx] = {
                  ...it,
                  unit: e.target.value
                };
                update(next);
              }, children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "", children: "Pick a unit…" }),
                UNITS.map((u) => /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: u, children: u }, u))
              ] })
            ] }),
            rowInvalid && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1.5 text-xs font-semibold text-warn-red", children: "Add both an amount and a unit, or clear both." }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-2 rounded-md bg-sage-50/70 p-2", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "flex items-center gap-2 text-xs font-semibold text-sage-700", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("input", { type: "checkbox", className: "size-4 accent-sage-600", checked: !!it.freeFed, onChange: (e) => {
                  const next = items.slice();
                  next[idx] = {
                    ...it,
                    freeFed: e.target.checked,
                    times: e.target.checked ? [] : it.times ?? []
                  };
                  update(next);
                } }),
                "Available all day / free-fed"
              ] }),
              !it.freeFed && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-2", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mb-1 text-[11px] font-semibold uppercase tracking-wider text-sage-600", children: "Feed time(s)" }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-wrap gap-1.5", children: [
                  (it.times ?? []).map((tm) => /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "inline-flex items-center gap-1 rounded-full bg-sage-100 px-2.5 py-1 text-xs font-semibold text-sage-700", children: [
                    tm,
                    /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", "aria-label": `Remove ${tm}`, onClick: () => {
                      const next = items.slice();
                      next[idx] = {
                        ...it,
                        times: (it.times ?? []).filter((x) => x !== tm)
                      };
                      update(next);
                    }, className: "rounded-full p-0.5 text-sage-600 hover:bg-sage-200", children: /* @__PURE__ */ jsxRuntimeExports.jsx(X, { className: "size-3" }) })
                  ] }, tm)),
                  (it.times ?? []).length === 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[11px] text-sage-400", children: "No times yet." })
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-2 flex gap-2", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("input", { className: "input flex-1 text-sm", placeholder: "e.g. 8:00 AM, Morning, Bedtime", value: draft, maxLength: 40, onChange: (e) => setDraft(e.target.value), onKeyDown: (e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addRowTime();
                    }
                  } }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", onClick: addRowTime, disabled: !draft.trim(), className: "rounded-xl bg-sage-100 px-3 text-sm font-semibold text-sage-700 disabled:opacity-50", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Plus, { className: "size-4" }) })
                ] })
              ] })
            ] })
          ] }, idx);
        }) })
      ] }, t);
    }) }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(Card, { title: "Treats", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("input", { className: "input", placeholder: "What treats are OK? (e.g. millet spray, almond slivers)", value: treatsNotes, maxLength: 300, onChange: (e) => setTreatsNotes(e.target.value) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("select", { className: "input mt-2", value: treatsFreq, onChange: (e) => setTreatsFreq(e.target.value), children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "", children: "Pick a frequency…" }),
        TREAT_FREQ.map((o) => /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: o.value, children: o.label }, o.value))
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(Card, { title: "Never feed", hint: "Common toxic foods are prefilled. Add anything specific to your bird.", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex flex-wrap gap-2", children: never.map((n) => /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "inline-flex items-center gap-1 rounded-full bg-warn-red/10 px-3 py-1.5 text-xs font-semibold text-warn-red", children: [
        n,
        /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", "aria-label": `Remove ${n}`, onClick: () => setNever(never.filter((x) => x !== n)), className: "rounded-full p-0.5 hover:bg-warn-red/20", children: /* @__PURE__ */ jsxRuntimeExports.jsx(X, { className: "size-3" }) })
      ] }, n)) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-3 flex gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("input", { className: "input flex-1", placeholder: "Add another food to never feed", value: newNever, maxLength: 80, onChange: (e) => setNewNever(e.target.value), onKeyDown: (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            addNever();
          }
        } }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", onClick: addNever, disabled: !newNever.trim(), className: "rounded-xl bg-sage-100 px-3 text-sm font-semibold text-sage-700 disabled:opacity-50", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Plus, { className: "size-4" }) })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(Card, { title: "Water", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("select", { className: "input", value: waterFreq, onChange: (e) => setWaterFreq(e.target.value), children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "", children: "Pick a frequency…" }),
        WATER_FREQ.map((o) => /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: o.value, children: o.label }, o.value))
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("textarea", { className: "input area mt-2", placeholder: "Notes (filter, bottle vs bowl, etc.)", value: waterNotes, maxLength: 400, onChange: (e) => setWaterNotes(e.target.value) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(Card, { title: "Where food is stored", children: /* @__PURE__ */ jsxRuntimeExports.jsx("input", { className: "input", placeholder: "e.g. Pantry, top shelf; fridge bin", value: storage, maxLength: 200, onChange: (e) => setStorage(e.target.value) }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(Card, { title: "Freshness & hygiene", hint: "General defaults — adjust to fit your bird and routine.", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "text-xs font-semibold text-sage-700", children: "Remove fresh or wet food after" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("select", { className: "input mt-1", value: String(removalMinutes), onChange: (e) => setRemovalMinutes(Number(e.target.value)), children: REMOVAL_OPTIONS.map((o) => /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: o.value, children: o.label }, o.value)) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 text-[11px] text-sage-600", children: "Fresh food spoils fast and can grow bacteria. This tells your sitter when to take it out." }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "mt-3 block text-xs font-semibold text-sage-700", children: "Wash food bowls" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("select", { className: "input mt-1", value: foodBowlWash, onChange: (e) => setFoodBowlWash(e.target.value), children: FOOD_BOWL_WASH_OPTIONS.map((o) => /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: o.value, children: o.label }, o.value)) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "mt-3 block text-xs font-semibold text-sage-700", children: "Wash water bowl or bottle" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("select", { className: "input mt-1", value: waterBowlWash, onChange: (e) => setWaterBowlWash(e.target.value), children: WATER_BOWL_WASH_OPTIONS.map((o) => /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: o.value, children: o.label }, o.value)) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 text-[11px] text-sage-600", children: "This is washing the bowl itself — separate from how often you change the water." }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "mt-3 block text-xs font-semibold text-sage-700", children: "Other food hygiene notes" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("textarea", { className: "input area mt-1", placeholder: "Optional — anything else the sitter should know about food/water hygiene.", value: hygieneNotes, maxLength: 500, onChange: (e) => setHygieneNotes(e.target.value) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("style", { children: `.input{width:100%;border-radius:.75rem;background:white;border:1px solid var(--sage-200);padding:.65rem .8rem;font-size:16px;outline:none}.input:focus{border-color:var(--sage-600);box-shadow:0 0 0 3px rgb(74 103 65 / .15)}.area{min-height:60px;line-height:1.4}` })
  ] });
  function addNever() {
    const v = newNever.trim();
    if (!v || never.includes(v)) {
      setNewNever("");
      return;
    }
    setNever([...never, v]);
    setNewNever("");
  }
}
function Card({
  title,
  hint,
  children
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "rounded-2xl bg-white p-4 ring-1 ring-sage-100", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-sm font-bold", children: title }),
    hint && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 text-xs text-sage-600", children: hint }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-3", children })
  ] });
}
function Chip({
  on,
  onClick,
  children
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { type: "button", onClick, className: "rounded-full border px-3 py-1.5 text-xs font-semibold transition " + (on ? "border-sage-600 bg-sage-600 text-white" : "border-sage-200 bg-white text-sage-700 hover:bg-sage-50"), children: [
    on ? "✓ " : "+ ",
    children
  ] });
}
const STEP_UP_OPTIONS = [{
  value: "yes",
  label: "Yes"
}, {
  value: "sometimes",
  label: "Sometimes"
}, {
  value: "no",
  label: "No — cage-only is fine"
}];
function PersonalityStep({
  birdId,
  birdName,
  registerFlush
}) {
  const qc = useQueryClient();
  const {
    data: plan,
    isLoading
  } = useQuery({
    queryKey: ["plan-personality", birdId],
    queryFn: async () => {
      const {
        data,
        error
      } = await supabase.from("care_plans").select("*").eq("bird_id", birdId).maybeSingle();
      if (error) throw error;
      return data;
    }
  });
  const [stepUp, setStepUp] = reactExports.useState("");
  const [stepUpNotes, setStepUpNotes] = reactExports.useState("");
  const [handlers, setHandlers] = reactExports.useState("");
  const [likes, setLikes] = reactExports.useState("");
  const [fears, setFears] = reactExports.useState("");
  const [bite, setBite] = reactExports.useState("");
  const [hydrated, setHydrated] = reactExports.useState(false);
  reactExports.useEffect(() => {
    if (!plan || hydrated) return;
    setStepUp(plan.step_up ?? "");
    setStepUpNotes(plan.step_up_notes ?? "");
    setHandlers(plan.handlers ?? "");
    setLikes(plan.likes ?? "");
    setFears(plan.fears_triggers ?? plan.known_triggers ?? "");
    setBite(plan.bite_risk ?? "");
    setHydrated(true);
  }, [plan, hydrated]);
  useDebouncedAutosave(async () => {
    if (!plan) return;
    const stepUpLabel = STEP_UP_OPTIONS.find((o) => o.value === stepUp)?.label;
    const handlingSummary = [stepUpLabel ? `Step up: ${stepUpLabel}` : "", stepUpNotes.trim() ? `Step-up notes: ${stepUpNotes.trim()}` : "", handlers.trim() ? `Who can handle: ${handlers.trim()}` : "", bite.trim() ? `Bite risk: ${bite.trim()}` : ""].filter(Boolean).join("\n");
    await supabase.from("care_plans").update({
      step_up: stepUp || null,
      step_up_notes: stepUpNotes || null,
      handlers: handlers || null,
      likes: likes || null,
      fears_triggers: fears || null,
      bite_risk: bite || null,
      // Mirror to legacy fields visible in the Care plan tab
      handling_rules: handlingSummary || null,
      known_triggers: fears || null
    }).eq("id", plan.id);
    qc.invalidateQueries({
      queryKey: ["plan", birdId]
    });
    void recomputeSitterIntro(birdId);
  }, [stepUp, stepUpNotes, handlers, likes, fears, bite], !!plan && hydrated, registerFlush);
  if (isLoading || !plan) return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "h-32 animate-pulse rounded-2xl bg-sage-100" });
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-2xl bg-white p-4 ring-1 ring-sage-100", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-sm font-semibold", children: [
        "How does ",
        birdName,
        " like to be treated?"
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 text-sm text-sage-600", children: "What should a sitter expect?" })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(Card, { title: "Does the bird step up?", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("select", { className: "input", value: stepUp, onChange: (e) => setStepUp(e.target.value), children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "", children: "Pick one…" }),
        STEP_UP_OPTIONS.map((o) => /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: o.value, children: o.label }, o.value))
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("textarea", { className: "input area mt-2", placeholder: "Notes (only from certain perches? prefers a hand vs. perch?)", value: stepUpNotes, maxLength: 400, onChange: (e) => setStepUpNotes(e.target.value) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(Card, { title: "Who can handle, and how", children: /* @__PURE__ */ jsxRuntimeExports.jsx("textarea", { className: "input area", placeholder: "e.g. Only me and my partner. Sitter: don't try to handle — talk only.", value: handlers, maxLength: 500, onChange: (e) => setHandlers(e.target.value) }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(Card, { title: "Likes", children: /* @__PURE__ */ jsxRuntimeExports.jsx("input", { className: "input", placeholder: "e.g. head scratches, millet, shoulder rides", value: likes, maxLength: 300, onChange: (e) => setLikes(e.target.value) }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(Card, { title: "Fears & triggers", children: /* @__PURE__ */ jsxRuntimeExports.jsx("textarea", { className: "input area", placeholder: "e.g. panics at the vacuum, hates hats", value: fears, maxLength: 500, onChange: (e) => setFears(e.target.value) }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(Card, { title: "Bite risk & warning signs", children: /* @__PURE__ */ jsxRuntimeExports.jsx("textarea", { className: "input area", placeholder: "e.g. low risk, but pinned eyes and tail fan = back off", value: bite, maxLength: 500, onChange: (e) => setBite(e.target.value) }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("style", { children: `.input{width:100%;border-radius:.75rem;background:white;border:1px solid var(--sage-200);padding:.65rem .8rem;font-size:16px;outline:none}.input:focus{border-color:var(--sage-600);box-shadow:0 0 0 3px rgb(74 103 65 / .15)}.area{min-height:60px;line-height:1.4}` })
  ] });
}
const OUT_OF_CAGE_OPTIONS = [{
  value: "supervised",
  label: "Supervised only"
}, {
  value: "specific_room",
  label: "Specific room only"
}, {
  value: "not_while_sitting",
  label: "Not while sitting"
}];
const HAZARD_OPTIONS = ["Other pets", "Ceiling fans", "Open windows", "Young children", "Houseplants", "Kitchen & nonstick cookware", "Candles or diffusers"];
function EnvironmentStep({
  birdId,
  registerFlush
}) {
  const qc = useQueryClient();
  const {
    data: plan,
    isLoading
  } = useQuery({
    queryKey: ["plan-environment", birdId],
    queryFn: async () => {
      const {
        data,
        error
      } = await supabase.from("care_plans").select("*").eq("bird_id", birdId).maybeSingle();
      if (error) throw error;
      return data;
    }
  });
  const [cageLoc, setCageLoc] = reactExports.useState("");
  const [oocMode, setOocMode] = reactExports.useState("");
  const [oocNotes, setOocNotes] = reactExports.useState("");
  const [hazards, setHazards] = reactExports.useState([]);
  const [hazardsOther, setHazardsOther] = reactExports.useState("");
  const [offLimits, setOffLimits] = reactExports.useState("");
  const [hydrated, setHydrated] = reactExports.useState(false);
  reactExports.useEffect(() => {
    if (!plan || hydrated) return;
    setCageLoc(plan.cage_location ?? "");
    setOocMode(plan.out_of_cage_mode ?? "");
    setOocNotes(plan.out_of_cage_notes ?? plan.out_of_cage_rules ?? "");
    setHazards(plan.hazards ?? []);
    setHazardsOther(plan.hazards_other ?? "");
    setOffLimits(plan.off_limits ?? plan.off_limits_rooms ?? "");
    setHydrated(true);
  }, [plan, hydrated]);
  useDebouncedAutosave(async () => {
    if (!plan) return;
    const modeLabel = OUT_OF_CAGE_OPTIONS.find((o) => o.value === oocMode)?.label;
    const oocSummary = [modeLabel ?? "", oocNotes.trim()].filter(Boolean).join(" — ");
    const allHazards = [...hazards, ...hazardsOther.trim() ? [hazardsOther.trim()] : []];
    const safetySummary = allHazards.length ? `Hazards: ${allHazards.join(", ")}` : "";
    await supabase.from("care_plans").update({
      cage_location: cageLoc || null,
      out_of_cage_mode: oocMode || null,
      out_of_cage_notes: oocNotes || null,
      hazards,
      hazards_other: hazardsOther || null,
      off_limits: offLimits || null,
      // Mirror to legacy fields visible in the Care plan tab
      out_of_cage_rules: oocSummary || null,
      safety_rules: safetySummary || null,
      off_limits_rooms: offLimits || null
    }).eq("id", plan.id);
    qc.invalidateQueries({
      queryKey: ["plan", birdId]
    });
  }, [cageLoc, oocMode, oocNotes, hazards, hazardsOther, offLimits], !!plan && hydrated, registerFlush);
  if (isLoading || !plan) return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "h-32 animate-pulse rounded-2xl bg-sage-100" });
  function toggleHazard(v) {
    setHazards(hazards.includes(v) ? hazards.filter((x) => x !== v) : [...hazards, v]);
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "rounded-2xl bg-white p-4 ring-1 ring-sage-100", children: /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm font-semibold", children: "What does a sitter need to know about your home?" }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(Card, { title: "Cage location & setup notes", children: /* @__PURE__ */ jsxRuntimeExports.jsx("textarea", { className: "input area", placeholder: "e.g. Living room, away from the kitchen. Cover is on the side table.", value: cageLoc, maxLength: 500, onChange: (e) => setCageLoc(e.target.value) }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(Card, { title: "Out-of-cage rules", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("select", { className: "input", value: oocMode, onChange: (e) => setOocMode(e.target.value), children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "", children: "Pick one…" }),
        OUT_OF_CAGE_OPTIONS.map((o) => /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: o.value, children: o.label }, o.value))
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("textarea", { className: "input area mt-2", placeholder: "Notes (which room? how long? what to watch for?)", value: oocNotes, maxLength: 500, onChange: (e) => setOocNotes(e.target.value) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(Card, { title: "Home-specific hazards", hint: "Tap any that apply, then add your own.", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex flex-wrap gap-2", children: HAZARD_OPTIONS.map((h) => /* @__PURE__ */ jsxRuntimeExports.jsx(Chip, { on: hazards.includes(h), onClick: () => toggleHazard(h), children: h }, h)) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("input", { className: "input mt-3", placeholder: "Other hazards", value: hazardsOther, maxLength: 300, onChange: (e) => setHazardsOther(e.target.value) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(Card, { title: "Anything off-limits", children: /* @__PURE__ */ jsxRuntimeExports.jsx("textarea", { className: "input area", placeholder: "e.g. No access to the kitchen or bathroom; bedroom door stays closed.", value: offLimits, maxLength: 400, onChange: (e) => setOffLimits(e.target.value) }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("style", { children: `.input{width:100%;border-radius:.75rem;background:white;border:1px solid var(--sage-200);padding:.65rem .8rem;font-size:16px;outline:none}.input:focus{border-color:var(--sage-600);box-shadow:0 0 0 3px rgb(74 103 65 / .15)}.area{min-height:60px;line-height:1.4}` })
  ] });
}
const MED_TASK_PREFIX = "Medication";
function HealthBaselineStep({
  birdId,
  birdName,
  registerFlush
}) {
  const qc = useQueryClient();
  const {
    data: bird
  } = useQuery({
    queryKey: ["bird-health", birdId],
    queryFn: async () => {
      const {
        data,
        error
      } = await supabase.from("birds").select("id, owner_id, normal_weight, medical_conditions, medications").eq("id", birdId).single();
      if (error) throw error;
      return data;
    }
  });
  const {
    data: plan,
    isLoading
  } = useQuery({
    queryKey: ["plan-health", birdId],
    queryFn: async () => {
      const {
        data,
        error
      } = await supabase.from("care_plans").select("*").eq("bird_id", birdId).maybeSingle();
      if (error) throw error;
      return data;
    }
  });
  const [weight, setWeight] = reactExports.useState("");
  const [conditions, setConditions] = reactExports.useState("");
  const [meds, setMeds] = reactExports.useState("");
  const [medSchedule, setMedSchedule] = reactExports.useState("");
  const [whatsNormal, setWhatsNormal] = reactExports.useState("");
  const [droppingsPath, setDroppingsPath] = reactExports.useState(null);
  const [clipPath, setClipPath] = reactExports.useState(null);
  const [droppingsPreview, setDroppingsPreview] = reactExports.useState(null);
  const [clipPreview, setClipPreview] = reactExports.useState(null);
  const [hydrated, setHydrated] = reactExports.useState(false);
  const [uploading, setUploading] = reactExports.useState(null);
  const [initialWeight, setInitialWeight] = reactExports.useState("");
  reactExports.useEffect(() => {
    if (!plan || !bird || hydrated) return;
    const w = bird.normal_weight != null ? String(bird.normal_weight) : "";
    setWeight(w);
    setInitialWeight(w);
    setConditions(bird.medical_conditions ?? "");
    setMeds(bird.medications ?? "");
    setMedSchedule(plan.medication_schedule ?? "");
    setWhatsNormal(plan.whats_normal ?? "");
    setDroppingsPath(plan.baseline_droppings_path ?? null);
    setClipPath(plan.baseline_clip_path ?? null);
    setHydrated(true);
  }, [plan, bird, hydrated]);
  reactExports.useEffect(() => {
    let cancelled = false;
    async function sign(path, setter) {
      if (!path) {
        setter(null);
        return;
      }
      const {
        data
      } = await supabase.storage.from("bird-photos").createSignedUrl(path, 3600);
      if (!cancelled) setter(data?.signedUrl ?? null);
    }
    sign(droppingsPath, setDroppingsPreview);
    sign(clipPath, setClipPreview);
    return () => {
      cancelled = true;
    };
  }, [droppingsPath, clipPath]);
  useDebouncedAutosave(async () => {
    if (!plan || !bird) return;
    const newWeight = weight.trim() ? Number(weight) : null;
    await supabase.from("birds").update({
      normal_weight: newWeight,
      medical_conditions: conditions || null,
      medications: meds || null
    }).eq("id", birdId);
    await supabase.from("care_plans").update({
      medication_schedule: medSchedule || null,
      whats_normal: whatsNormal || null,
      baseline_droppings_path: droppingsPath,
      baseline_clip_path: clipPath
    }).eq("id", plan.id);
    if (newWeight != null && weight !== initialWeight) {
      await supabase.from("weight_logs").insert({
        bird_id: birdId,
        weight: newWeight,
        notes: "Baseline weight"
      });
      setInitialWeight(weight);
    }
    await syncMedicationTask(plan.id, meds, medSchedule);
    qc.invalidateQueries({
      queryKey: ["plan", birdId]
    });
    qc.invalidateQueries({
      queryKey: ["tasks", plan.id]
    });
  }, [weight, conditions, meds, medSchedule, whatsNormal, droppingsPath, clipPath], !!plan && !!bird && hydrated, registerFlush, 600);
  async function uploadPhoto(file) {
    if (!bird) return;
    setUploading("photo");
    try {
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const path = `${bird.owner_id}/baselines/${birdId}/droppings-${Date.now()}.${ext}`;
      const {
        error
      } = await supabase.storage.from("bird-photos").upload(path, file, {
        contentType: file.type || "image/jpeg",
        upsert: true
      });
      if (error) throw error;
      if (droppingsPath) await supabase.storage.from("bird-photos").remove([droppingsPath]);
      setDroppingsPath(path);
      toast.success("Baseline photo saved.");
    } catch (e) {
      toast.error(e.message ?? "Upload failed");
    } finally {
      setUploading(null);
    }
  }
  async function uploadClip(file) {
    if (!bird) return;
    if (file.size > MAX_BYTES) {
      toast.error("Clip is too large. Try a shorter recording.");
      return;
    }
    setUploading("clip");
    try {
      const ext = (file.name.split(".").pop() || "mp4").toLowerCase();
      const path = `${bird.owner_id}/baselines/${birdId}/clip-${Date.now()}.${ext}`;
      const {
        error
      } = await supabase.storage.from("bird-photos").upload(path, file, {
        contentType: file.type || (ext === "webm" ? "video/webm" : "video/mp4"),
        upsert: true
      });
      if (error) throw error;
      if (clipPath) await supabase.storage.from("bird-photos").remove([clipPath]);
      setClipPath(path);
      toast.success("Baseline clip saved.");
    } catch (e) {
      toast.error(e.message ?? "Upload failed");
    } finally {
      setUploading(null);
    }
  }
  async function removePhoto() {
    if (droppingsPath) await supabase.storage.from("bird-photos").remove([droppingsPath]);
    setDroppingsPath(null);
  }
  async function removeClip() {
    if (clipPath) await supabase.storage.from("bird-photos").remove([clipPath]);
    setClipPath(null);
  }
  if (isLoading || !plan || !bird) return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "h-32 animate-pulse rounded-2xl bg-sage-100" });
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "rounded-2xl bg-white p-4 ring-1 ring-sage-100", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-sm font-semibold", children: [
      "Help your sitter know what's normal for ",
      birdName,
      ", so they can spot what isn't."
    ] }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(Card, { title: "Normal weight (grams)", hint: "Optional. Updating this adds an entry to the weight log.", children: /* @__PURE__ */ jsxRuntimeExports.jsx("input", { className: "input", inputMode: "decimal", placeholder: "e.g. 410", value: weight, onChange: (e) => setWeight(e.target.value.replace(/[^0-9.]/g, "")) }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(Card, { title: "Photo of normal droppings", hint: "Optional. Private — only your assigned sitter can view it.", children: droppingsPreview ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("img", { src: droppingsPreview, alt: "Baseline droppings", className: "h-40 w-full rounded-xl object-cover ring-1 ring-sage-200" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "flex-1 cursor-pointer rounded-xl border border-sage-200 bg-white py-2 text-center text-xs font-semibold text-sage-700", children: [
          "Replace",
          /* @__PURE__ */ jsxRuntimeExports.jsx("input", { type: "file", accept: "image/*", className: "hidden", onChange: (e) => e.target.files?.[0] && uploadPhoto(e.target.files[0]) })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", onClick: removePhoto, className: "flex-1 rounded-xl border border-sage-200 bg-white py-2 text-xs font-semibold text-warn-red", children: "Remove" })
      ] })
    ] }) : /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "block cursor-pointer rounded-xl border-2 border-dashed border-sage-200 bg-sage-50 p-4 text-center", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sm font-semibold text-sage-700", children: uploading === "photo" ? "Uploading…" : "Tap to upload a photo" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("input", { type: "file", accept: "image/*", className: "hidden", onChange: (e) => e.target.files?.[0] && uploadPhoto(e.target.files[0]) })
    ] }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(Card, { title: "Short clip of normal behavior or vocalizing", hint: `Optional, up to ${Math.floor(MAX_SECONDS / 60)} min. Record at 720p in your browser or upload an existing video. Private — only your assigned sitter can view it.`, children: [
      clipPreview ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("video", { src: clipPreview, controls: true, playsInline: true, className: "h-48 w-full rounded-xl bg-black object-contain ring-1 ring-sage-200" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex gap-2", children: /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", onClick: removeClip, disabled: uploading === "clip", className: "flex-1 rounded-xl border border-sage-200 bg-white py-2 text-xs font-semibold text-warn-red disabled:opacity-50", children: "Remove" }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(ClipRecorder, { baseName: `clip-baseline-${Date.now()}`, disabled: uploading === "clip", onRecorded: uploadClip })
      ] }) : /* @__PURE__ */ jsxRuntimeExports.jsx(ClipRecorder, { baseName: `clip-baseline-${Date.now()}`, disabled: uploading === "clip", onRecorded: uploadClip }),
      uploading === "clip" && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-2 text-xs font-semibold text-sage-600", children: "Uploading…" })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(Card, { title: "Known conditions", children: /* @__PURE__ */ jsxRuntimeExports.jsx("textarea", { className: "input area", placeholder: "e.g. Mild feather plucking; old wing injury (no flight).", value: conditions, maxLength: 500, onChange: (e) => setConditions(e.target.value) }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(Card, { title: "Medications", hint: "Adding a medication here also creates a matching task in the Routine tab.", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("input", { className: "input", placeholder: "e.g. Metacam 0.1ml", value: meds, maxLength: 300, onChange: (e) => setMeds(e.target.value) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("input", { className: "input mt-2", placeholder: "Schedule (e.g. once daily in the morning with food)", value: medSchedule, maxLength: 300, onChange: (e) => setMedSchedule(e.target.value) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(Card, { title: "What's normal for this bird", children: /* @__PURE__ */ jsxRuntimeExports.jsx("textarea", { className: "input area", placeholder: "e.g. Loud whistles at sunrise and sunset are normal. Naps mid-afternoon for ~30 min. Likes to flap on the perch for exercise.", value: whatsNormal, maxLength: 800, onChange: (e) => setWhatsNormal(e.target.value) }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("style", { children: `.input{width:100%;border-radius:.75rem;background:white;border:1px solid var(--sage-200);padding:.65rem .8rem;font-size:16px;outline:none}.input:focus{border-color:var(--sage-600);box-shadow:0 0 0 3px rgb(74 103 65 / .15)}.area{min-height:60px;line-height:1.4}` })
  ] });
}
async function syncMedicationTask(planId, meds, schedule) {
  const {
    data: existing
  } = await supabase.from("routine_tasks").select("id, title, instructions").eq("care_plan_id", planId).ilike("title", `${MED_TASK_PREFIX}%`);
  const med = meds.trim();
  const sched = schedule.trim();
  const title = med ? `${MED_TASK_PREFIX}: ${med}` : "";
  const instructions = sched || null;
  if (!med) {
    if (existing && existing.length) {
      await supabase.from("routine_tasks").delete().in("id", existing.map((t) => t.id));
    }
    return;
  }
  if (!existing || existing.length === 0) {
    await supabase.from("routine_tasks").insert({
      care_plan_id: planId,
      title,
      instructions,
      category: "morning",
      sort_order: 999
    });
  } else {
    const [first, ...rest] = existing;
    await supabase.from("routine_tasks").update({
      title,
      instructions
    }).eq("id", first.id);
    if (rest.length) await supabase.from("routine_tasks").delete().in("id", rest.map((t) => t.id));
  }
}
function inferFeedingCategory(time) {
  const s = time.toLowerCase();
  if (/morning|breakfast|am\b|sunrise|wake/.test(s)) return "morning";
  if (/midday|noon|lunch/.test(s)) return "midday";
  if (/evening|dinner|supper|pm\b/.test(s)) return "evening";
  if (/bedtime|night|cover|sleep/.test(s)) return "bedtime";
  const m = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  if (m) {
    let h = parseInt(m[1], 10);
    const ampm = m[3];
    if (ampm === "pm" && h < 12) h += 12;
    if (ampm === "am" && h === 12) h = 0;
    if (h < 11) return "morning";
    if (h < 14) return "midday";
    if (h < 20) return "evening";
    return "bedtime";
  }
  return "custom";
}
async function syncFeedingTasks(planId, items) {
  const {
    data: existing
  } = await supabase.from("routine_tasks").select("id").eq("care_plan_id", planId).ilike("title", `${FEED_PREFIX}%`);
  const oldIds = (existing ?? []).map((r) => r.id);
  if (oldIds.length) await supabase.from("routine_tasks").delete().in("id", oldIds);
  const rows = [];
  let order = 100;
  for (const it of items) {
    const name = (it.name ?? "").trim();
    if (!name) continue;
    const amt = formatAmountUnit(it.amount, it.unit);
    const baseInstr = amt ? `Serve ${amt}.` : "";
    if (it.freeFed) {
      rows.push({
        care_plan_id: planId,
        title: `${FEED_PREFIX} ${name} (available all day)`,
        instructions: [baseInstr, "Keep topped up — this is free-fed in the cage."].filter(Boolean).join(" "),
        category: "custom",
        time_of_day: "Available all day",
        sort_order: order++
      });
      continue;
    }
    const times = (it.times ?? []).filter((t) => t.trim());
    if (times.length === 0) continue;
    for (const tm of times) {
      rows.push({
        care_plan_id: planId,
        title: `${FEED_PREFIX} ${name}`,
        instructions: baseInstr,
        category: inferFeedingCategory(tm),
        time_of_day: tm,
        sort_order: order++
      });
    }
  }
  if (rows.length) await supabase.from("routine_tasks").insert(rows);
}
async function syncHygieneTasks(planId, args) {
  const specs = [{
    prefix: HYG_REMOVE_PREFIX,
    title: `${HYG_REMOVE_PREFIX} (within ${args.removalLabel} of serving)`,
    instructions: "Fresh / wet food spoils fast. Take it out within this window to prevent bacteria.",
    category: "midday",
    sort_order: 990,
    skip: !args.hasFresh
  }, {
    prefix: HYG_WASH_FOOD_PREFIX,
    title: `${HYG_WASH_FOOD_PREFIX} (${args.foodWashLabel.toLowerCase()})`,
    instructions: "Use hot water and a bottle brush. Rinse thoroughly before refilling.",
    category: "evening",
    sort_order: 991,
    skip: false
  }, {
    prefix: HYG_WASH_WATER_PREFIX,
    title: `${HYG_WASH_WATER_PREFIX} (${args.waterWashLabel.toLowerCase()})`,
    instructions: "Wash the bowl/bottle itself — separate from how often water is changed.",
    category: "morning",
    sort_order: 992,
    skip: false
  }];
  for (const s of specs) {
    const {
      data: existing
    } = await supabase.from("routine_tasks").select("id").eq("care_plan_id", planId).ilike("title", `${s.prefix}%`);
    const rows = existing ?? [];
    if (s.skip) {
      if (rows.length) await supabase.from("routine_tasks").delete().in("id", rows.map((r) => r.id));
      continue;
    }
    if (rows.length === 0) {
      await supabase.from("routine_tasks").insert({
        care_plan_id: planId,
        title: s.title,
        instructions: s.instructions,
        category: s.category,
        sort_order: s.sort_order
      });
    } else {
      const [first, ...rest] = rows;
      await supabase.from("routine_tasks").update({
        title: s.title,
        instructions: s.instructions
      }).eq("id", first.id);
      if (rest.length) await supabase.from("routine_tasks").delete().in("id", rest.map((r) => r.id));
    }
  }
}
const CLIP_SLOTS = [{
  key: "step_up",
  column: "clip_step_up_path",
  label: "How she steps up",
  hint: "Hand position, cue word, what works."
}, {
  key: "food_water",
  column: "clip_food_water_path",
  label: "How to refill food & water safely",
  hint: "Show the bowls, fill amount, and any cage-door routine."
}, {
  key: "locations",
  column: "clip_locations_path",
  label: "Where everything is",
  hint: "Walkthrough: food, treats, towels, carrier, first aid."
}, {
  key: "bedtime",
  column: "clip_bedtime_path",
  label: "Settling her for the night",
  hint: "Cover routine, lights, sounds."
}];
function WatchFirstClipsStep({
  birdId
}) {
  const qc = useQueryClient();
  const {
    data: bird
  } = useQuery({
    queryKey: ["bird-owner", birdId],
    queryFn: async () => {
      const {
        data,
        error
      } = await supabase.from("birds").select("id, owner_id").eq("id", birdId).single();
      if (error) throw error;
      return data;
    }
  });
  const {
    data: plan,
    isLoading
  } = useQuery({
    queryKey: ["plan-clips", birdId],
    queryFn: async () => {
      const {
        data,
        error
      } = await supabase.from("care_plans").select("*").eq("bird_id", birdId).maybeSingle();
      if (error) throw error;
      return data;
    }
  });
  if (isLoading || !plan || !bird) return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "h-32 animate-pulse rounded-2xl bg-sage-100" });
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-2xl bg-white p-4 ring-1 ring-sage-100", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm font-semibold", children: "Record a few short clips so your sitter can see how things are done." }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 text-sm text-sage-600", children: "All clips are private — only your assigned sitter can play them." })
    ] }),
    CLIP_SLOTS.map((slot) => /* @__PURE__ */ jsxRuntimeExports.jsx(ClipSlotCard, { slot, path: plan[slot.column] ?? null, ownerId: bird.owner_id, birdId, planId: plan.id, onChange: () => qc.invalidateQueries({
      queryKey: ["plan-clips", birdId]
    }) }, slot.key)),
    /* @__PURE__ */ jsxRuntimeExports.jsx("style", { children: `.input{width:100%;border-radius:.75rem;background:white;border:1px solid var(--sage-200);padding:.65rem .8rem;font-size:16px;outline:none}` })
  ] });
}
function ClipSlotCard({
  slot,
  path,
  ownerId,
  birdId,
  planId,
  onChange
}) {
  const [preview, setPreview] = reactExports.useState(null);
  const [busy, setBusy] = reactExports.useState(null);
  reactExports.useEffect(() => {
    let cancelled = false;
    async function sign() {
      if (!path) {
        setPreview(null);
        return;
      }
      const {
        data
      } = await supabase.storage.from("bird-photos").createSignedUrl(path, 3600);
      if (!cancelled) setPreview(data?.signedUrl ?? null);
    }
    sign();
    return () => {
      cancelled = true;
    };
  }, [path]);
  async function upload(file) {
    if (file.size > MAX_BYTES) {
      toast.error("Clip is too large. Try a shorter recording.");
      return;
    }
    setBusy("uploading");
    try {
      const ext = (file.name.split(".").pop() || "mp4").toLowerCase();
      const newPath = `${ownerId}/baselines/${birdId}/clip-${slot.key}-${Date.now()}.${ext}`;
      const {
        error
      } = await supabase.storage.from("bird-photos").upload(newPath, file, {
        contentType: file.type || (ext === "webm" ? "video/webm" : "video/mp4"),
        upsert: true
      });
      if (error) throw error;
      if (path) await supabase.storage.from("bird-photos").remove([path]);
      await supabase.from("care_plans").update({
        [slot.column]: newPath
      }).eq("id", planId);
      toast.success(`${slot.label} saved.`);
      onChange();
    } catch (e) {
      toast.error(e.message ?? "Upload failed");
    } finally {
      setBusy(null);
    }
  }
  async function remove() {
    setBusy("uploading");
    try {
      if (path) await supabase.storage.from("bird-photos").remove([path]);
      await supabase.from("care_plans").update({
        [slot.column]: null
      }).eq("id", planId);
      onChange();
    } finally {
      setBusy(null);
    }
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(Card, { title: slot.label, hint: slot.hint, children: [
    preview ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("video", { src: preview, controls: true, playsInline: true, className: "h-44 w-full rounded-xl bg-black object-contain ring-1 ring-sage-200" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex gap-2", children: /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", disabled: !!busy, onClick: remove, className: "flex-1 rounded-xl border border-sage-200 bg-white py-2 text-xs font-semibold text-warn-red disabled:opacity-50", children: "Remove" }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(ClipRecorder, { baseName: `clip-${slot.key}-${Date.now()}`, disabled: !!busy, onRecorded: upload })
    ] }) : /* @__PURE__ */ jsxRuntimeExports.jsx(ClipRecorder, { baseName: `clip-${slot.key}-${Date.now()}`, disabled: !!busy, onRecorded: upload }),
    busy === "uploading" && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-2 text-xs font-semibold text-sage-600", children: "Uploading…" })
  ] });
}
const FIELD_PLACEHOLDERS = {
  owner_phone: "(555) 123-4567",
  backup_phone: "(555) 987-6543",
  avian_vet_phone: "(555) 246-8000",
  emergency_vet_phone: "(555) 911-0000",
  spending_limit: "e.g. up to $500 without calling",
  poison_control: "(888) 426-4435"
};
const MULTI_LINE = ["avian_vet_address", "emergency_vet_address", "carrier_location", "first_aid_kit_location", "emergency_authorization"];
const ASPCA_POISON_CONTROL = "(888) 426-4435";
function EmergencyStep({
  birdId,
  onBlockNext,
  registerFlush
}) {
  const qc = useQueryClient();
  const {
    data: bird
  } = useQuery({
    queryKey: ["bird-owner-emerg", birdId],
    queryFn: async () => {
      const {
        data,
        error
      } = await supabase.from("birds").select("id, owner_id").eq("id", birdId).single();
      if (error) throw error;
      return data;
    }
  });
  const {
    data: contacts,
    isLoading
  } = useQuery({
    queryKey: ["emergency-contacts", birdId],
    queryFn: async () => {
      const {
        data,
        error
      } = await supabase.from("emergency_contacts").select("*").eq("bird_id", birdId).maybeSingle();
      if (error) throw error;
      return data;
    }
  });
  const {
    data: defaults
  } = useQuery({
    queryKey: ["owner-emergency-defaults", bird?.owner_id],
    enabled: !!bird?.owner_id,
    queryFn: async () => {
      const {
        data
      } = await supabase.from("owner_emergency_defaults").select("*").eq("owner_id", bird.owner_id).maybeSingle();
      return data;
    }
  });
  const [values, setValues] = reactExports.useState(() => emptyValues());
  const [hydrated, setHydrated] = reactExports.useState(false);
  reactExports.useEffect(() => {
    if (hydrated || isLoading) return;
    const next = emptyValues();
    for (const f of EMERGENCY_FIELDS) next[f] = contacts?.[f] ?? "";
    if (!next.poison_control && !defaults?.poison_control) {
      next.poison_control = ASPCA_POISON_CONTROL;
    }
    setValues(next);
    setHydrated(true);
  }, [contacts, defaults, hydrated, isLoading]);
  const merged = reactExports.useMemo(() => {
    const birdLike = {};
    for (const f of EMERGENCY_FIELDS) birdLike[f] = values[f];
    return mergeEmergency(birdLike, defaults ?? null);
  }, [values, defaults]);
  const missing = REQUIRED_FIELDS.filter((f) => !merged[f] || !merged[f].trim());
  reactExports.useEffect(() => {
    onBlockNext(missing.length > 0);
  }, [missing.length, onBlockNext]);
  useDebouncedAutosave(async () => {
    const payload = {
      bird_id: birdId
    };
    for (const f of EMERGENCY_FIELDS) payload[f] = values[f].trim() || null;
    const {
      error
    } = await supabase.from("emergency_contacts").upsert(payload, {
      onConflict: "bird_id"
    });
    if (error) toast.error(error.message);
    qc.invalidateQueries({
      queryKey: ["emergency-contacts", birdId]
    });
  }, [values, birdId], hydrated, registerFlush);
  if (isLoading || !bird) return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "h-32 animate-pulse rounded-2xl bg-sage-100" });
  function set(field, v) {
    setValues((prev) => ({
      ...prev,
      [field]: v
    }));
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-2xl bg-white p-4 ring-1 ring-sage-100", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm font-semibold", children: "If something goes wrong, who does your sitter call?" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "mt-1 text-sm text-sage-600", children: [
        "Owner phone and avian vet phone are required. Fields with a default from your account are marked ",
        /* @__PURE__ */ jsxRuntimeExports.jsx("em", { children: "inherited" }),
        " — typing in them creates a per-bird override."
      ] })
    ] }),
    EMERGENCY_FIELDS.map((f) => {
      const birdValue = values[f] ?? "";
      const isOverride = birdValue.trim().length > 0;
      const inherited = !isOverride && !!defaults?.[f];
      const inheritedValue = defaults?.[f] ?? "";
      const placeholder = inherited && inheritedValue ? `Inherited: ${inheritedValue}` : FIELD_PLACEHOLDERS[f] ?? "";
      const required = REQUIRED_FIELDS.includes(f);
      const isMissing = required && (!merged[f] || !merged[f].trim());
      return /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "rounded-2xl bg-white p-4 ring-1 ring-sage-100", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-baseline justify-between gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("h2", { className: "text-sm font-bold", children: [
            EMERGENCY_LABELS[f],
            required && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "ml-1 text-warn-red", children: "*" })
          ] }),
          isOverride ? /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "rounded-full bg-sage-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-sage-700", children: "Override" }) : inherited ? /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "rounded-full bg-sage-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-sage-600", children: "Inherited" }) : null
        ] }),
        MULTI_LINE.includes(f) ? /* @__PURE__ */ jsxRuntimeExports.jsx("textarea", { className: "input area mt-2", placeholder, value: birdValue, maxLength: 1e3, onChange: (e) => set(f, e.target.value) }) : /* @__PURE__ */ jsxRuntimeExports.jsx("input", { className: "input mt-2", placeholder, value: birdValue, maxLength: 300, onChange: (e) => set(f, e.target.value) }),
        isOverride && inherited === false && defaults?.[f] && /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", className: "mt-2 text-[11px] font-semibold text-sage-600 underline", onClick: () => set(f, ""), children: "Clear override (use account default)" }),
        isMissing && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-2 text-xs font-semibold text-warn-red", children: "Required." })
      ] }, f);
    }),
    missing.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-2xl bg-warn-red/10 p-3 text-xs font-semibold text-warn-red", children: [
      "Add ",
      missing.map((f) => EMERGENCY_LABELS[f]).join(" and "),
      " before continuing."
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("style", { children: `.input{width:100%;border-radius:.75rem;background:white;border:1px solid var(--sage-200);padding:.65rem .8rem;font-size:16px;outline:none}.input:focus{border-color:var(--sage-600);box-shadow:0 0 0 3px rgb(74 103 65 / .15)}.area{min-height:60px;line-height:1.4}` })
  ] });
}
function emptyValues() {
  const o = {};
  for (const f of EMERGENCY_FIELDS) o[f] = "";
  return o;
}
function ReviewStep({
  birdId,
  birdName,
  onJumpToStep,
  onFinish
}) {
  const {
    data: bird
  } = useQuery({
    queryKey: ["bird-review", birdId],
    queryFn: async () => {
      const {
        data,
        error
      } = await supabase.from("birds").select("id, owner_id, normal_weight").eq("id", birdId).single();
      if (error) throw error;
      return data;
    }
  });
  const {
    data: plan
  } = useQuery({
    queryKey: ["plan-review", birdId],
    queryFn: async () => {
      const {
        data
      } = await supabase.from("care_plans").select("*").eq("bird_id", birdId).maybeSingle();
      return data;
    }
  });
  const {
    data: tasks = []
  } = useQuery({
    queryKey: ["tasks-review", plan?.id],
    enabled: !!plan?.id,
    queryFn: async () => {
      const {
        data
      } = await supabase.from("routine_tasks").select("id").eq("care_plan_id", plan.id);
      return data ?? [];
    }
  });
  const {
    data: contacts
  } = useQuery({
    queryKey: ["contacts-review", birdId],
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
    queryKey: ["defaults-review", bird?.owner_id],
    enabled: !!bird?.owner_id,
    queryFn: async () => {
      const {
        data
      } = await supabase.from("owner_emergency_defaults").select("*").eq("owner_id", bird.owner_id).maybeSingle();
      return data;
    }
  });
  const [previewToken, setPreviewToken] = reactExports.useState(null);
  const [previewError, setPreviewError] = reactExports.useState(null);
  reactExports.useEffect(() => {
    let cancelled = false;
    async function ensurePreviewSit() {
      if (!bird?.owner_id) return;
      try {
        const {
          data: existing
        } = await supabase.from("sits").select("id, invite_token, token_expires_at, revoked, sit_birds(bird_id)").eq("owner_id", bird.owner_id).eq("sitter_name", "__preview__").eq("revoked", false);
        const match = (existing ?? []).find((s) => (s.sit_birds ?? []).some((sb) => sb.bird_id === birdId) && new Date(s.token_expires_at) > /* @__PURE__ */ new Date());
        if (match) {
          if (!cancelled) setPreviewToken(match.invite_token);
          return;
        }
        const expires = new Date(Date.now() + 365 * 24 * 60 * 60 * 1e3).toISOString();
        const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
        const {
          data: sit,
          error
        } = await supabase.from("sits").insert({
          owner_id: bird.owner_id,
          sitter_name: "__preview__",
          sitter_email: null,
          start_date: today,
          end_date: today,
          notes: "Preview from setup flow",
          token_expires_at: expires,
          status: "upcoming"
        }).select().single();
        if (error || !sit) throw new Error(error?.message ?? "Could not build preview");
        const {
          error: linkErr
        } = await supabase.from("sit_birds").insert({
          sit_id: sit.id,
          bird_id: birdId
        });
        if (linkErr) throw new Error(linkErr.message);
        if (!cancelled) setPreviewToken(sit.invite_token);
      } catch (e) {
        if (!cancelled) setPreviewError(e.message ?? "Could not build preview");
      }
    }
    ensurePreviewSit();
    return () => {
      cancelled = true;
    };
  }, [bird?.owner_id, birdId]);
  const issues = reactExports.useMemo(() => {
    const list = [];
    if ((tasks?.length ?? 0) === 0) list.push({
      label: "No routine tasks yet",
      step: 2
    });
    if (!plan?.diet_types?.length && !plan?.food_instructions) list.push({
      label: "No food & water details",
      step: 3
    });
    if (!plan?.handlers && !plan?.likes && !plan?.fears_triggers) list.push({
      label: "No personality & handling notes",
      step: 4
    });
    if (!plan?.cage_location && !plan?.out_of_cage_mode && !plan?.hazards?.length) list.push({
      label: "No environment & safety details",
      step: 5
    });
    if (!bird?.normal_weight && !plan?.baseline_droppings_path && !plan?.baseline_clip_path && !plan?.whats_normal) {
      list.push({
        label: "No health baseline (weight, photo, clip, or notes)",
        step: 6
      });
    }
    if (!plan?.clip_step_up_path && !plan?.clip_food_water_path && !plan?.clip_locations_path && !plan?.clip_bedtime_path) {
      list.push({
        label: "No watch-first clips",
        step: 7
      });
    }
    const eff = (k) => (contacts?.[k] ?? "").toString().trim() || (defaults?.[k] ?? "").toString().trim();
    if (!eff("owner_phone") || !eff("avian_vet_phone")) {
      list.push({
        label: "Required emergency contacts missing",
        step: 8
      });
    }
    return list;
  }, [tasks, plan, bird, contacts, defaults]);
  const previewSrc = previewToken ? `/sitter/${previewToken}?birdId=${birdId}` : null;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-2xl bg-white p-4 ring-1 ring-sage-100", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-sm font-semibold", children: [
        "Here's exactly what your sitter will see for ",
        birdName,
        "."
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 text-sm text-sage-600", children: "Scroll inside the preview to explore the sitter's Today screen." })
    ] }),
    issues.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "rounded-2xl bg-warn-amber/10 p-4 ring-1 ring-warn-amber/30", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-sm font-bold text-warn-amber", children: "Before you share" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 text-xs text-sage-700", children: "A few things are still thin or empty:" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("ul", { className: "mt-2 space-y-1", children: issues.map((i) => /* @__PURE__ */ jsxRuntimeExports.jsx("li", { children: /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { type: "button", onClick: () => onJumpToStep(i.step), className: "text-left text-sm font-semibold text-sage-900 underline decoration-warn-amber underline-offset-2", children: [
        i.label,
        " ",
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-xs text-sage-600", children: [
          "— fix in step ",
          i.step
        ] })
      ] }) }, i.step)) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "overflow-hidden rounded-2xl bg-sage-900 ring-1 ring-sage-200", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-white/80", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Sitter preview" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "rounded bg-white/10 px-2 py-0.5", children: "Live" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "bg-sage-50", children: previewError ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "p-6 text-sm text-warn-red", children: previewError }) : previewSrc ? /* @__PURE__ */ jsxRuntimeExports.jsx("iframe", { src: previewSrc, title: "Sitter preview", className: "h-[640px] w-full border-0 bg-sage-50" }) : /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "h-[640px] animate-pulse bg-sage-100" }) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", onClick: () => onFinish({
        to: "tabs"
      }), className: "w-full rounded-xl bg-sage-600 py-3 text-sm font-semibold text-white", children: "Looks good — save" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", onClick: () => onFinish({
        to: "dashboard-newsit"
      }), className: "w-full rounded-xl border border-sage-300 bg-white py-3 text-sm font-semibold text-sage-700", children: "Save & create a sit" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", onClick: () => onJumpToStep(8), className: "block w-full text-center text-xs font-semibold text-sage-700 underline", children: "← Back to Emergency" })
    ] })
  ] });
}
export {
  BirdSetup as component
};

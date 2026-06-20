// Single source of truth for the displayed app version. Injected at build from
// package.json via Vite `define`; falls back to a safe default if the define
// isn't present (e.g. some test runners). `typeof` guards a ReferenceError.
export const APP_VERSION: string =
  typeof __APP_VERSION__ !== "undefined" && __APP_VERSION__ ? __APP_VERSION__ : "1.0.0";

/**
 * The side-column layout (lib/duo.ts) from what the native DuoBridge plugin
 * reports (iOS app 1.2, lib/duoNative.ts), and the plugin's state on <html>.
 *
 *   npm run test:duo
 *
 * Fake plugin states for the iPhone Duo's screens, a regular iPhone and iPad
 * (plugin present, no hinge), and anywhere without the plugin (Safari, the
 * PWA, older App Store builds), where today's space rule must be unchanged.
 *
 * Plain asserts, since the repo carries no test runner. Exits non-zero on
 * failure so it can gate a merge.
 */
import assert from "node:assert/strict";
import { resolveDuoLayout } from "@/lib/duo";
import { applyToHtml, normalizeNativeDuoState, type NativeDuoState } from "@/lib/duoNative";

let passed = 0;
function check(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ok   ${name}`); }
  catch (e) {
    console.log(`  FAIL ${name}\n       ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`);
    process.exitCode = 1;
  }
}

const state = (s: Partial<NativeDuoState>): NativeDuoState => ({ verticalBarEdge: null, hingeStatus: null, hingeAngleDegrees: null, fold: null, ...s });
const crease = { x: 471.5, y: 0, width: 8, height: 669, active: true };

console.log("iPhone Duo, iOS app 1.2");
check("folded cover screen: column on the right, one pane", () => {
  // Portrait 382x837: the space rule doesn't match.
  assert.deepEqual(resolveDuoLayout(state({ verticalBarEdge: "right", hingeStatus: "closed", hingeAngleDegrees: 0 }), false), { rail: "right", split: false });
});
check("unfolded, sideways: column on the right, two panes", () => {
  assert.deepEqual(resolveDuoLayout(state({ verticalBarEdge: "right", hingeStatus: "fullyOpen", hingeAngleDegrees: 180, fold: crease }), true), { rail: "right", split: true });
});
check("unfolded, upright: bottom bar (the system names no edge)", () => {
  assert.deepEqual(resolveDuoLayout(state({ hingeStatus: "fullyOpen", hingeAngleDegrees: 180 }), false), { rail: null, split: false });
});
check("half-folded, no edge named: bottom bar, even with room for two panes", () => {
  assert.deepEqual(resolveDuoLayout(state({ hingeStatus: "partiallyOpen", hingeAngleDegrees: 95, fold: crease }), true), { rail: null, split: false });
});
check("half-folded with an edge named: the column follows the system", () => {
  assert.deepEqual(resolveDuoLayout(state({ verticalBarEdge: "right", hingeStatus: "partiallyOpen", hingeAngleDegrees: 110 }), false), { rail: "right", split: false });
});
check("the column goes on the left when the system says left", () => {
  assert.deepEqual(resolveDuoLayout(state({ verticalBarEdge: "left", hingeStatus: "fullyOpen" }), true), { rail: "left", split: true });
});

console.log("No hinge: exactly today's rule");
for (const [label, native] of [["no plugin (Safari, PWA, app before 1.2)", null], ["plugin, all nulls (regular iPhone or iPad)", state({})]] as const) {
  check(`${label}: no room → bottom bar`, () => {
    assert.deepEqual(resolveDuoLayout(native, false), { rail: null, split: false });
  });
  check(`${label}: room for two panes → column on the right, two panes`, () => {
    assert.deepEqual(resolveDuoLayout(native, true), { rail: "right", split: true });
  });
}

console.log("Reading the bridge");
check("unknown or missing values read as null", () => {
  assert.deepEqual(normalizeNativeDuoState({ verticalBarEdge: "top", hingeStatus: "unknown", hingeAngleDegrees: "90", fold: { x: 1 } }), state({}));
  assert.deepEqual(normalizeNativeDuoState(undefined), state({}));
});
check("good values come through", () => {
  const s = state({ verticalBarEdge: "left", hingeStatus: "partiallyOpen", hingeAngleDegrees: 92.5, fold: crease });
  assert.deepEqual(normalizeNativeDuoState(JSON.parse(JSON.stringify(s))), s);
});

console.log("<html> attributes and fold variables");
function fakeRoot() {
  const attrs = new Map<string, string>();
  const props = new Map<string, string>();
  return {
    attrs, props,
    setAttribute: (n: string, v: string) => void attrs.set(n, v),
    removeAttribute: (n: string) => void attrs.delete(n),
    style: { setProperty: (n: string, v: string) => void props.set(n, v), removeProperty: (n: string) => void props.delete(n) },
  };
}
check("cover screen: data-vertical-bar and data-hinge set, no fold variables", () => {
  const r = fakeRoot();
  applyToHtml(state({ verticalBarEdge: "right", hingeStatus: "closed" }), r);
  assert.equal(r.attrs.get("data-vertical-bar"), "right");
  assert.equal(r.attrs.get("data-hinge"), "closed");
  assert.equal(r.props.size, 0);
});
check("unfolded with an active crease: --fold-x and --fold-width in px", () => {
  const r = fakeRoot();
  applyToHtml(state({ verticalBarEdge: "right", hingeStatus: "fullyOpen", fold: crease }), r);
  assert.equal(r.props.get("--fold-x"), "471.5px");
  assert.equal(r.props.get("--fold-width"), "8px");
});
check("everything null clears what was set", () => {
  const r = fakeRoot();
  applyToHtml(state({ verticalBarEdge: "right", hingeStatus: "fullyOpen", fold: crease }), r);
  applyToHtml(state({}), r);
  assert.equal(r.attrs.size, 0);
  assert.equal(r.props.size, 0);
});
check("an inactive crease sets no fold variables", () => {
  const r = fakeRoot();
  applyToHtml(state({ hingeStatus: "closed", fold: { ...crease, active: false } }), r);
  assert.equal(r.props.size, 0);
});

console.log(`\n${passed} passed${process.exitCode ? ", some FAILED" : ""}`);

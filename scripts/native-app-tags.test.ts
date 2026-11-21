/**
 * Native app version tags on PostHog events: native_app_version / native_build
 * from Capacitor's App.getInfo(), added by beforeSend to every event from a
 * native app, and absent from browser events.
 *
 *   npm run test:native-app-tags
 *
 * Plain asserts, like the other scripts/*.test.ts. Exits non-zero on failure.
 */
import assert from "node:assert/strict";

const N = await import("@/lib/nativeAppInfo");
const A = await import("@/lib/analytics");

let passed = 0;
async function check(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  ok   ${name}`);
  } catch (e) {
    console.log(`  FAIL ${name}`);
    console.log(`       ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`);
    process.exitCode = 1;
  }
}

await check("App.getInfo() result becomes the two tags", () => {
  assert.deepEqual(N.nativeAppTagsFrom({ name: "Kya & Co.", id: "com.thekyaproject.app", version: "1.2.0", build: "13" }), {
    native_app_version: "1.2.0",
    native_build: "13",
  });
});

await check("a numeric build (Android versionCode) is kept as text", () => {
  assert.deepEqual(N.nativeAppTagsFrom({ version: "1.2.0", build: 13 }), { native_app_version: "1.2.0", native_build: "13" });
});

await check("missing, empty, odd or overlong values give no tags", () => {
  assert.equal(N.nativeAppTagsFrom(null), null);
  assert.equal(N.nativeAppTagsFrom({}), null);
  assert.equal(N.nativeAppTagsFrom({ version: "1.2.0" }), null);
  assert.equal(N.nativeAppTagsFrom({ version: "", build: "13" }), null);
  assert.equal(N.nativeAppTagsFrom({ version: "1.2.0 <script>", build: "13" }), null);
  assert.equal(N.nativeAppTagsFrom({ version: "1".repeat(40), build: "13" }), null);
});

await check("outside the native shell, loading resolves to no tags", async () => {
  assert.equal(await N.loadNativeAppTags(50), null);
});

await check("browser events carry no native tags", () => {
  A.setNativeTagsForAnalytics(null);
  const out = A.beforeSend({ event: "$pageview", properties: { platform: "web" } } as any);
  assert.equal("native_app_version" in out.properties, false);
  assert.equal("native_build" in out.properties, false);
});

await check("native events, $exception included, carry both tags beside app_version", () => {
  A.setNativeTagsForAnalytics({ native_app_version: "1.2.0", native_build: "13" });
  for (const event of ["$pageview", "$exception", "weight_logged"]) {
    const out = A.beforeSend({ event, properties: { app_version: "1.0.0", platform: "ios" } } as any);
    assert.equal(out.properties.native_app_version, "1.2.0", event);
    assert.equal(out.properties.native_build, "13", event);
    assert.equal(out.properties.app_version, "1.0.0", event);
    assert.equal(out.properties.platform, "ios", event);
  }
  A.setNativeTagsForAnalytics(null);
});

await check("a dropped event stays dropped", () => {
  A.setNativeTagsForAnalytics({ native_app_version: "1.2.0", native_build: "13" });
  assert.equal(A.beforeSend(null), null);
  A.setNativeTagsForAnalytics(null);
});

console.log(`\n${passed} passed${process.exitCode ? ", some FAILED" : ""}`);

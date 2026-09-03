import type { CapacitorConfig } from '@capacitor/cli';

// Native shell for the App Store / Play Store builds.
// v1 runs in remote-URL mode: the shell loads the production web app, so
// native releases pick up web deploys instantly. The PWA is unaffected —
// nothing in this file (or ios/ / android/) participates in the Vercel build.
const config: CapacitorConfig = {
  appId: 'com.thekyaproject.app',
  appName: 'Kya',
  // Required field; only used if we later switch to bundling the client
  // locally. In remote-URL mode the shell never reads it.
  webDir: '.vercel/output/static',
  server: {
    url: 'https://app.thekyaproject.com',
  },
  plugins: {
    // Kya signs in with Google and Apple only. The Facebook provider is unused,
    // and on Android its SDK (com.facebook.android:facebook-login) transitively
    // pulls facebook-core plus five advertising permissions the app never uses.
    // Disabling it here drives @capgo/capacitor-social-login's cap-sync hook to
    // set socialLogin.facebook.include=false, which drops the Facebook SDK and
    // swaps in the plugin's stub FacebookProvider (no com.facebook.* ships).
    // NOTE: the hook writes this into the plugin's node_modules gradle.properties,
    // so `npx cap sync android` MUST run after any `npm install` and before
    // `./gradlew bundleRelease`, or Facebook re-enables. iOS is unaffected — the
    // SPM manifest links FBSDK unconditionally and no hook removes it there.
    SocialLogin: {
      providers: {
        facebook: false,
      },
    },
  },
};

export default config;

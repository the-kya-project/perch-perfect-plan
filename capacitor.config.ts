import type { CapacitorConfig } from '@capacitor/cli';

// Native shell for the App Store / Play Store builds.
// v1 runs in remote-URL mode: the shell loads the production web app, so
// native releases pick up web deploys instantly. The PWA is unaffected —
// nothing in this file (or ios/ / android/) participates in the Vercel build.
const config: CapacitorConfig = {
  appId: 'com.thekyaproject.app',
  appName: 'Kya & Co.',
  // Required field; only used if we later switch to bundling the client
  // locally. In remote-URL mode the shell never reads it.
  webDir: '.vercel/output/static',
  server: {
    url: 'https://app.thekyaproject.com',
    // Marks every request from the installed app (Vercel logs, email click
    // logs, anything reading user-agent), which otherwise looks exactly like
    // a mobile browser. Takes effect with the next store build.
    appendUserAgent: 'KyaApp',
  },
  ios: {
    // The web view's color before the first page paints: the forest of the
    // launch screen (LaunchBackground) and the web splash, so launch shows no
    // white flash between them. Capacitor turns off the web view's bounce, so
    // this never shows behind a loaded page.
    backgroundColor: '#1a3d2e',
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
    // `./gradlew bundleRelease`, or Facebook re-enables. Since plugin 8.7 the
    // hook does the same for iOS (the plugin's Package.swift and podspec), so
    // run `npx cap sync ios` after any `npm install` and before archiving too.
    SocialLogin: {
      providers: {
        facebook: false,
      },
    },
  },
};

export default config;

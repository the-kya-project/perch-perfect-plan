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
};

export default config;

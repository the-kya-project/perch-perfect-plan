/**
 * No-op replacement for `@supabase/realtime-js`.
 *
 * This app never opens a realtime channel (no `supabase.channel(...)` / no
 * `.subscribe()` anywhere — verified). But `@supabase/supabase-js` always
 * `import {RealtimeClient}`s it and constructs one in its client constructor,
 * pulling realtime-js + its phoenix websocket dependency (~54KB minified) into
 * the main bundle that loads on every screen.
 *
 * A Vite `resolve.alias` points `@supabase/realtime-js` here so that weight is
 * dropped. This is safe: the only thing supabase-js calls automatically is
 * `realtime.setAuth(token)` on auth changes, which merely forwards the token to
 * the (unused) websocket layer. Auth token refresh itself is handled entirely
 * by `@supabase/auth-js` (`autoRefreshToken: true`) and is independent of this.
 *
 * If realtime is ever genuinely needed, delete the alias in vite.config.ts.
 */

const noop = () => {};

// A channel object whose builder methods chain and whose lifecycle methods are
// inert — so any accidental `.channel(...).on(...).subscribe()` won't throw.
function makeChannel() {
  const channel: any = {
    on: () => channel,
    subscribe: (cb?: (status: string) => void) => {
      // Report "closed" rather than pretending to connect.
      if (cb) cb("CLOSED");
      return channel;
    },
    unsubscribe: () => Promise.resolve("ok"),
    send: () => Promise.resolve("ok"),
    track: () => Promise.resolve("ok"),
    untrack: () => Promise.resolve("ok"),
    presenceState: () => ({}),
    topic: "",
  };
  return channel;
}

export class RealtimeClient {
  accessTokenValue: string | null = null;
  channels: any[] = [];
  constructor(_endPoint?: string, _options?: unknown) {}
  connect() {}
  disconnect() {}
  // Called by supabase-js on every auth change; intentionally inert.
  setAuth(token?: string | null) {
    this.accessTokenValue = token ?? null;
    return Promise.resolve();
  }
  channel(_topic?: string, _params?: unknown) {
    return makeChannel();
  }
  removeChannel(_channel?: unknown) {
    return Promise.resolve("ok");
  }
  removeAllChannels() {
    return Promise.resolve([] as string[]);
  }
  getChannels() {
    return [] as any[];
  }
  onOpen = noop;
  onClose = noop;
  onError = noop;
  onMessage = noop;
}

// Harmless named exports so supabase-js's `export * from "@supabase/realtime-js"`
// re-export surface stays intact for any consumer that references them.
export class RealtimeChannel {}
export class RealtimePresence {}
export const REALTIME_LISTEN_TYPES = {} as Record<string, string>;
export const REALTIME_SUBSCRIBE_STATES = {} as Record<string, string>;
export const REALTIME_CHANNEL_STATES = {} as Record<string, string>;
export const REALTIME_PRESENCE_LISTEN_EVENTS = {} as Record<string, string>;

export default RealtimeClient;

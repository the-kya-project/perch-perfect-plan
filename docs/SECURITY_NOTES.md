# Security notes

Short, dated records of security-relevant incidents and the standing rules that came out of them. Newest first.

## 2026-10-10 — Link tokens and sign-in tokens reached PostHog

### The rule

**Any route with a secret in its path must be added to the URL scrubber and its test.**

- Scrubber: `TOKEN_PATH_RULES` in `src/lib/urlScrub.ts`
- Test: `TOKEN_ROUTES` in `scripts/url-scrub.test.ts` (`npm run test:url-scrub`)

"Secret" means anything that grants access by itself: an invite or share token, a signature, a one-time code. Do both in the same PR that adds the route. The scrubber is applied to PostHog events and person properties (`sanitize_properties` and `before_send` in `src/lib/analytics.ts`) and to first-touch attribution (`src/lib/attribution.ts`), which is copied to `profiles.signup_*` and to Brevo `SIGNUP_*` attributes.

The same applies to any new place a URL is sent to a third party: pass it through `scrubUrl` first.

### What leaked

PostHog was capturing full URLs, and the existing scrubber only handled URL fragments and query parameters.

| What | Where it was stored | Volume | Window |
|---|---|---|---|
| Sitter link tokens (`/sitter/<token>`) | `$current_url`, `$pathname`, session-entry URL, previous-pageview path, `$set_once` | 264 events, 18 tokens | 20 Jul – 8 Oct 2026 |
| Household invite token (`/invite/<token>`) | same | 2 events, 1 token | 20 Jul 2026 |
| Supabase access + refresh tokens (`/welcome#access_token=…`) | `$current_url`, `$initial_current_url` | 37 events, 4 person profiles, 11 refresh tokens | 17 – 23 Jul 2026 (before the fragment scrubber existed) |
| Signed bird-photo URLs (Storage `?token=<JWT>`) | web-vitals LCP attribution | 4 events | 15 Sep – 8 Oct 2026 |
| Invite tokens in signup attribution | `profiles.signup_landing_page` and Brevo `SIGNUP_LANDING_PAGE` | 2 profiles | 30 Jun – 2 Jul 2026 |

No `/handoff/<token>` values were found. Exposure was limited to people with access to PostHog project 516103 (one member, the owner, at the time of the audit).

### What was fixed

- PR #308 (deployed 2026-10-10): `src/lib/urlScrub.ts` replaces token path segments with fixed placeholders (`/sitter/[token]`, `/invite/[token]`, `/handoff/[token]`, and the signed `/api/public/chart` and `/api/public/unsubscribe` links), redacts token-like query parameters, and redacts anything JWT-shaped. It runs on every string in the payload, not a list of known keys.
- Verified in production: events captured after the deploy store `/sitter/[token]`, `/invite/[token]` and `/handoff/[token]`.
- The 3 exposed refresh tokens that were still valid were revoked by deleting their sessions; each was then confirmed rejected by the auth endpoint (`refresh_token_not_found`).
- The token-bearing properties were removed from the 5 affected PostHog person profiles.
- Stored PostHog events were deliberately left in place. PostHog has no self-serve way to delete individual events or strip one property from them; the credentials in them are expired or revoked.

### How to re-run the audit

In PostHog SQL, search the serialized properties rather than individual keys, because PostHog adds URL-bearing properties under names we do not control:

```sql
SELECT event, count()
FROM events
WHERE timestamp >= now() - INTERVAL 30 DAY
  AND (match(toString(properties), '(?i)(?:/|%2F)(sitter|invite|handoff)(?:/|%2F)[A-Za-z0-9_-]{20,}')
       OR match(toString(properties), 'eyJ[A-Za-z0-9_-]{20,}[.][A-Za-z0-9_-]{20,}'))
GROUP BY event
```

A non-zero result after 2026-10-10 means a new leak path. To check whether an exposed token is still live without copying it around, compare hashes: `hex(MD5(token))` in PostHog against `md5(token)` in Postgres.

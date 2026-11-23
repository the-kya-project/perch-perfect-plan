// Server-ONLY push notification copy, localized per recipient.
//
// Push titles/bodies are built in cron routes and server functions, so they use
// the same server-only `emails` i18n instance as transactional email (keys under
// `push.*` in src/locales/emails.*.jsonc) — nothing here reaches the client
// bundle. Pass the RECIPIENT's locale (localeForUser); unknown/null → English,
// and the English output is byte-identical to the old hardcoded literals.

import { emailT } from "./i18n/emailI18n.server";

type PushCopy = { title: string; body: string };

/** Care plan reminder (owner, sit starting soon, plan stale). */
export function carePlanReminderPush(locale: unknown, birdName: string | null | undefined): PushCopy {
  const t = emailT(locale);
  return {
    title: t("push.carePlanReminder.title"),
    body: t("push.carePlanReminder.body", { birdName: birdName ?? t("push.common.yourBirdCap") }),
  };
}

/** Weight nudge — the bird is past the owner's usual weigh-in rhythm. */
export function weightReminderPush(locale: unknown, birdName: string | null | undefined, daysSince: number): PushCopy {
  const t = emailT(locale);
  return {
    title: t("push.weightReminder.title"),
    body: t("push.weightReminder.body", { birdName: birdName ?? t("push.common.yourBirdCap"), n: daysSince }),
  };
}

/** Check-in nudge. Stage 10 = first gentle touch; stage 30 = the last one. */
export function checkinReminderPush(locale: unknown, birdName: string | null | undefined, stage: 10 | 30): PushCopy {
  const t = emailT(locale);
  if (stage === 10) {
    return {
      title: t("push.checkin10.title"),
      body: t("push.checkin10.body", { birdName: birdName ?? t("push.common.yourBird") }),
    };
  }
  const name = birdName ?? t("push.common.yourBird");
  return {
    title: t("push.checkin30.title", { birdName: name }),
    body: t("push.checkin30.body", { birdName: name }),
  };
}

/**
 * Weekly recap (src/lib/weeklyRecap.ts). `birdNames` are the account's living
 * birds: one name titles it "<bird>'s week", several say "Your flock's week".
 * Counts only, never a weight or a result. A quiet week is the gentle nudge.
 */
export function weeklyRecapPush(
  locale: unknown,
  birdNames: Array<string | null>,
  kind: "week" | "quiet",
  counts: { weighIns: number; healthChecks: number; journalEntries: number },
): PushCopy {
  const t = emailT(locale);
  const one = birdNames.length === 1;
  const birdName = birdNames[0] ?? t("push.common.yourBirdCap");
  const title = one ? t("push.weeklyRecap.titleOne", { birdName }) : t("push.weeklyRecap.titleMany");
  if (kind === "quiet") {
    return {
      title,
      body: one ? t("push.weeklyRecap.quietOne", { birdName }) : t("push.weeklyRecap.quietMany"),
    };
  }
  const item = (n: number, key: string) => (n === 1 ? t(`${key}One`) : t(key, { n }));
  const items = [
    counts.weighIns > 0 ? item(counts.weighIns, "push.weeklyRecap.weighIns") : null,
    counts.healthChecks > 0 ? item(counts.healthChecks, "push.weeklyRecap.checks") : null,
    counts.journalEntries > 0 ? item(counts.journalEntries, "push.weeklyRecap.journal") : null,
  ].filter((s): s is string => !!s);
  const list =
    items.length === 1 ? items[0]
    : items.length === 2 ? t("push.weeklyRecap.list2", { a: items[0], b: items[1] })
    : t("push.weeklyRecap.list3", { a: items[0], b: items[1], c: items[2] });
  return { title, body: t("push.weeklyRecap.body", { list }) };
}

/** "Whoever is covering flagged something serious" — always-on, urgent. */
export function sitterConcernPush(locale: unknown, coveringLabel: string, birdName: string): PushCopy {
  const t = emailT(locale);
  return {
    title: t("push.sitterConcern.title", { coveringLabel }),
    body: t("push.sitterConcern.body", { coveringLabel, birdName }),
  };
}

/** A sitter's daily health check: flagged (red/yellow) or all clear. */
export function scanPush(locale: unknown, status: "red" | "yellow" | "green", birdName: string): PushCopy {
  const t = emailT(locale);
  if (status === "red") return { title: t("push.scan.redTitle"), body: t("push.scan.redBody", { birdName }) };
  if (status === "yellow") return { title: t("push.scan.yellowTitle"), body: t("push.scan.yellowBody", { birdName }) };
  return { title: t("push.scan.clearTitle"), body: t("push.scan.clearBody", { birdName }) };
}

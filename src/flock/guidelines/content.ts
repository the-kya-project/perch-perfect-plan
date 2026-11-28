// The Flock's community guidelines: the one source for every word of them.
// The three-screen walk-through (src/components/flock/GuidelinesWalkthrough.tsx),
// its six promises, and the full guidelines page (/flock/guidelines, also the
// box on the join step) all read from here. Flock code only.
//
// GUIDELINES_VERSION must equal public.current_guidelines_version()
// (supabase/migrations/20261128180000_flock_guideline_agreements.sql).
// BUMPING THE VERSION, here and there together, makes every member see the
// walk-through again and stops their posting until they agree to it.
// scripts/flock-shell.test.ts checks the two match.
//
// Copy approved by Brittany, Nov 28, 2026 (docs/mockups/flock-guidelines-agreement/).
import type { TFunction } from "i18next";
import { FLOCK_CONTACT_EMAIL } from "@/lib/flockGuidelines";

export { GUIDELINES_VERSION, WALKTHROUGH_STEPS } from "./version";
import { WALKTHROUGH_STEPS } from "./version";

export { FLOCK_CONTACT_EMAIL };

// ---- The walk-through ------------------------------------------------------------

export type IconKey = "researchers" | "conservationists" | "owners" | "bowl" | "feather" | "house" | "heart" | "speech" | "flag" | "plus" | "lock";

export function walkthroughProgress(t: TFunction, step: number): string {
  return t("flock.walkthrough.progress", "{{step}} of {{total}}", { step, total: WALKTHROUGH_STEPS });
}

export function walkthroughScreen1(t: TFunction) {
  return {
    title: t("flock.walkthrough.one.title", "Welcome to the Flock"),
    line: t("flock.walkthrough.one.line", "Before you join, here's a quick look at what we're all about."),
    bridgeTitle: t("flock.walkthrough.one.bridgeTitle", "Bridging research and life with birds"),
    communities: [
      { icon: "researchers" as IconKey, label: t("flock.walkthrough.one.researchers", "Researchers") },
      { icon: "conservationists" as IconKey, label: t("flock.walkthrough.one.conservationists", "Conservationists") },
      { icon: "owners" as IconKey, label: t("flock.walkthrough.one.owners", "Parrot owners") },
    ],
    bridgeBody: t("flock.walkthrough.one.bridgeBody", "The Flock brings these communities together. Our care recommendations come from avian research and veterinary science, and our mission is a place where all of us collaborate."),
    advocateTitle: t("flock.walkthrough.one.advocateTitle", "What we advocate for"),
    advocate: [
      { icon: "bowl" as IconKey, title: t("flock.walkthrough.one.dietTitle", "A varied, fresh diet"),
        body: t("flock.walkthrough.one.diet", "We advocate for fresh foods and a quality pellet.") },
      { icon: "feather" as IconKey, title: t("flock.walkthrough.one.flightTitle", "Fully flighted birds"),
        body: t("flock.walkthrough.one.flight", "Research shows how beneficial flight is for birds, so we advocate for keeping them flighted whenever possible.") },
      { icon: "house" as IconKey, title: t("flock.walkthrough.one.husbandryTitle", "Good husbandry"),
        body: t("flock.walkthrough.one.husbandry", "That means an appropriately sized cage, daily enrichment, plenty of foraging, and time out of the cage.") },
      { icon: "heart" as IconKey, title: t("flock.walkthrough.one.trainingTitle", "Positive reinforcement training"),
        body: t("flock.walkthrough.one.training", "Research shows it's the best way to train and bond with a bird. We don't advocate for dominance or punishment-based methods.") },
    ],
    tableTitle: t("flock.walkthrough.one.tableTitle", "Most importantly, we're building a bigger table"),
    tableBody: t("flock.walkthrough.one.tableBody", "We separate the issue from the person. We're all still learning, so wherever you and your bird are today, you're welcome here."),
  };
}

export function walkthroughScreen2(t: TFunction) {
  return {
    title: t("flock.walkthrough.two.title", "How we look after each other"),
    line: t("flock.walkthrough.two.line", "This is what makes the Flock different."),
    rows: [
      { icon: "speech" as IconKey, title: t("flock.walkthrough.two.feedbackTitle", "We give feedback only when it's asked for"),
        body: t("flock.walkthrough.two.feedback", "If someone asks, \"What do you think of my setup?\", share kind, honest ideas. If someone just shares a photo of their bird, celebrate the bird, and please don't pile on in the comments.") },
      { icon: "flag" as IconKey, title: t("flock.walkthrough.two.flagTitle", "We flag it instead of calling it out"),
        body: t("flock.walkthrough.two.flag", "If something someone shares worries you, tap flag. The Kya team reviews every single one and reaches out privately, so nobody gets corrected in front of everyone.") },
      { icon: "plus" as IconKey, title: t("flock.walkthrough.two.vetTitle", "Health questions go to your vet"),
        body: t("flock.walkthrough.two.vet", "We never give medical advice here. You're welcome to share what's worked for you, but none of us are avian vets, and posts that give medical advice will be taken down.") },
      { icon: "lock" as IconKey, title: t("flock.walkthrough.two.privateTitle", "What you share stays here"),
        body: t("flock.walkthrough.two.private", "We never feature your posts or photos anywhere else without asking you first.") },
    ],
  };
}

export function walkthroughScreen3(t: TFunction) {
  return {
    title: t("flock.walkthrough.three.title", "Our promises to each other"),
    line: t("flock.walkthrough.three.line", "This is what every member agrees to before coming in."),
    promises: promises(t),
    readFull: t("flock.walkthrough.three.readFull", "Read the full guidelines →"),
    agree: t("flock.walkthrough.three.agree", "I agree, take me to the Flock"),
    saving: t("flock.walkthrough.three.saving", "Saving…"),
    failed: t("flock.walkthrough.three.failed", "We couldn't save that just now. Check your connection and tap the button again."),
  };
}

/** The six promises every member agrees to (walk-through screen 3). */
export function promises(t: TFunction): string[] {
  return [
    t("flock.walkthrough.promise1", "I'll be kind, and I'll give feedback only when someone asks for it."),
    t("flock.walkthrough.promise2", "I'll flag anything that worries me instead of calling someone out."),
    t("flock.walkthrough.promise3", "I'll follow science-based care and positive reinforcement training when I share."),
    t("flock.walkthrough.promise4", "I'll take health questions to an avian vet."),
    t("flock.walkthrough.promise5", "I won't sell, trade, or breed birds here."),
    t("flock.walkthrough.promise6", "I understand that harassment and harmful content mean removal from the Flock."),
  ];
}

export function walkthroughLabels(t: TFunction) {
  return {
    next: t("flock.walkthrough.next", "Next"),
    back: t("flock.walkthrough.back", "Back"),
    close: t("flock.walkthrough.close", "Close"),
  };
}

/** "Questions? Write to brittany@thekyaproject.com": split so the address can be a mail link. */
export function questionsLine(t: TFunction): { before: string; after: string } {
  const full = t("flock.guidelines.questions", "Questions? Write to {{email}}", { email: FLOCK_CONTACT_EMAIL });
  const [before, after = ""] = full.split(FLOCK_CONTACT_EMAIL);
  return { before, after };
}

// ---- The full guidelines --------------------------------------------------------

export type GuidelineBlock =
  | { kind: "p"; text: string }
  /** A paragraph that opens with a bold sentence. */
  | { kind: "lead"; lead: string; text?: string }
  | { kind: "list"; items: string[] };

export type GuidelineSection = { key: string; title: string; blocks: GuidelineBlock[] };

export function fullGuidelines(t: TFunction): GuidelineSection[] {
  return [
    {
      key: "believe",
      title: t("flock.rules.believe.title", "What we believe"),
      blocks: [
        { kind: "p", text: t("flock.rules.believe.intro", "The Flock is a place to get better at caring for parrots, together. These beliefs shape everything else on this page.") },
        { kind: "lead", lead: t("flock.rules.believe.bridgeLead", "We're bridging research and life with birds."),
          text: t("flock.rules.believe.bridge", "The Flock brings researchers, conservationists, and parrot owners together. Our care recommendations come from avian research and veterinary science, and our mission is a place where all of us collaborate.") },
        { kind: "lead", lead: t("flock.rules.believe.standardsLead", "A few things are non-negotiable for us, because the research is clear.") },
        { kind: "list", items: [
          t("flock.rules.believe.diet", "We advocate for a varied, fresh diet built on fresh foods and a quality pellet."),
          t("flock.rules.believe.flight", "Research shows how beneficial flight is for birds, so we advocate for keeping them fully flighted whenever possible."),
          t("flock.rules.believe.husbandry", "We advocate for good husbandry, which means an appropriately sized cage, daily enrichment, plenty of foraging, and time out of the cage."),
          t("flock.rules.believe.training", "We train with positive reinforcement, because research shows it's the best way to train and bond with a bird. We don't advocate for dominance or punishment-based methods."),
          t("flock.rules.believe.basics", "Parrots also need 10 to 12 hours of quiet, dark sleep, clean air (no nonstick cookware, aerosols, or scented candles near them), and daily social time with their people."),
        ] },
        { kind: "lead", lead: t("flock.rules.believe.tableLead", "Most importantly, we're building a bigger table."),
          text: t("flock.rules.believe.table", "We separate the issue from the person. Most of us didn't know all of this when we started, and all of us are still learning. Parrots aren't domesticated the way dogs and cats are, so we're figuring out how to do better together. Wherever you and your bird are today, you're welcome here, and if you're committed to doing better, we want you in the Flock.") },
        { kind: "lead", lead: t("flock.rules.believe.vetLead", "Health questions go to an avian vet."),
          text: t("flock.rules.believe.vet", "We never give medical advice here. You're welcome to share what's worked for you, but none of us are avian vets, and posts that give medical advice will be taken down.") },
        { kind: "lead", lead: t("flock.rules.believe.wildLead", "Caring for the bird at home is connected to protecting parrots in the wild."),
          text: t("flock.rules.believe.wild", "That's why part of every membership goes to rescue and conservation partners, and why we choose those partners together.") },
      ],
    },
    {
      key: "works",
      title: t("flock.rules.works.title", "How the Flock works"),
      blocks: [
        { kind: "list", items: [
          // Flock talk was "Learn together" until backlog CR1 (a label
          // change; the slug stays `learn`).
          t("flock.rules.works.spaces", "Start here is for introductions and getting your bearings. Flock talk is for questions, setups, and what you're working on. Do good is for rescue and conservation needs, and posts there are reviewed before they go live."),
          t("flock.rules.works.journeys", "Journeys are where members share the skills they're teaching their birds, along with what's working and what isn't."),
          t("flock.rules.works.chapter", "Your chapter is your local corner of the Flock. If a bird is lost or found near you, post it there right away. Please share the general area only, never your home address or your bird's leg band or microchip number."),
          t("flock.rules.works.flagging", "Flagging is how we keep the Flock kind. If something looks harmful, unkind, or out of line with the care standards above, flag it and add a note if you'd like. You don't need to correct anyone yourself."),
          t("flock.rules.works.review", "The Kya team reviews every flag. Harmful content is handled within 24 hours. When a post goes against our care standards, someone from the Kya team reaches out to that member privately, never with a public correction."),
          t("flock.rules.works.private", "What you share stays in the Flock. We'll never feature your posts, photos, or videos anywhere else without asking you first."),
          t("flock.rules.works.contact", "Questions or concerns about the community can always go to the Kya team at {{email}}.", { email: FLOCK_CONTACT_EMAIL }),
        ] },
      ],
    },
    {
      key: "treat",
      title: t("flock.rules.treat.title", "How we treat each other"),
      blocks: [
        { kind: "p", text: t("flock.rules.treat.intro", "This is the heart of the Flock. It's what makes this place different from the groups many of us left.") },
        { kind: "list", items: [
          t("flock.rules.treat.kind", "Be kind in the comments. Talk to people the way you'd want someone to talk to you on a hard day with your bird."),
          t("flock.rules.treat.feedback", "Give feedback when it's asked for. If someone posts \"What do you think of my setup?\", thoughtful, constructive feedback is welcome. If someone just shares a photo of their bird, celebrate the bird. If something in it worries you, flag it and let the Kya team follow up privately."),
          t("flock.rules.treat.experience", "Share your own experience. \"Here's what helped when we switched off seeds\" teaches more than \"you're doing it wrong.\" Talk about what worked for you rather than telling someone what they have to do."),
          t("flock.rules.treat.intent", "Assume good intent. Nearly everyone here is trying to do right by their bird, including the people who are newest to this."),
          t("flock.rules.treat.pileOn", "Never pile on. If you see someone getting a lot of critique, don't add to it. Flag it if it's gone too far."),
          t("flock.rules.treat.privacy", "Respect privacy. Don't share someone else's personal details, location, or messages, and don't screenshot posts to share outside the Flock."),
        ] },
      ],
    },
    {
      key: "rules",
      title: t("flock.rules.rules.title", "The rules"),
      blocks: [
        { kind: "p", text: t("flock.rules.rules.intro", "These are the firm lines. We have zero tolerance for harassment, hateful content, or anything that harms people or animals.") },
        { kind: "list", items: [
          t("flock.rules.rules.harassment", "No harassment, bullying, threats, or hateful content toward anyone, for any reason."),
          t("flock.rules.rules.harm", "No content showing or encouraging harm to an animal, including punishment-based training like hitting, yelling, spraying, \"dominance\" techniques, or withholding food to force a behavior."),
          t("flock.rules.rules.clipping", "No how-to content for wing clipping, and no posts encouraging others to clip. Sharing your own bird's history is fine."),
          t("flock.rules.rules.medical", "No diagnosing another member's bird or recommending medications or doses. Share your own experience, and if something sounds urgent, tell them to call an avian vet now."),
          t("flock.rules.rules.selling", "No selling, trading, or breeding birds, and no posts asking where to buy one. If you need to rehome a bird, the Kya team will point you to a partner rescue."),
          t("flock.rules.rules.personal", "No sharing anyone's personal information, including addresses, phone numbers, and private messages."),
          t("flock.rules.rules.spam", "No spam, affiliate links, or business promotion. You can recommend products you love, and fundraising belongs in Do good, where it's reviewed first."),
          t("flock.rules.rules.objectionable", "No sexual, graphic, or otherwise objectionable content."),
          t("flock.rules.rules.age", "Members must be 18 or older."),
        ] },
        { kind: "lead", lead: t("flock.rules.rules.brokenLead", "What happens when a rule is broken."),
          text: t("flock.rules.rules.broken", "Most of the time, it starts with a private note from the Kya team. If it keeps happening, the content comes down, then the member's account is paused for 30 days, and after that they're removed from the Flock. Harassment, hateful content, animal cruelty, sharing someone's personal information, and selling birds lead straight to removal. Anyone removed from the Flock gets a refund for the unused part of their membership.") },
      ],
    },
  ];
}

import { useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronRight, Compass, Mail, MessageSquareWarning } from "lucide-react";
import { K, KyaGroupLabel, KyaHeading, KyaIconTile, KyaLink, KyaSheet } from "@/components/kya";
import { SUPPORT_EMAIL } from "@/lib/support";

// The "?" help sheet: replay the tour, quick answers that open in place, ways
// to reach us, and a pointer to emergency info for a bird in trouble now.

function AnswerRow({ question, answer, open, onToggle, last }: { question: string; answer: string; open: boolean; onToggle: () => void; last?: boolean }) {
  return (
    <div style={{ borderBottom: last ? undefined : `1px solid ${K.line}` }}>
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="flex min-h-[44px] w-full items-center gap-3 px-4 py-3 text-left active:bg-black/[0.03]"
        style={{ color: K.forest }}
      >
        <span className="min-w-0 flex-1 text-[15px] font-[700]">{question}</span>
        <ChevronDown className="size-[18px] shrink-0 transition-transform duration-200" style={{ color: K.quiet, transform: open ? "rotate(180deg)" : undefined }} aria-hidden="true" />
      </button>
      {open && <p className="m-0 px-4 pb-4 text-[14px] leading-[1.5]" style={{ color: K.ink }}>{answer}</p>}
    </div>
  );
}

function ContactRow({ href, icon, title, detail, last }: { href: string; icon: ReactNode; title: string; detail: string; last?: boolean }) {
  return (
    <a
      href={href}
      className="flex min-h-[56px] w-full items-center gap-3 px-4 py-2.5 text-left active:bg-black/[0.03]"
      style={{ borderBottom: last ? undefined : `1px solid ${K.line}`, color: K.forest }}
    >
      <KyaIconTile size={36}>{icon}</KyaIconTile>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-[700]">{title}</span>
        <span className="mt-0.5 block text-[13px]" style={{ color: K.quiet }}>{detail}</span>
      </span>
      <ChevronRight className="size-[18px] shrink-0" style={{ color: K.quiet }} aria-hidden="true" />
    </a>
  );
}

export function HelpSheet({ open, onClose, onTakeTour }: { open: boolean; onClose: () => void; onTakeTour: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [openId, setOpenId] = useState<string | null>(null);

  const answers = [
    {
      id: "sits",
      q: t("help.sitsQuestion", "How do sits work?"),
      a: t("help.sitsAnswer", "Set up a sit when someone else is caring for your birds. Household members already have access. Anyone else gets a private link by email, no account needed. During the sit they see the day's routine, do a daily health check for each bird, and have your emergency info one tap away. You'll see everything they log."),
    },
    {
      id: "check",
      q: t("help.checkQuestion", "What's the daily health check for?"),
      a: t("help.checkAnswer", "It's a quick once-over: how your bird looks, eats, breathes, and acts. Birds tend to hide illness, so small changes you notice over a few days can be the first sign something's off. It's a record you can share with your vet, not a diagnosis."),
    },
    {
      id: "weigh",
      q: t("help.weighQuestion", "How do I weigh my bird?"),
      a: t("help.weighAnswer", "Use a gram scale with a perch or a small container. Weigh at about the same time each day, ideally in the morning before food, and log the number even when it looks the same. Slow changes are easier to see over a few weeks than from one day to the next."),
    },
    {
      id: "household",
      q: t("help.householdQuestion", "Household members vs. sitters"),
      a: t("help.householdAnswer", "Household members help every day and keep access until you remove them. Sitters cover a specific trip and only have access during that sit."),
    },
    {
      id: "privacy",
      q: t("help.privacyQuestion", "Is my information private?"),
      a: t("help.privacyAnswer", "Your birds' information is visible to you, the household members you invite, and anyone you send a sit link to. A sit link works from the day you create the sit until the sit ends, and you can revoke it anytime."),
    },
  ];

  const closeLabel = t("help.close", "Close");
  const title = t("help.title", "How can we help?");

  function seeEmergency() {
    onClose();
    // /account/emergency may not be in the generated route tree yet.
    navigate({ to: "/account/emergency" });
  }

  return (
    <KyaSheet open={open} onClose={onClose} closeLabel={closeLabel} title={<KyaHeading size={26}>{title}</KyaHeading>}>
      <div className="flex flex-col gap-4">
        <button
          type="button"
          onClick={onTakeTour}
          className="flex min-h-[64px] w-full items-center gap-3 rounded-[20px] px-4 py-3 text-left active:scale-[0.99]"
          style={{ background: K.lime, color: K.forest }}
        >
          <KyaIconTile><Compass className="size-5" /></KyaIconTile>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-[700]">{t("help.tourTitle", "Take the tour")}</span>
            <span className="mt-0.5 block text-[13px]" style={{ color: K.ink }}>{t("help.tourDetail", "Two minutes on what Kya & Co. can do")}</span>
          </span>
          <ChevronRight className="size-[18px] shrink-0" style={{ color: K.forest }} aria-hidden="true" />
        </button>

        <div className="flex flex-col gap-2">
          <KyaGroupLabel>{t("help.quickAnswers", "Quick answers")}</KyaGroupLabel>
          <div className="overflow-hidden rounded-[20px]" style={{ background: K.mist }}>
            {answers.map((item, i) => (
              <AnswerRow
                key={item.id}
                question={item.q}
                answer={item.a}
                open={openId === item.id}
                onToggle={() => setOpenId((cur) => (cur === item.id ? null : item.id))}
                last={i === answers.length - 1}
              />
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <KyaGroupLabel>{t("help.stillStuck", "Still stuck?")}</KyaGroupLabel>
          <div className="overflow-hidden rounded-[20px]" style={{ background: K.mist }}>
            <ContactRow
              href={`mailto:${SUPPORT_EMAIL}?subject=Kya%20%26%20Co.%20support`}
              icon={<Mail className="size-[18px]" />}
              title={t("help.emailTitle", "Email us")}
              detail={t("help.emailDetail", "We usually reply within a day")}
            />
            <ContactRow
              href={`mailto:${SUPPORT_EMAIL}?subject=Problem%20report`}
              icon={<MessageSquareWarning className="size-[18px]" />}
              title={t("help.reportTitle", "Report a problem")}
              detail={t("help.reportDetail", "Tell us what went wrong")}
              last
            />
          </div>
        </div>

        <div className="rounded-[20px] px-4 py-3" style={{ background: K.amberBg, color: K.amberText }}>
          <p className="m-0 text-[14px] font-[700] leading-[1.45]">{t("help.urgent", "Worried about your bird right now? Call your avian vet.")}</p>
          <KyaLink onClick={seeEmergency} color={K.amberText}>{t("help.seeEmergency", "See emergency info →")}</KyaLink>
        </div>
      </div>
    </KyaSheet>
  );
}

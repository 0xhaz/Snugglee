"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "motion/react";

import { NightSky } from "@/components/night-sky";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { buttonVariants } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

/** Slow, generous entrances. Nothing on a bedtime site should feel urgent. */
const rise = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0 },
};
const ease = [0.22, 1, 0.36, 1] as const;

const THEMES = [
  {
    src: "/stories/moon.jpg",
    title: "To the moon",
    blurb: "Up through the cloud fields, past a sleepy smiling moon.",
  },
  {
    src: "/stories/garden.jpg",
    title: "The firefly garden",
    blurb: "Just outside the back door, where the flowers close for the night.",
  },
  {
    src: "/stories/train.jpg",
    title: "The slow train",
    blurb: "A long unhurried journey through sleeping countryside.",
  },
];

const STEPS = [
  {
    n: "1",
    title: "Tell us their name",
    body: "That is all we ask for. No account, no sign-up, nothing else about your child.",
  },
  {
    n: "2",
    title: "Pick tonight's adventure",
    body: "One tap. The story starts in about ten seconds — because bedtime does not wait.",
  },
  {
    n: "3",
    title: "Add your voice",
    body: "Read one short paragraph aloud, once. Every story after that is read in your voice.",
  },
];

const FAQ = [
  {
    q: "What do you store about my child?",
    a: "Their first name, and roughly how old they are. That is all. There is no child account, no login, no photos and no location. We do not use advertising or tracking analytics.",
  },
  {
    q: "What happens to my recording?",
    a: "It is used once to create your voice and then deleted. We keep only a reference that lets us speak in your voice, and only for your account. If you delete your voice, we remove it from our systems and from the provider that generates the audio.",
  },
  {
    q: "How much does it cost?",
    a: "The first story is free. After that you buy small packs of stories — there is no subscription, and nothing renews on its own. Stories you have already made are always free to hear again, as many times as they ask.",
  },
  {
    q: "Can my child use it on their own?",
    a: "It is built for a parent to start and a child to listen to. Purchases sit behind a grown-up check, and there is nothing to tap during the story — it plays itself, and quietens as it goes.",
  },
  {
    q: "Does it work without internet?",
    a: "Stories you have already heard are saved on the phone, so they play in the car, on a plane, or at a grandparent's house with patchy signal.",
  },
];

/**
 * Live on the App Store since 2026-09-04.
 *
 * Android is NOT live yet — Play still needs its first manual release — so
 * every piece of copy on this page says iPhone now and Android later. Claiming
 * both would send Android visitors to a store listing that does not exist.
 */
const APP_STORE_URL = "https://apps.apple.com/us/app/snugglee/id6797722971";

export default function Home() {
  return (
    <>
      <SiteHeader />

      {/* ───────────────────────────── hero ───────────────────────────── */}
      <section className="relative overflow-hidden">
        <NightSky />

        <div className="relative z-10 mx-auto grid w-full max-w-6xl items-center gap-12 px-6 pt-10 pb-24 lg:grid-cols-2 lg:gap-16 lg:pt-20">
          <motion.div
            initial="hidden"
            animate="show"
            transition={{ staggerChildren: 0.14 }}
          >
            <motion.p
              variants={rise}
              transition={{ duration: 0.7, ease }}
              className="mb-5 text-sm font-semibold tracking-[0.18em] text-[#F2D18F] uppercase"
            >
              Bedtime stories
            </motion.p>

            <motion.h1
              variants={rise}
              transition={{ duration: 0.8, ease }}
              className="text-4xl leading-[1.1] font-extrabold tracking-tight text-balance text-white sm:text-5xl lg:text-6xl"
            >
              Your child is the hero.
              <br />
              <span className="text-[#9AA5D1]">You are the voice.</span>
            </motion.h1>

            <motion.p
              variants={rise}
              transition={{ duration: 0.8, ease }}
              className="mt-6 max-w-xl text-lg leading-relaxed text-[#B8C0E0]"
            >
              A bedtime story made for your child, read aloud in your own voice —
              even on the nights you cannot be there to read it yourself.
            </motion.p>

            <motion.div
              variants={rise}
              transition={{ duration: 0.8, ease }}
              className="mt-9 flex flex-wrap items-center gap-4"
            >
              {/*
                A plain anchor with the button styles rather than <Button asChild>.
                This shadcn build sits on Base UI, whose polymorphic escape hatch
                is `render`, not `asChild` — and for a link, the anchor is the
                honest element anyway.
              */}
              <a
                href={APP_STORE_URL}
                target="_blank"
                rel="noopener"
                className={buttonVariants({
                  size: "lg",
                  className:
                    "h-14 rounded-full bg-[#9AA5D1] px-8 text-base font-bold text-[#2C2C4D] hover:bg-[#B8C0E0]",
                })}
              >
                Download on the App Store
              </a>
              {/* Demoted to secondary now that there is somewhere to send people. */}
              <a
                href="#how"
                className="text-base font-semibold text-[#B8C0E0] underline-offset-4 hover:text-white hover:underline"
              >
                See how it works
              </a>
              <span className="w-full text-sm text-[#8F9AC6]">
                On iPhone and iPad. Android coming soon.
              </span>
            </motion.div>

            <motion.p
              variants={rise}
              transition={{ duration: 0.8, ease }}
              className="mt-8 text-sm text-[#8F9AC6]"
            >
              Your recording is never kept. Only your voice, only for you.
            </motion.p>
          </motion.div>

          {/* The artwork is the app's own — same illustrations, same palette. */}
          <motion.div
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1.1, ease }}
            className="relative mx-auto w-full max-w-md"
          >
            <div className="animate-floaty relative aspect-square overflow-hidden rounded-[36px] shadow-2xl ring-1 ring-white/10">
              <Image
                src="/stories/hero.jpg"
                alt="A child asleep on a cloud holding a small grey plush rabbit, beneath a crescent moon"
                fill
                priority
                sizes="(max-width: 1024px) 90vw, 420px"
                className="animate-drift object-cover"
              />
            </div>
          </motion.div>
        </div>
      </section>

      {/* ──────────────────────── the absent parent ──────────────────────── */}
      <section className="relative border-y border-white/10 bg-[#212C42]">
        <div className="mx-auto max-w-3xl px-6 py-20 text-center">
          <motion.blockquote
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.9, ease }}
            className="text-2xl leading-relaxed font-semibold text-balance text-white sm:text-3xl"
          >
            &ldquo;I cannot be there every night — but they can still hear
            me.&rdquo;
          </motion.blockquote>
          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.9, delay: 0.2, ease }}
            className="mx-auto mt-6 max-w-xl leading-relaxed text-[#B8C0E0]"
          >
            For parents working late or working away. For shift work, travel and
            deployment. For families split across time zones, and for
            grandparents in another country who still want to say goodnight.
          </motion.p>
        </div>
      </section>

      {/* ─────────────────────────── how it works ─────────────────────────── */}
      <section id="how" className="relative scroll-mt-8">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <motion.h2
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, ease }}
            className="text-center text-3xl font-extrabold tracking-tight text-white sm:text-4xl"
          >
            Three taps to a story
          </motion.h2>

          <div className="mt-16 grid gap-10 sm:grid-cols-3">
            {STEPS.map((s, i) => (
              <motion.div
                key={s.n}
                initial={{ opacity: 0, y: 26 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.7, delay: i * 0.12, ease }}
                className="text-center sm:text-left"
              >
                <div className="mx-auto mb-5 flex size-12 items-center justify-center rounded-full bg-[#42426E] text-lg font-bold text-[#F2D18F] sm:mx-0">
                  {s.n}
                </div>
                <h3 className="mb-2 text-xl font-bold text-white">{s.title}</h3>
                <p className="leading-relaxed text-[#B8C0E0]">{s.body}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ───────────────────────────── themes ───────────────────────────── */}
      <section className="relative border-y border-white/10 bg-[#2C3758]">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <motion.h2
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, ease }}
            className="text-center text-3xl font-extrabold tracking-tight text-white sm:text-4xl"
          >
            Somewhere gentle to go
          </motion.h2>
          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, delay: 0.15, ease }}
            className="mx-auto mt-4 max-w-xl text-center leading-relaxed text-[#B8C0E0]"
          >
            Every story winds down as it goes, so it is quietest at the end —
            when they are most likely to be asleep.
          </motion.p>

          <div className="mt-14 grid gap-8 sm:grid-cols-3">
            {THEMES.map((t, i) => (
              <motion.article
                key={t.title}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.7, delay: i * 0.12, ease }}
                className="group overflow-hidden rounded-[28px] bg-[#2C2C4D] ring-1 ring-white/10"
              >
                <div className="relative aspect-square overflow-hidden">
                  <Image
                    src={t.src}
                    alt={t.title}
                    fill
                    sizes="(max-width: 640px) 90vw, 340px"
                    className="object-cover transition-transform duration-[1200ms] ease-out group-hover:scale-105"
                  />
                </div>
                <div className="p-6">
                  <h3 className="text-lg font-bold text-white">{t.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-[#B8C0E0]">
                    {t.blurb}
                  </p>
                </div>
              </motion.article>
            ))}
          </div>
        </div>
      </section>

      {/* ───────────────────────────── the voice ───────────────────────────── */}
      <section className="relative">
        <div className="mx-auto grid max-w-6xl items-center gap-14 px-6 py-24 lg:grid-cols-2">
          <motion.div
            initial={{ opacity: 0, x: -24 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.8, ease }}
          >
            <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
              It really is your voice
            </h2>
            <p className="mt-5 leading-relaxed text-[#B8C0E0]">
              You read one short paragraph out loud, once. From then on, every
              story is read in your voice — the same warmth, the same way you say
              their name.
            </p>
            <ul className="mt-8 space-y-4">
              {[
                "Your recording is used once and then deleted. We never keep it.",
                "Only you can use your voice. It is never shared or exported.",
                "You can delete it at any time, and it is removed everywhere.",
              ].map((line) => (
                <li key={line} className="flex gap-3 text-[#B8C0E0]">
                  <span aria-hidden className="mt-0.5 text-[#9AA5D1]">
                    ✓
                  </span>
                  <span className="leading-relaxed">{line}</span>
                </li>
              ))}
            </ul>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.9, ease }}
            className="relative mx-auto w-full max-w-sm"
          >
            <div className="rounded-[32px] bg-[#212C42] p-8 ring-1 ring-white/10">
              <div className="mx-auto mb-7 flex size-24 items-center justify-center rounded-full bg-[#42426E]">
                <span aria-hidden className="text-4xl">
                  🎙️
                </span>
              </div>
              <p className="text-center text-lg leading-relaxed text-white">
                &ldquo;Goodnight, my love. The day is finished now…&rdquo;
              </p>
              <p className="mt-5 text-center text-sm text-[#8F9AC6]">
                About twenty seconds. Once.
              </p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ───────────────────────────── questions ───────────────────────────── */}
      <section className="relative border-t border-white/10 bg-[#212C42]">
        <div className="mx-auto max-w-3xl px-6 py-24">
          <h2 className="mb-12 text-center text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            Questions parents ask
          </h2>

          <Accordion className="w-full">
            {FAQ.map((item) => (
              <AccordionItem
                key={item.q}
                value={item.q}
                className="border-white/10"
              >
                <AccordionTrigger className="text-left text-base font-semibold text-white hover:no-underline sm:text-lg">
                  {item.q}
                </AccordionTrigger>
                <AccordionContent className="leading-relaxed text-[#B8C0E0]">
                  {item.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* ─────────────────────────────── close ─────────────────────────────── */}
      <section className="relative overflow-hidden">
        <NightSky count={26} />
        <div className="relative z-10 mx-auto max-w-2xl px-6 py-28 text-center">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.9, ease }}
            className="text-3xl font-extrabold tracking-tight text-balance text-white sm:text-4xl"
          >
            Goodnight, wherever you are
          </motion.h2>
          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.9, delay: 0.2, ease }}
            className="mt-5 leading-relaxed text-[#B8C0E0]"
          >
            Snugglee is on the App Store now. Android is on its way.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.9, delay: 0.3, ease }}
            className="mt-9"
          >
            <a
              href={APP_STORE_URL}
              target="_blank"
              rel="noopener"
              className={buttonVariants({
                size: "lg",
                className:
                  "h-14 rounded-full bg-[#F2D18F] px-9 text-base font-bold text-[#2C2C4D] hover:bg-[#F7DFAC]",
              })}
            >
              Download on the App Store
            </a>
            {/*
              The waitlist survives, narrowed to Android. Someone on a Pixel
              still has nothing to download, and a dead-end page is a lost user.
            */}
            <p className="mt-6 text-sm text-[#8F9AC6]">
              On Android?{" "}
              <a
                href="mailto:hello@snugglee.app?subject=Tell%20me%20when%20Snugglee%20is%20on%20Android"
                className="underline hover:text-white"
              >
                Tell me when it lands
              </a>
            </p>
          </motion.div>
          <p className="mt-10 text-sm text-[#8F9AC6]">
            <Link href="/privacy" className="underline hover:text-white">
              Privacy
            </Link>
            {" · "}
            <Link href="/terms" className="underline hover:text-white">
              Terms
            </Link>
          </p>
        </div>
      </section>

      <SiteFooter />
    </>
  );
}

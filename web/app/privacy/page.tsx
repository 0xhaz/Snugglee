import type { Metadata } from "next";

import { Bullets, LegalPage, Section } from "@/components/legal";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";

export const metadata: Metadata = {
  title: "Privacy — Snugglee",
  description:
    "What Snugglee collects, what happens to your voice recording, and how to delete everything.",
};

/**
 * Required by App Review, and specifically required to address voice
 * processing, the vendor sub-processor and retention — because the app records
 * biometric-adjacent data from an adult in a product used by children.
 *
 * Written to match what the software actually does. Every claim here is
 * enforced in code: raw recordings are never written to disk or a database,
 * deletion propagates to the provider before the local record clears, and the
 * only child data stored is a first name held on the device itself.
 */
export default function Privacy() {
  return (
    <>
      <SiteHeader />
      <LegalPage title="Privacy" updated="4 August 2026">
        <Section heading="The short version">
          <p>
            We collect as little as we possibly can. Your child&apos;s first name
            stays on your phone. Your voice recording is used once and deleted.
            We do not advertise to you, we do not track you, and we do not sell
            anything about you to anyone.
          </p>
        </Section>

        <Section heading="About your child">
          <p>
            Snugglee is made for a parent or guardian to use with their child. We
            do not create accounts for children and children do not sign in.
          </p>
          <p>We store:</p>
          <Bullets
            items={[
              "Their first name, so the story can be about them. This is kept on your device, not on our servers.",
              "Roughly how old they are, as an age range, so the story is written at the right level.",
            ]}
          />
          <p>
            That is all. No surname, no birthday, no photographs, no location, no
            contact details, and no device identifiers used for advertising.
          </p>
        </Section>

        <Section heading="Your voice recording">
          <p>
            If you choose to add your voice, you record yourself reading a short
            paragraph. Here is exactly what happens to it:
          </p>
          <Bullets
            items={[
              "The recording is sent to us over an encrypted connection.",
              "We pass it once to our speech provider, which creates a voice model.",
              "We store only a reference to that model. We do not keep the recording — not on our servers, not in a database, and not in any log.",
              "The copy on your phone is deleted as soon as it has been sent.",
            ]}
          />
          <p>
            Your voice is used only to narrate stories in your own account. It is
            never shared with other users, never exported, and never used to
            train anything.
          </p>
          <p>
            If you delete your voice, we remove it from our systems and instruct
            our speech provider to delete their copy. We confirm their deletion
            before we clear our own record, so nothing is left behind.
          </p>
        </Section>

        <Section heading="Who else is involved">
          <p>
            Snugglee uses a small number of providers to work. They process data
            on our instructions only, and none of them receive your child&apos;s
            name.
          </p>
          <Bullets
            items={[
              "Google Cloud — hosting, sign-in and storage of your account and credit balance.",
              "Google (Gemini) — generates story text and illustrations.",
              "Cartesia and MiniMax — turn text into speech, including your voice model.",
              "RevenueCat — processes purchases. Payment details go to Apple or Google, never to us.",
            ]}
          />
          <p>
            We never see or store your card details. Apple and Google handle
            payment entirely.
          </p>
        </Section>

        <Section heading="Advertising and analytics">
          <p>
            There is none. Snugglee contains no advertising, no behavioural
            profiling, and no third-party tracking or fingerprinting. We measure
            basic things about how the app performs — such as whether a story
            started successfully — and none of it identifies you or your child.
          </p>
        </Section>

        <Section heading="Deleting your data">
          <p>You can delete everything from inside the app, under Privacy:</p>
          <Bullets
            items={[
              "Delete your voice — removes your voice model from us and from our speech provider.",
              "Delete your account — removes your voice, your stories and your remaining credits.",
            ]}
          />
          <p>
            Deletion is permanent and cannot be undone. Unused credits are not
            refundable once an account is deleted. If you would rather we did it
            for you, email{" "}
            <a
              href="mailto:privacy@snugglee.app"
              className="text-white underline"
            >
              privacy@snugglee.app
            </a>
            .
          </p>
        </Section>

        <Section heading="How long we keep things">
          <p>
            Your voice model and credit balance are kept until you delete them or
            your account. Stories are stored on your device and are removed when
            you delete the app. Records of purchases are retained where we are
            required to keep them for tax and accounting.
          </p>
        </Section>

        <Section heading="Where your data is handled">
          <p>
            Our servers are in Singapore and the United States. Our providers may
            process data in other countries. Wherever it goes, the same rules in
            this policy apply.
          </p>
        </Section>

        <Section heading="Your rights">
          <p>
            Depending on where you live, you may have the right to access,
            correct, export or delete your personal data, and to withdraw consent
            for voice processing at any time. Deleting your voice in the app
            withdraws that consent immediately. For anything else, email{" "}
            <a
              href="mailto:privacy@snugglee.app"
              className="text-white underline"
            >
              privacy@snugglee.app
            </a>
            .
          </p>
        </Section>

        <Section heading="Changes">
          <p>
            If we change this policy in a way that affects you, we will say so in
            the app before the change takes effect. We will never start using
            your voice for something new without asking you first.
          </p>
        </Section>

        <Section heading="Contact">
          <p>
            <a
              href="mailto:privacy@snugglee.app"
              className="text-white underline"
            >
              privacy@snugglee.app
            </a>
          </p>
        </Section>
      </LegalPage>
      <SiteFooter />
    </>
  );
}

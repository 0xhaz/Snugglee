/**
 * S-08 — paywall. Consumable credit packs only.
 *
 * D-02: **no subscription tier, ever.** A nightly-story user costs far more per
 * year than any annual price a parent would accept — a structural loss-maker.
 * Consumables align revenue with a marginal cost that is genuinely high.
 *
 * Prices come from the STORE, not from here. Hardcoded prices go stale the
 * moment Apple adjusts a tier or a parent opens the app in another currency,
 * and a paywall showing the wrong number is worse than one showing none.
 * Pricing rationale lives in the internal docs.
 */
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { AppText } from '../src/components/AppText';
import { PrimaryButton } from '../src/components/PrimaryButton';
import { Screen } from '../src/components/Screen';
import { config } from '../src/config';
import { buy, getPacks, restore, type Pack } from '../src/purchases';
import { getIdToken } from '../src/session';
import { radius, shell, space } from '../src/theme/tokens';

/**
 * Shown only until the store responds — never used to complete a purchase.
 * Real localised prices replace these as soon as offerings load.
 */
const FALLBACK = [
  { productId: 'com.snugglee.credits.3', credits: 3, priceString: '$2.99' },
  { productId: 'com.snugglee.credits.5', credits: 5, priceString: '$4.99' },
  { productId: 'com.snugglee.credits.20', credits: 20, priceString: '$19.99' },
];

export default function Paywall() {
  const router = useRouter();
  const [packs, setPacks] = useState<Pack[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [enrolled, setEnrolled] = useState<boolean | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    void getPacks().then(setPacks);
  }, []);

  /**
   * SECOND CHANCE at voice enrolment.
   *
   * The primary ask is S-04, at the end of the first story, because hearing
   * their own voice is what makes a parent buy — it is the aha moment AND the
   * paywall trigger (D-06). Enrolling only at purchase would move the magic to
   * *after* the decision it is supposed to cause.
   *
   * Shown BELOW the packs: an offer, not a toll. Buying never requires a voice.
   */
  useEffect(() => {
    (async () => {
      try {
        const token = await getIdToken();
        const res = await fetch(`${config.apiBaseUrl}/voice`, {
          headers: { authorization: `Bearer ${token}` },
        });
        const v = (await res.json()) as { enrolled: boolean };
        setEnrolled(v.enrolled);
      } catch {
        // Unknown, so stay quiet. Prompting a parent who already recorded
        // reads as the app having forgotten them.
        setEnrolled(true);
      }
    })();
  }, []);

  const rows = packs ?? FALLBACK;

  async function purchase(productId: string) {
    const pack = packs?.find((p) => p.productId === productId);
    if (!pack) return;

    setBusy(productId);
    setFailed(false);
    const result = await buy(pack);
    setBusy(null);

    if (result.status === 'failed') setFailed(true);
    if (result.status === 'ok') {
      /**
       * The store took payment — that does NOT mean credits have landed. They
       * arrive via the RevenueCat webhook, so return to the credits screen,
       * which reads the balance from the server (D-03). The client never adds
       * credits locally, even optimistically.
       */
      router.replace('/credits');
    }
  }

  return (
    <Screen scroll>
      <View style={styles.header}>
        <AppText variant="heading" bold>
          More stories, whenever you need them
        </AppText>
        <AppText variant="body" muted style={styles.sub}>
          Each story is yours to keep and replay as often as they ask — replays
          are always free.
        </AppText>
      </View>

      {rows.map((p, i) => (
        <Animated.View key={p.productId} entering={FadeInDown.delay(i * 90).duration(500)}>
          <Pressable
            onPress={() => void purchase(p.productId)}
            disabled={!packs || busy !== null}
            style={({ pressed }) => [
              styles.pack,
              pressed && styles.packPressed,
              !packs && styles.packLoading,
            ]}
            accessibilityRole="button"
            accessibilityLabel={`${p.credits} stories for ${p.priceString}`}
          >
            <View style={styles.packText}>
              <AppText variant="subheading" bold>
                {p.credits} stories
              </AppText>
              {p.credits === 5 ? (
                <AppText variant="caption" style={{ color: shell.accentWarm }}>
                  Most chosen
                </AppText>
              ) : null}
            </View>
            <AppText variant="subheading" bold>
              {busy === p.productId ? '…' : p.priceString}
            </AppText>
          </Pressable>
        </Animated.View>
      ))}

      {failed ? (
        <AppText variant="caption" center style={styles.failed}>
          That didn&apos;t go through. Nothing was charged — try again whenever you like.
        </AppText>
      ) : null}

      {enrolled === false ? (
        <Animated.View entering={FadeIn.delay(500).duration(700)}>
          <Pressable
            onPress={() => router.push('/consent')}
            style={styles.voiceOffer}
            accessibilityRole="button"
          >
            <AppText variant="subheading" bold>
              Add your voice
            </AppText>
            <AppText variant="body" muted style={styles.voiceBody}>
              You haven&apos;t recorded yours yet. It takes about twenty seconds, and
              every story after it is read in your voice.
            </AppText>
          </Pressable>
        </Animated.View>
      ) : null}

      <View style={styles.actions}>
        <PrimaryButton label="Not tonight" onPress={() => router.replace('/home')} />
      </View>

      {/*
        Restore is here because App Review expects it on any paid app — but
        consumables are NOT restored by the store, so it cannot bring a balance
        back. Signing in is the real recovery path (S-17), and the copy avoids
        implying otherwise.
      */}
      <Pressable onPress={() => void restore()} style={styles.restore} accessibilityRole="button">
        <AppText variant="caption" muted center>
          Restore purchases
        </AppText>
      </Pressable>

      <View style={styles.legal}>
        <AppText variant="caption" muted center>
          No subscription. Nothing renews on its own.
        </AppText>
        <View style={styles.legalLinks}>
          <AppText
            variant="caption"
            muted
            onPress={() => void Linking.openURL('https://snugglee.app/terms')}
            accessibilityRole="link"
            style={styles.link}
          >
            Terms
          </AppText>
          <AppText variant="caption" muted>
            {'  ·  '}
          </AppText>
          <AppText
            variant="caption"
            muted
            onPress={() => void Linking.openURL('https://snugglee.app/privacy')}
            accessibilityRole="link"
            style={styles.link}
          >
            Privacy
          </AppText>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { paddingTop: space.xl, paddingBottom: space.lg },
  sub: { marginTop: space.sm },
  pack: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: shell.surface,
    borderRadius: radius.lg,
    padding: space.lg,
    marginBottom: space.md,
    minHeight: 76,
  },
  packPressed: { opacity: 0.7 },
  packLoading: { opacity: 0.5 },
  packText: { gap: 2 },
  failed: { color: shell.accentWarm, marginBottom: space.md },
  voiceOffer: {
    backgroundColor: shell.surface,
    borderRadius: radius.lg,
    padding: space.lg,
    marginTop: space.lg,
    borderWidth: 1,
    borderColor: shell.accent,
  },
  voiceBody: { marginTop: space.sm },
  actions: { marginTop: space.lg },
  restore: { marginTop: space.lg, padding: space.md },
  legal: { marginTop: space.lg, paddingBottom: space.xl, gap: space.sm },
  legalLinks: { flexDirection: 'row', justifyContent: 'center' },
  link: { textDecorationLine: 'underline' },
});

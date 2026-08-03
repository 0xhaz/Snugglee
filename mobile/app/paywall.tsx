/**
 * S-08 — paywall. Consumable credit packs only.
 *
 * D-02: **no subscription tier, ever.** A nightly-story user costs ~$90/year
 * against any annual price a parent would pay — a structural loss-maker.
 * Consumables align revenue with a marginal cost that is genuinely high
 * (measured $0.247/story, see spike-results/ECONOMICS.md).
 *
 * Pricing rationale, measured COGS and margin analysis live in the internal
 * docs, not here. What matters for this file: flat per-story pricing with no
 * bulk discount, deliberately.
 *
 * ⚠️ Purchases are NOT wired yet — PAY-02/03/04 need the App Store Connect
 * paid-apps agreement (STORE-02), which is still outstanding. The parental gate
 * is in front regardless (§4, S-14).
 */
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { AppText } from '../src/components/AppText';
import { PrimaryButton } from '../src/components/PrimaryButton';
import { Screen } from '../src/components/Screen';
import { config } from '../src/config';
import { getIdToken } from '../src/session';
import { radius, shell, space } from '../src/theme/tokens';

const PACKS = [
  { id: 'com.snugglee.credits.3', stories: 3, price: '$2.99', note: null },
  { id: 'com.snugglee.credits.5', stories: 5, price: '$4.99', note: 'Most chosen' },
  { id: 'com.snugglee.credits.20', stories: 20, price: '$19.99', note: null },
] as const;

export default function Paywall() {
  const router = useRouter();

  /**
   * SECOND CHANCE at voice enrolment.
   *
   * The primary ask is S-04, at the end of the first story, because hearing
   * their own voice is what makes a parent buy — it is the aha moment AND the
   * paywall trigger (D-06). Enrolling only at purchase would move the magic to
   * *after* the decision it is supposed to cause.
   *
   * But a parent who tapped "maybe another night" reaches this screen with no
   * voice. Asking again here costs nothing and catches them at a moment they
   * are already thinking about value.
   *
   * Deliberately shown BELOW the packs, not above: this is an offer, not a
   * toll. Nothing about buying credits requires a voice.
   */
  const [enrolled, setEnrolled] = useState<boolean | null>(null);

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
        // Unknown, so say nothing. Prompting a parent who already recorded
        // would read as the app forgetting them.
        setEnrolled(true);
      }
    })();
  }, []);

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

      {PACKS.map((p, i) => (
        <Animated.View key={p.id} entering={FadeInDown.delay(i * 90).duration(500)}>
          <View style={styles.pack}>
            <View style={styles.packText}>
              <AppText variant="subheading" bold>
                {p.stories} stories
              </AppText>
              {p.note ? (
                <AppText variant="caption" style={{ color: shell.accentWarm }}>
                  {p.note}
                </AppText>
              ) : null}
            </View>
            <AppText variant="subheading" bold>
              {p.price}
            </AppText>
          </View>
        </Animated.View>
      ))}

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
              You haven't recorded yours yet. It takes about twenty seconds, and
              every story after it is read in your voice.
            </AppText>
          </Pressable>
        </Animated.View>
      ) : null}

      <View style={styles.actions}>
        <PrimaryButton
          label="Choose a pack"
          // S-14 sits in front of every purchase flow (§4).
          onPress={() => router.push({ pathname: '/parental-gate', params: { next: '/paywall' } })}
        />
        <View style={styles.later}>
          <AppText variant="body" muted center onPress={() => router.replace('/home')} accessibilityRole="button">
            Not tonight
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
  packText: { gap: 2 },
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
  later: { marginTop: space.lg, padding: space.md, opacity: 0.7 },
});

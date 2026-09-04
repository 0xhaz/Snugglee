/**
 * S-20 — what leaves the phone, and who receives it.
 *
 * **Required by App Store Guideline 5.1.1(i) / 5.1.2(i).** Snugglee was rejected
 * on 2026-08-24 for sharing personal data with third-party services without
 * disclosing what is sent, naming the recipient, and asking permission first.
 * Apple states plainly that putting this in the privacy policy is NOT
 * sufficient — it has to be in the app, before the data moves.
 *
 * So this screen exists to be READ, and it sits in front of the first story
 * rather than behind a settings menu. Three rules held while writing it:
 *
 *   1. **Name the companies.** "Our provider" is what got us rejected. Google
 *      and Cartesia are named, and what each one receives is stated separately.
 *   2. **Say what is NOT sent**, because that is the more surprising half and it
 *      is the part that is actually reassuring. The story text sent to Google
 *      carries a placeholder, never the child's name (server/src/story.ts).
 *   3. **No dark pattern.** Declining is a real button, not grey micro-text.
 *      A parent who says no is told plainly what that means and returned.
 *
 * design.md §3 budgets five seconds from name to theme tiles and this costs one
 * tap of that. It is a fair trade: the alternative is not shipping.
 */
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { AppText } from '../src/components/AppText';
import { PrimaryButton } from '../src/components/PrimaryButton';
import { Screen } from '../src/components/Screen';
import { setAiConsent } from '../src/store';
import { radius, shell, space } from '../src/theme/tokens';

export default function AiNotice() {
  const router = useRouter();
  const [declined, setDeclined] = useState(false);

  async function agree() {
    await setAiConsent();
    router.replace('/home');
  }

  if (declined) {
    return (
      <Screen center scroll>
        <Animated.View entering={FadeIn.duration(400)}>
          <AppText variant="heading" bold center>
            That's completely fine
          </AppText>
          <AppText variant="body" muted center style={styles.body}>
            Snugglee can't make a story without sending the name to be read
            aloud, so there's nothing for us to do here tonight. Nothing has
            been sent, and nothing is stored.
          </AppText>
          <AppText variant="body" muted center style={styles.body}>
            You can change your mind whenever you like.
          </AppText>
          <PrimaryButton label="Go back" onPress={() => setDeclined(false)} />
        </Animated.View>
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <Animated.View entering={FadeIn.duration(500)} style={styles.root}>
        <AppText variant="heading" bold>
          What leaves this phone
        </AppText>
        <AppText variant="body" muted style={styles.lede}>
          Snugglee uses outside services to write and read the story. Here is
          exactly what each one receives.
        </AppText>

        <Party
          who="Cartesia and MiniMax — speech"
          what="Your child's first name, inside the sentences that get read aloud. They turn that text into the voice you hear. It is the one place the name has to go: it cannot be spoken otherwise."
        />
        <Party
          who="Google (Gemini) — story text"
          what="The story wording only. Your child's name is replaced with a blank before it is sent and put back afterwards, on our server — so Google never receives their name."
        />

        <View style={styles.never}>
          <AppText variant="body" bold style={styles.neverTitle}>
            Never sent to anyone
          </AppText>
          <AppText variant="body" muted>
            Their age, your contact details, your location, or anything about
            your device. None of it is used to train anyone's AI.
          </AppText>
        </View>

        <AppText variant="caption" muted style={styles.voiceNote}>
          Recording your own voice is separate, optional, and asked for later —
          with its own explanation before anything is recorded.
        </AppText>

        <PrimaryButton label="I agree — make the story" onPress={() => void agree()} />

        <Pressable
          onPress={() => setDeclined(true)}
          style={styles.decline}
          accessibilityRole="button"
        >
          <AppText variant="body" muted center>
            No, don't send anything
          </AppText>
        </Pressable>
      </Animated.View>
    </Screen>
  );
}

function Party({ who, what }: { who: string; what: string }) {
  return (
    <View style={styles.party}>
      <AppText variant="body" bold>
        {who}
      </AppText>
      <AppText variant="body" muted style={styles.partyBody}>
        {what}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { paddingTop: space.xl, paddingBottom: space.xl },
  body: { marginTop: space.lg, marginBottom: space.lg },
  lede: { marginTop: space.md, marginBottom: space.lg },
  party: {
    backgroundColor: shell.surface,
    borderRadius: radius.md,
    padding: space.md,
    marginBottom: space.md,
  },
  partyBody: { marginTop: space.xs },
  never: { marginTop: space.sm, marginBottom: space.lg },
  neverTitle: { marginBottom: space.xs },
  voiceNote: { marginBottom: space.xl },
  decline: { marginTop: space.lg, padding: space.md },
});

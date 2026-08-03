/**
 * S-04 — the voice hook. Fires at the END of the first story, never before.
 *
 * D-06 and design.md §2, restated because it is the rule most likely to be
 * broken by a well-meaning refactor: **the voice ask never precedes the
 * story.** Moving enrolment into onboarding "to reduce friction later" is the
 * exact failure mode this design exists to prevent — a 90-second wall in front
 * of a user who has not yet received anything.
 *
 * By this point the parent has heard a complete story. The ask lands as an
 * offer rather than a toll.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { AppText } from '../src/components/AppText';
import { PrimaryButton } from '../src/components/PrimaryButton';
import { Screen } from '../src/components/Screen';
import { shell, space } from '../src/theme/tokens';

export default function VoiceHook() {
  const router = useRouter();
  const { childName } = useLocalSearchParams<{ childName: string }>();
  const name = childName ?? 'your child';

  return (
    <Screen center scroll>
      <Animated.View entering={FadeIn.duration(900)}>
        <AppText variant="title" bold center>
          Want the last line in your voice?
        </AppText>

        <AppText variant="body" muted center style={styles.body}>
          Read one short sentence out loud, and {name} will hear the ending in
          your voice — tonight, and any night you're not there.
        </AppText>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(400).duration(700)} style={styles.actions}>
        <PrimaryButton label="Record my voice" onPress={() => router.push({ pathname: '/consent', params: { childName: name } })} />

        {/*
          Declining must be graceful and non-terminal. A parent who says no
          tonight is a parent who might say yes next week; guilt-tripping them
          costs the relationship for a single conversion.
        */}
        <View style={styles.skip}>
          <AppText
            variant="body"
            muted
            center
            onPress={() => router.replace('/home')}
            accessibilityRole="button"
          >
            Maybe another night
          </AppText>
        </View>
      </Animated.View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { marginTop: space.lg, marginBottom: space.xl },
  actions: { marginTop: space.lg },
  skip: { marginTop: space.lg, padding: space.md, opacity: 0.7 },
});

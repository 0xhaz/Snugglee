/**
 * S-17 — link an account. Offered, never demanded.
 *
 * design.md §2: no blocking account wall before first value. §4: prompt to
 * link **after the first purchase, but before the user accumulates credits
 * they could lose with the device.**
 *
 * The reason is concrete rather than housekeeping: credits are *consumable*
 * purchases, and consumables **cannot be restored from the App Store** — Apple
 * only restores non-consumables and subscriptions. The ledger is the only
 * record that someone paid, and it is keyed to a Firebase uid that is
 * device-bound. Without linking, an uninstall silently destroys money the
 * parent handed over, and there is no restore flow to offer them.
 *
 * So the copy talks about *keeping their stories*, not about "creating an
 * account" — that is what is actually at stake, and it is true.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import * as AppleAuthentication from 'expo-apple-authentication';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { AppText } from '../src/components/AppText';
import { Screen } from '../src/components/Screen';
import { canUseApple, canUseGoogle, linkApple, linkGoogle } from '../src/session';
import { radius, shell, space } from '../src/theme/tokens';

export default function LinkAccount() {
  const router = useRouter();
  const { balance } = useLocalSearchParams<{ balance?: string }>();
  const [available, setAvailable] = useState(false);
  const googleAvailable = canUseGoogle();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    void canUseApple().then(setAvailable);
  }, []);

  const count = Number(balance ?? 0);

  async function link() {
    setBusy(true);
    setFailed(false);
    const result = await linkApple();
    setBusy(false);

    if (result.linked) {
      router.back();
      return;
    }
    // Cancelling is a choice, not a failure — say nothing.
    if (result.reason !== 'cancelled') setFailed(true);
  }

  async function linkWithGoogle() {
    setBusy(true);
    setFailed(false);
    const result = await linkGoogle();
    setBusy(false);

    if (result.linked) {
      router.back();
      return;
    }
    if (result.reason !== 'cancelled') setFailed(true);
  }

  return (
    <Screen center scroll>
      <Animated.View entering={FadeIn.duration(500)}>
        <AppText variant="heading" bold center>
          Keep your stories safe
        </AppText>

        <AppText variant="body" muted center style={styles.body}>
          {count > 0
            ? `You have ${count} ${count === 1 ? 'story' : 'stories'} left. Right now they live only on this phone — if you change or reset it, they can't be recovered.`
            : "Your stories and credits live only on this phone right now. If you change or reset it, they can't be recovered."}
        </AppText>

        <AppText variant="body" muted center style={styles.body}>
          Signing in keeps them yours. Nothing else changes, and we never post
          anything.
        </AppText>

        {/*
          Apple first on iOS. Guideline 4.8 requires Sign in with Apple wherever
          a third-party sign-in is offered, and ordering it first is the
          convention reviewers expect.
        */}
        {available ? (
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
            cornerRadius={radius.pill}
            style={styles.appleButton}
            onPress={() => void link()}
          />
        ) : null}

        {/*
          Google covers Android, where Apple sign-in does not exist — and this
          is the ONLY thing standing between an Android parent and permanently
          losing a paid balance on reinstall, since consumables are not
          restorable. Also offered on iOS for parents who live in a Google
          account.
        */}
        {googleAvailable ? (
          <Pressable
            onPress={() => void linkWithGoogle()}
            disabled={busy}
            style={({ pressed }) => [styles.googleButton, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Continue with Google"
          >
            <AppText variant="body" bold center style={styles.googleLabel}>
              Continue with Google
            </AppText>
          </Pressable>
        ) : null}

        {/*
          Neither provider usable — an Android build whose Google client ids are
          not configured yet. Be honest rather than showing a dead end.
        */}
        {!available && !googleAvailable ? (
          <View>
            <AppText variant="body" muted center style={styles.body}>
              Signing in isn't available on this device yet — it's coming soon.
            </AppText>
            <AppText variant="caption" muted center style={styles.body}>
              Until then your stories stay on this phone. If you change devices,
              email hello@snugglee.app and we'll help move them across.
            </AppText>
          </View>
        ) : null}

        {failed ? (
          <AppText variant="caption" center style={{ color: shell.accentWarm }}>
            That didn't take. We can try again any time.
          </AppText>
        ) : null}

        <View style={styles.later}>
          <AppText
            variant="body"
            muted
            center
            onPress={() => router.back()}
            accessibilityRole="button"
          >
            {busy ? 'One moment…' : 'Not now'}
          </AppText>
        </View>
      </Animated.View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { marginTop: space.lg },
  appleButton: { width: '100%', height: 56, marginTop: space.xl },
  // Google's brand guidelines want a light surface with dark text; that also
  // reads correctly against this app's dark ground.
  googleButton: {
    width: '100%',
    height: 56,
    marginTop: space.md,
    borderRadius: radius.pill,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleLabel: { color: '#1F1F1F' },
  pressed: { opacity: 0.7 },
  later: { marginTop: space.lg, padding: space.md, opacity: 0.7 },
});

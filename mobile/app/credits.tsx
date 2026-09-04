/**
 * S-16 — credits: balance, history, purchase.
 *
 * The balance is read from the SERVER, never held locally (D-03). A
 * client-side balance is trivially forged, and this is the number that decides
 * whether a story gets generated. The server derives it by summing an
 * append-only ledger, so this screen is a view onto that and nothing more.
 *
 * Sits behind the parental gate along with S-08 (§4, S-14).
 */
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { AppText } from '../src/components/AppText';
import { PrimaryButton } from '../src/components/PrimaryButton';
import { Screen } from '../src/components/Screen';
import { config } from '../src/config';
import { getIdToken, isLinked } from '../src/session';
import { radius, shell, space } from '../src/theme/tokens';

type Entry = { id: string; delta: number; reason: string; createdAt?: { _seconds?: number } };

const REASON_COPY: Record<string, string> = {
  purchase: 'Credits added',
  story_consumed: 'Story made',
  story_refund: 'Refunded — that story did not finish',
  welcome: 'Your first story, on us',
  promo: 'Gift',
  adjustment: 'Adjustment',
};

export default function Credits() {
  const router = useRouter();
  const [balance, setBalance] = useState<number | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [linked, setLinked] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const token = await getIdToken();
        const headers = { authorization: `Bearer ${token}` };
        const [b, h] = await Promise.all([
          fetch(`${config.apiBaseUrl}/credits`, { headers }).then((r) => r.json()),
          fetch(`${config.apiBaseUrl}/credits/history`, { headers }).then((r) => r.json()),
        ]);
        setBalance((b as { balance: number }).balance);
        setEntries((h as { entries: Entry[] }).entries ?? []);
        setLinked(isLinked());
      } catch {
        setBalance(0);
      }
    })();
  }, []);

  return (
    <Screen scroll>
      <View style={styles.header}>
        <AppText variant="body" muted>
          Stories left
        </AppText>
        <AppText variant="display" bold>
          {balance ?? '—'}
        </AppText>
        <AppText variant="body" muted style={styles.note}>
          Stories you've already made are always free to hear again.
        </AppText>
      </View>

      {/*
        Prompted HERE rather than on first launch: §4 says after the first
        purchase, before credits accumulate. A balance above zero is exactly
        that moment, and it is the only point where the parent has something
        to lose — consumables cannot be restored from the App Store, so this
        link is the sole protection on money they have already paid.
      */}
      {!linked && (balance ?? 0) > 0 ? (
        <Pressable
          onPress={() => router.push({ pathname: '/link-account', params: { balance: String(balance) } })}
          style={styles.protect}
          accessibilityRole="button"
        >
          <AppText variant="body" bold>
            Keep these safe
          </AppText>
          <AppText variant="caption" muted style={styles.protectBody}>
            They live only on this phone. Sign in so they follow you.
          </AppText>
        </Pressable>
      ) : null}

      <PrimaryButton
        label="Get more stories"
        onPress={() => router.push({ pathname: '/parental-gate', params: { next: '/paywall' } })}
      />

      {entries.length ? (
        <View style={styles.history}>
          <AppText variant="caption" muted style={styles.label}>
            History
          </AppText>
          {entries.map((e, i) => (
            <Animated.View key={e.id} entering={FadeInDown.delay(i * 40).duration(350)}>
              <View style={styles.row}>
                <AppText variant="body">{REASON_COPY[e.reason] ?? e.reason}</AppText>
                <AppText variant="body" bold style={{ color: e.delta > 0 ? shell.accent : shell.textMuted }}>
                  {e.delta > 0 ? `+${e.delta}` : e.delta}
                </AppText>
              </View>
            </Animated.View>
          ))}
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { paddingTop: space.xxl, paddingBottom: space.xl, alignItems: 'center' },
  note: { marginTop: space.md, textAlign: 'center' },
  protect: {
    backgroundColor: shell.surface,
    borderRadius: radius.lg,
    padding: space.lg,
    marginBottom: space.lg,
    borderWidth: 1,
    borderColor: shell.accent,
  },
  protectBody: { marginTop: space.xs },
  history: { marginTop: space.xxl },
  label: { marginBottom: space.md, textTransform: 'uppercase', letterSpacing: 1 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: shell.surface,
    borderRadius: radius.md,
    padding: space.md,
    marginBottom: space.sm,
    minHeight: 56,
  },
});

/**
 * S-19 — profile, child switching and quick navigation.
 *
 * design.md §5 rejects a five-tab bottom bar, and that still holds: this is
 * reached from one quiet mark on the home header, not from persistent chrome.
 * But "no catalogue navigation" was being read as "no navigation", which left
 * credits, packs and voice settings each reachable from exactly one place —
 * and voice enrolment reachable only from a screen that fires once.
 *
 * ── SIBLINGS ───────────────────────────────────────────────────────────────
 * A household has more than one child, and each has their own library (see
 * store.ts). This is where the parent switches between them, adds one, or
 * corrects a name.
 *
 * Switching is instantaneous and unconfirmed — it is reversible in one tap, so
 * a dialog would be friction for nothing. REMOVING is confirmed, because it
 * takes that child's stories with it.
 *
 * D-13 — first name and an AGE BAND, never a birthday, and it stays on device.
 */
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { AppText } from '../src/components/AppText';
import { Screen } from '../src/components/Screen';
import { config } from '../src/config';
import { getIdToken, isLinked } from '../src/session';
import {
  addChild,
  getChild,
  listChildren,
  removeChild,
  setActiveChild,
  updateChild,
  type ChildProfile,
} from '../src/store';
import { radius, shell, space, type } from '../src/theme/tokens';

const MAX_NAME = 24;

const BANDS: NonNullable<ChildProfile['ageBand']>[] = ['2-3', '4-6', '7-8'];

export default function Profile() {
  const router = useRouter();
  const [children, setChildren] = useState<ChildProfile[]>([]);
  const [active, setActive] = useState<ChildProfile | null>(null);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [enrolled, setEnrolled] = useState<boolean | null>(null);
  const [linked, setLinked] = useState(true);

  const refresh = useCallback(async () => {
    const [list, current] = await Promise.all([listChildren(), getChild()]);
    setChildren(list);
    setActive(current);
  }, []);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      (async () => {
        await refresh();
        if (!alive) return;
        setLinked(isLinked());

        try {
          const token = await getIdToken();
          const res = await fetch(`${config.apiBaseUrl}/voice`, {
            headers: { authorization: `Bearer ${token}` },
          });
          const json = (await res.json()) as { enrolled: boolean };
          if (alive) setEnrolled(json.enrolled);
        } catch {
          if (alive) setEnrolled(null);
        }
      })();
      return () => {
        alive = false;
      };
    }, [refresh]),
  );

  /**
   * Persisted on every keystroke — there is no save button to forget to press.
   * A rename keeps this child's stories; only the spelling changes.
   */
  async function rename(value: string) {
    if (!active) return;
    const next = { ...active, name: value };
    setActive(next); // optimistic, so the field stays responsive
    setChildren((cs) => cs.map((c) => (c.id === active.id ? next : c)));
    if (value.trim()) await updateChild(active.id, { name: value.trim() });
  }

  async function setBand(band: ChildProfile['ageBand']) {
    if (!active) return;
    setActive({ ...active, ageBand: band });
    await updateChild(active.id, { ageBand: band });
    await refresh();
  }

  async function switchTo(id: string) {
    await setActiveChild(id);
    await refresh();
  }

  async function commitNewChild() {
    const trimmed = newName.trim();
    if (!trimmed) {
      setAdding(false);
      return;
    }
    await addChild(trimmed.slice(0, MAX_NAME));
    setNewName('');
    setAdding(false);
    await refresh();
  }

  function confirmRemove(child: ChildProfile) {
    Alert.alert(
      `Remove ${child.name}?`,
      'Their stories will be removed too. This cannot be undone.',
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              await removeChild(child.id);
              await refresh();
            })();
          },
        },
      ],
    );
  }

  return (
    <Screen scroll>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" style={styles.back}>
          <AppText variant="body" muted>
            ‹ Stories
          </AppText>
        </Pressable>
      </View>

      <AppText variant="title" bold style={styles.title}>
        Profile
      </AppText>

      {/* ---------------------------- who ---------------------------- */}
      <AppText variant="caption" muted style={styles.label}>
        {children.length > 1 ? 'STORIES ARE FOR' : 'WHO THE STORIES ARE FOR'}
      </AppText>

      {children.length > 1 ? (
        <View style={styles.chips}>
          {children.map((c) => (
            <Pressable
              key={c.id}
              onPress={() => void switchTo(c.id)}
              onLongPress={() => confirmRemove(c)}
              style={({ pressed }) => [
                styles.chip,
                c.id === active?.id && styles.chipOn,
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected: c.id === active?.id }}
              accessibilityLabel={`${c.name}${c.id === active?.id ? ', selected' : ''}. Long press to remove.`}
            >
              <AppText
                variant="body"
                bold={c.id === active?.id}
                style={c.id === active?.id ? styles.chipOnText : undefined}
              >
                {c.name}
              </AppText>
            </Pressable>
          ))}
        </View>
      ) : null}

      <TextInput
        value={active?.name ?? ''}
        onChangeText={(v) => void rename(v.slice(0, MAX_NAME))}
        placeholder="Their first name"
        placeholderTextColor={shell.textMuted}
        style={styles.input}
        maxLength={MAX_NAME}
        accessibilityLabel="Child's first name"
      />

      <AppText variant="caption" muted style={styles.label}>
        AGE
      </AppText>
      <View style={styles.chips}>
        {BANDS.map((b) => (
          <Pressable
            key={b}
            onPress={() => void setBand(b)}
            style={({ pressed }) => [
              styles.chip,
              active?.ageBand === b && styles.chipOn,
              pressed && styles.pressed,
            ]}
            accessibilityRole="button"
            accessibilityState={{ selected: active?.ageBand === b }}
          >
            {/* Selected sits on `accent`, which white fails against — the
                ground colour is the readable choice on that fill. */}
            <AppText
              variant="body"
              bold={active?.ageBand === b}
              style={active?.ageBand === b ? styles.chipOnText : undefined}
            >
              {b}
            </AppText>
          </Pressable>
        ))}
      </View>

      {adding ? (
        <TextInput
          value={newName}
          onChangeText={setNewName}
          onSubmitEditing={() => void commitNewChild()}
          onBlur={() => void commitNewChild()}
          placeholder="Their first name"
          placeholderTextColor={shell.textMuted}
          autoFocus
          autoCapitalize="words"
          autoCorrect={false}
          returnKeyType="done"
          maxLength={MAX_NAME}
          style={styles.input}
          accessibilityLabel="New child's first name"
        />
      ) : (
        <Pressable
          onPress={() => setAdding(true)}
          style={({ pressed }) => [styles.add, pressed && styles.pressed]}
          accessibilityRole="button"
        >
          <AppText variant="body" style={styles.addText}>
            + Add another child
          </AppText>
        </Pressable>
      )}

      {children.length > 1 ? (
        <AppText variant="caption" muted style={styles.hint}>
          Each child has their own stories. Long press a name to remove them.
        </AppText>
      ) : null}

      {/* -------------------------- elsewhere -------------------------- */}
      <View style={styles.group}>
        <Row
          label="Your voice"
          hint={
            enrolled === null
              ? 'Manage in Privacy'
              : enrolled
                ? 'Ready — stories play in your voice'
                : 'Not set up yet'
          }
          onPress={() =>
            enrolled
              ? router.push('/privacy')
              : router.push({ pathname: '/consent', params: { childName: active?.name ?? '' } })
          }
        />
        <Row label="Credits" hint="Balance and history" onPress={() => router.push('/credits')} />
        <Row
          label="Story packs"
          hint="Add more stories"
          // Purchase is gated (§4, S-14).
          onPress={() => router.push({ pathname: '/parental-gate', params: { next: '/paywall' } })}
        />
        {!linked ? (
          <Row
            label="Save your stories"
            hint="Link an account so they survive a new phone"
            onPress={() => router.push('/link-account')}
          />
        ) : null}
        <Row
          label="Privacy & your voice"
          hint="Delete your voice or your account"
          onPress={() => router.push('/privacy')}
        />
      </View>
    </Screen>
  );
}

function Row({ label, hint, onPress }: { label: string; hint: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`${label}. ${hint}.`}
    >
      <View style={styles.rowText}>
        <AppText variant="body" bold>
          {label}
        </AppText>
        <AppText variant="caption" muted>
          {hint}
        </AppText>
      </View>
      <AppText variant="body" muted>
        ›
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { paddingTop: space.md },
  back: { paddingVertical: space.sm },
  title: { paddingTop: space.md, paddingBottom: space.xl },
  label: { marginBottom: space.sm, textTransform: 'uppercase', letterSpacing: 1 },
  input: {
    fontSize: type.body,
    color: shell.text,
    backgroundColor: shell.surface,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    marginBottom: space.xl,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginBottom: space.md },
  chip: {
    paddingVertical: space.sm,
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    backgroundColor: shell.surface,
  },
  chipOn: { backgroundColor: shell.accent },
  chipOnText: { color: shell.background },
  add: { paddingVertical: space.md },
  addText: { color: shell.accent },
  hint: { marginTop: space.xs, marginBottom: space.lg },
  group: { marginTop: space.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md },
  rowText: { flex: 1, gap: 2 },
  pressed: { opacity: 0.6 },
});

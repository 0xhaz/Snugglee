/**
 * Screen container. Handles safe areas and the register background.
 *
 * Responsive by construction: no hardcoded widths anywhere, and content is
 * centred with a max width so the same code works on a phone and an iPad
 * (design.md §9 — build responsive from the first commit, declare iPad in
 * submission week). `maxWidth` is a cap, never a fixed size.
 */
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RegisterContext, registers, type RegisterName } from '../theme/useRegister';
import { space } from '../theme/tokens';

type Props = {
  children: ReactNode;
  register?: RegisterName;
  /** Player screens are full-bleed; shell screens get padding and a max width. */
  bleed?: boolean;
  scroll?: boolean;
  center?: boolean;
};

export function Screen({
  children,
  register = 'shell',
  bleed = false,
  scroll = false,
  center = false,
}: Props) {
  const insets = useSafeAreaInsets();
  const tokens = registers[register];

  const body = (
    <View
      style={[
        styles.inner,
        !bleed && styles.padded,
        center && styles.center,
        // Cap rather than fix — on a phone this is a no-op, on a tablet it
        // stops text running to absurd line lengths.
        !bleed && styles.capped,
      ]}
    >
      {children}
    </View>
  );

  return (
    <RegisterContext.Provider value={tokens}>
      <View
        style={[
          styles.root,
          { backgroundColor: tokens.background, paddingTop: insets.top, paddingBottom: insets.bottom },
        ]}
      >
        {scroll ? (
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {body}
          </ScrollView>
        ) : (
          body
        )}
      </View>
    </RegisterContext.Provider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  inner: { flex: 1, width: '100%' },
  padded: { paddingHorizontal: space.lg },
  capped: { maxWidth: 640, alignSelf: 'center' },
  center: { justifyContent: 'center' },
});

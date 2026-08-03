/**
 * The single large rounded primary action (design.md §5).
 *
 * Haptics are wired here rather than at call sites so the rule from §7 holds
 * automatically: **soft and rare**. A bedtime app that buzzes frequently
 * defeats itself, so this fires the lightest impact iOS offers, and respects
 * the user's disable preference.
 */
import * as Haptics from 'expo-haptics';
import { ActivityIndicator, Pressable, StyleSheet, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { motion, radius, space } from '../theme/tokens';
import { useRegister } from '../theme/useRegister';
import { AppText } from './AppText';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Props = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  haptics?: boolean;
  style?: ViewStyle;
};

export function PrimaryButton({
  label,
  onPress,
  disabled,
  busy,
  haptics = true,
  style,
}: Props) {
  const reg = useRegister();
  const pressed = useSharedValue(0);

  const animated = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - pressed.value * 0.02 }],
    opacity: 1 - pressed.value * 0.15,
  }));

  const inactive = disabled || busy;

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy }}
      disabled={inactive}
      onPressIn={() => (pressed.value = withTiming(1, { duration: motion.tapMs }))}
      onPressOut={() => (pressed.value = withTiming(0, { duration: motion.tapMs }))}
      onPress={() => {
        if (haptics) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft);
        onPress();
      }}
      style={[
        styles.base,
        { backgroundColor: reg.accent, opacity: inactive ? 0.45 : 1 },
        animated,
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={reg.background} />
      ) : (
        <AppText variant="subheading" bold center style={{ color: reg.background }}>
          {label}
        </AppText>
      )}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  base: {
    // No fixed width — fills its container so phone and tablet both work.
    width: '100%',
    minHeight: 56,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.lg,
  },
});

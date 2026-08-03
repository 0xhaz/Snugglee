/**
 * Text primitive bound to the type scale and the active register.
 *
 * Exists so no screen writes a raw fontSize or colour. The scale is
 * deliberately short (six steps) — the surface is thin, and every extra step
 * is one more thing to keep consistent under time pressure.
 */
import { Text, type TextProps, type TextStyle } from 'react-native';

import { lineHeight, type as typeScale, weight } from '../theme/tokens';
import { useRegister } from '../theme/useRegister';

type Variant = keyof typeof typeScale;

type Props = TextProps & {
  variant?: Variant;
  /** Muted is the register's secondary colour, not an opacity hack. */
  muted?: boolean;
  bold?: boolean;
  center?: boolean;
  /** Story body copy — read aloud, so it gets the relaxed line height. */
  story?: boolean;
};

export function AppText({
  variant = 'body',
  muted,
  bold,
  center,
  story,
  style,
  ...rest
}: Props) {
  const reg = useRegister();
  // `story` overrides the variant size — narration is the content, and it is
  // read in the lowest light of any screen in the app.
  const size = story ? typeScale.story : typeScale[variant];

  const resolved: TextStyle = {
    fontSize: size,
    lineHeight:
      size * (story ? lineHeight.relaxed : variant === 'display' || variant === 'title' ? lineHeight.tight : lineHeight.normal),
    color: muted ? reg.textMuted : reg.text,
    fontWeight: bold ? weight.bold : weight.regular,
    textAlign: center ? 'center' : undefined,
  };

  return <Text {...rest} style={[resolved, style]} />;
}

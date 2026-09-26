import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, glow, mono, space, TOUCH } from '../../theme';

export function SysButton({
  label,
  onPress,
  disabled,
  busy,
  tone = 'system',
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  tone?: 'system' | 'quiet' | 'danger';
}) {
  const color = tone === 'danger' ? colors.danger : colors.accent;
  const quiet = tone === 'quiet';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!(disabled || busy), busy: !!busy }}
      style={({ pressed }) => [
        styles.button,
        { borderColor: quiet ? colors.borderDim : color },
        !quiet && glow(color, 8),
        quiet && { backgroundColor: 'transparent' },
        (pressed || disabled) && { opacity: 0.55 },
      ]}
    >
      {busy ? <ActivityIndicator color={color} /> : <Text style={[styles.label, { color: quiet ? colors.textDim : color }]}>{label}</Text>}
    </Pressable>
  );
}

/** A thin glowing progress bar. */
export function Bar({ value, color = colors.accent, height = 8 }: { value: number; color?: string; height?: number }) {
  const pct = Math.max(0, Math.min(1, value));
  return (
    <View
      style={[styles.track, { height, borderRadius: height / 2 }]}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(pct * 100) }}
    >
      <View style={[{ width: `${pct * 100}%`, height, borderRadius: height / 2, backgroundColor: color }, glow(color, 6)]} />
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: TOUCH,
    borderWidth: 1.5,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space(4),
    backgroundColor: 'rgba(30, 90, 170, 0.25)',
    marginTop: space(3),
  },
  label: { fontFamily: mono, fontWeight: '700', letterSpacing: 2, fontSize: 15 },
  track: { backgroundColor: 'rgba(88,195,255,0.12)', overflow: 'hidden', flex: 1 },
});

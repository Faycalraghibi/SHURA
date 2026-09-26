import type { ReactNode } from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { colors, glow, mono, space } from '../../theme';

/** A System window: translucent blue panel, glowing border, bracketed header. */
export function Window({
  title,
  children,
  tone = 'system',
  style,
}: {
  title?: string;
  children: ReactNode;
  tone?: 'system' | 'warn' | 'danger' | 'gold';
  style?: ViewStyle;
}) {
  const color = { system: colors.border, warn: colors.warn, danger: colors.danger, gold: colors.gold }[tone];
  return (
    <View style={[styles.window, { borderColor: color }, glow(color, 10), style]}>
      {title ? (
        <View style={[styles.header, { borderBottomColor: color }]}>
          <Text style={[styles.title, { color }]} accessibilityRole="header">
            {title}
          </Text>
        </View>
      ) : null}
      <View style={styles.body}>{children}</View>
    </View>
  );
}

export function Label({ children, style }: { children: ReactNode; style?: object }) {
  return <Text style={[styles.label, style]}>{children}</Text>;
}

export function SysText({
  children,
  dim,
  style,
  selectable,
}: {
  children: ReactNode;
  dim?: boolean;
  style?: object;
  selectable?: boolean;
}) {
  return (
    <Text selectable={selectable} style={[styles.text, dim && { color: colors.textDim }, style]}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  window: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderRadius: 6,
    marginBottom: space(4),
  },
  header: {
    borderBottomWidth: 1,
    paddingVertical: space(2),
    alignItems: 'center',
  },
  title: { fontFamily: mono, fontWeight: '700', letterSpacing: 3, fontSize: 14 },
  body: { padding: space(4) },
  label: { color: colors.textDim, fontFamily: mono, fontSize: 11, letterSpacing: 2, marginBottom: space(1) },
  text: { color: colors.text, fontSize: 15, lineHeight: 22 },
});

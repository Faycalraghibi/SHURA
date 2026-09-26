import { StyleSheet, Text, View } from 'react-native';

import type { Tier } from '../lib/types';
import { rankColors } from '../theme';

export function RankBadge({ tier, size = 28, dimmed = false }: { tier: Tier; size?: number; dimmed?: boolean }) {
  const color = rankColors[tier];
  return (
    <View
      accessibilityLabel={`Rank ${tier}`}
      style={[
        styles.badge,
        { width: size, height: size, borderRadius: size / 4, borderColor: color, opacity: dimmed ? 0.45 : 1 },
      ]}
    >
      <Text style={[styles.text, { color, fontSize: size * 0.55 }]}>{tier}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  text: { fontWeight: '800' },
});

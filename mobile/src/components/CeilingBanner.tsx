import { StyleSheet, Text, View } from 'react-native';

import { t } from '../i18n/en';
import type { PackSummary } from '../lib/types';
import { colors, rankColors, space } from '../theme';

export function CeilingBanner({ pack }: { pack: PackSummary }) {
  const ceiling = pack.verified_ceiling;
  const full = ceiling === 'S';
  return (
    <View
      style={[styles.banner, { borderColor: ceiling ? rankColors[ceiling] : colors.warn }]}
      accessibilityRole="summary"
    >
      <View style={styles.row}>
        <Text style={[styles.label, { color: ceiling ? rankColors[ceiling] : colors.warn }]}>
          {ceiling ? t.ceilingLabel(ceiling) : t.ceilingNone}
        </Text>
        <Text style={styles.maturity}>{t.maturity[pack.maturity]}</Text>
      </View>
      {!full && <Text style={styles.body}>{pack.ceiling_message}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    marginHorizontal: space(4),
    marginBottom: space(2),
    padding: space(3),
    borderRadius: 12,
    borderWidth: 1,
    backgroundColor: colors.surface,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { fontWeight: '700', fontSize: 14 },
  maturity: { color: colors.textDim, fontSize: 12 },
  body: { color: colors.textDim, fontSize: 13, marginTop: space(1), lineHeight: 18 },
});

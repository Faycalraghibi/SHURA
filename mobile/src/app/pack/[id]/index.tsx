import { router, Stack, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CeilingBanner } from '../../../components/CeilingBanner';
import { RankMap } from '../../../components/RankMap';
import { t } from '../../../i18n/en';
import { usePack } from '../../../lib/usePack';
import { colors, space } from '../../../theme';

export default function PackScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { pack, loading, missing, reload } = usePack(id);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }
  if (missing || !pack) {
    return (
      <View style={styles.center}>
        <Text style={styles.dim}>{t.notFound}</Text>
        <Pressable onPress={reload} style={styles.retry} accessibilityRole="button">
          <Text style={styles.retryText}>{t.retry}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom', 'left', 'right']}>
      <Stack.Screen options={{ title: pack.name }} />
      <Text style={styles.scope}>{pack.scope}</Text>
      <CeilingBanner pack={pack} />
      <RankMap
        competencies={pack.competencies}
        ceiling={pack.verified_ceiling}
        onOpen={(cid) => router.push({ pathname: '/pack/[id]/[cid]', params: { id: pack.pack, cid } })}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg, padding: space(6) },
  dim: { color: colors.textDim, textAlign: 'center' },
  scope: { color: colors.textDim, fontSize: 13, marginHorizontal: space(4), marginBottom: space(2), lineHeight: 18 },
  retry: { marginTop: space(4), paddingHorizontal: space(6), minHeight: 44, justifyContent: 'center', borderRadius: 22, backgroundColor: colors.surfaceHigh },
  retryText: { color: colors.text, fontWeight: '700' },
});

import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { RankBadge } from '../components/RankBadge';
import { t } from '../i18n/en';
import { listPacks, requestSkill, type DataSource } from '../lib/api';
import type { PackSummary } from '../lib/types';
import { colors, rankColors, space, TOUCH } from '../theme';

export default function Home() {
  const [packs, setPacks] = useState<PackSummary[]>([]);
  const [source, setSource] = useState<DataSource | null>(null);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [queued, setQueued] = useState<string | null>(null);

  useEffect(() => {
    listPacks().then(({ data, source: src }) => {
      setPacks(data);
      setSource(src);
    });
  }, []);

  const submit = async () => {
    const text = query.trim();
    if (!text || busy) return;
    setBusy(true);
    setQueued(null);
    const { data } = await requestSkill(text);
    setBusy(false);
    if (data.status === 'matched') {
      router.push({ pathname: '/pack/[id]', params: { id: data.pack } });
    } else {
      setQueued(text);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView style={styles.flex} behavior="height">
        <FlatList
          data={packs}
          keyExtractor={(p) => p.pack}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <View>
              <Text style={styles.logo}>{t.appName}</Text>
              <Text style={styles.tagline}>{t.tagline}</Text>

              <View style={styles.searchRow}>
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  onSubmitEditing={submit}
                  placeholder={t.searchPlaceholder}
                  placeholderTextColor={colors.textDim}
                  accessibilityLabel={t.searchA11y}
                  returnKeyType="go"
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={styles.input}
                />
              </View>
              <Pressable
                onPress={submit}
                disabled={busy || !query.trim()}
                style={({ pressed }) => [styles.button, (pressed || busy || !query.trim()) && styles.buttonDim]}
                accessibilityRole="button"
              >
                {busy ? <ActivityIndicator color={colors.bg} /> : <Text style={styles.buttonText}>{t.searchButton}</Text>}
              </Pressable>

              {queued && (
                <View style={styles.queued} accessibilityLiveRegion="polite">
                  <Text style={styles.queuedTitle}>{t.queuedTitle}</Text>
                  <Text style={styles.queuedBody}>{t.queuedBody(queued)}</Text>
                </View>
              )}

              <Text style={styles.section}>{t.packsTitle}</Text>
              {source === 'bundled' && <Text style={styles.offline}>{t.offline}</Text>}
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push({ pathname: '/pack/[id]', params: { id: item.pack } })}
              style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
              accessibilityRole="button"
              accessibilityLabel={`${item.name}. ${t.competencies(item.competency_count)}. ${item.ceiling_message}`}
            >
              <View style={styles.cardText}>
                <Text style={styles.cardTitle}>{item.name}</Text>
                <Text style={styles.cardScope} numberOfLines={2}>
                  {item.scope}
                </Text>
                <Text style={styles.cardMeta}>
                  {t.competencies(item.competency_count)} · {t.maturity[item.maturity]}
                </Text>
              </View>
              <View style={styles.cardRank}>
                <Text style={[styles.ceilingSmall, { color: rankColors.F }]}>F →</Text>
                {item.verified_ceiling ? <RankBadge tier={item.verified_ceiling} /> : <Text style={styles.ceilingSmall}>—</Text>}
              </View>
            </Pressable>
          )}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  list: { padding: space(4), paddingBottom: space(10) },
  logo: { color: colors.text, fontSize: 40, fontWeight: '900', letterSpacing: 6, marginTop: space(6) },
  tagline: { color: colors.textDim, fontSize: 16, marginTop: space(1), marginBottom: space(6) },
  searchRow: { flexDirection: 'row' },
  input: {
    flex: 1,
    minHeight: TOUCH + 4,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    fontSize: 17,
    paddingHorizontal: space(4),
  },
  button: {
    minHeight: TOUCH,
    marginTop: space(3),
    borderRadius: 12,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDim: { opacity: 0.6 },
  buttonText: { color: colors.bg, fontWeight: '800', fontSize: 16 },
  queued: {
    marginTop: space(4),
    padding: space(4),
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderLeftWidth: 3,
    borderLeftColor: colors.warn,
  },
  queuedTitle: { color: colors.text, fontWeight: '700', marginBottom: space(1) },
  queuedBody: { color: colors.textDim, lineHeight: 20 },
  section: { color: colors.text, fontSize: 18, fontWeight: '800', marginTop: space(8), marginBottom: space(2) },
  offline: { color: colors.textDim, fontSize: 12, marginBottom: space(2) },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: space(4),
    marginBottom: space(3),
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardPressed: { backgroundColor: colors.surfaceHigh },
  cardText: { flex: 1, marginRight: space(3) },
  cardTitle: { color: colors.text, fontSize: 18, fontWeight: '800' },
  cardScope: { color: colors.textDim, fontSize: 13, marginTop: space(1), lineHeight: 18 },
  cardMeta: { color: colors.textDim, fontSize: 12, marginTop: space(2) },
  cardRank: { flexDirection: 'row', alignItems: 'center', gap: space(1.5) },
  ceilingSmall: { color: colors.textDim, fontWeight: '700' },
});

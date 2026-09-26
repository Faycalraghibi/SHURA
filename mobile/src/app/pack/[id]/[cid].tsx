import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { RankBadge } from '../../../components/RankBadge';
import { t } from '../../../i18n/en';
import { tierIndex } from '../../../lib/types';
import { usePack } from '../../../lib/usePack';
import { colors, rankColors, space, TOUCH } from '../../../theme';

export default function CompetencyScreen() {
  const { id, cid } = useLocalSearchParams<{ id: string; cid: string }>();
  const { pack } = usePack(id);
  const c = pack?.competencies.find((x) => x.id === cid);
  if (!pack || !c) {
    return (
      <View style={styles.center}>
        <Text style={styles.dim}>{t.notFound}</Text>
      </View>
    );
  }

  const byId = new Map(pack.competencies.map((x) => [x.id, x]));
  const unlocks = pack.competencies.filter((x) => x.prerequisites.includes(c.id));
  const above = !pack.verified_ceiling || tierIndex(c.tier) > tierIndex(pack.verified_ceiling);
  const open = (target: string) => router.setParams({ cid: target });

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: t.rankLabel(c.tier) }} />
      <View style={styles.header}>
        <RankBadge tier={c.tier} size={44} />
        <Text style={styles.title}>{c.name}</Text>
      </View>

      {above && (
        <View style={styles.warn}>
          <Text style={styles.warnText}>{t.aboveCeiling}</Text>
        </View>
      )}

      <Section title={t.masteryCriteria}>
        <Text style={styles.body}>{c.mastery_criteria}</Text>
      </Section>

      <Section title={t.evidence}>
        <Text style={[styles.pill, { borderColor: rankColors[c.tier] }]}>
          {t.verifiability[c.verifiability ?? 'none']}
        </Text>
        {c.adapters.map((a) => (
          <Text key={a} style={styles.bullet}>
            • {t.adapters[a] ?? a}
          </Text>
        ))}
      </Section>

      {c.common_mistakes.length > 0 && (
        <Section title={t.commonMistakes}>
          {c.common_mistakes.map((m) => (
            <Text key={m} style={styles.bullet}>
              • {m}
            </Text>
          ))}
        </Section>
      )}

      <Section title={t.prerequisites}>
        {c.prerequisites.length === 0 && <Text style={styles.dim}>{t.noPrerequisites}</Text>}
        {c.prerequisites.map((p) => {
          const pre = byId.get(p);
          return pre ? (
            <LinkRow key={p} label={pre.name} tier={pre.tier} onPress={() => open(p)} />
          ) : (
            <Text key={p} style={styles.bullet}>
              • {p}
            </Text>
          );
        })}
      </Section>

      {unlocks.length > 0 && (
        <Section title={t.unlocks}>
          {unlocks.map((u) => (
            <LinkRow key={u.id} label={u.name} tier={u.tier} onPress={() => open(u.id)} />
          ))}
        </Section>
      )}

      <Section title={t.sources}>
        {c.grounded_in.map((sid) => {
          const s = pack.sources.find((x) => x.id === sid);
          if (!s) return null;
          return (
            <Text
              key={sid}
              style={[styles.bullet, s.url ? styles.link : null]}
              onPress={s.url ? () => Linking.openURL(s.url!) : undefined}
              accessibilityRole={s.url ? 'link' : 'text'}
            >
              • {s.title}
            </Text>
          );
        })}
      </Section>
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function LinkRow({ label, tier, onPress }: { label: string; tier: import('../../../lib/types').Tier; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.linkRow, pressed && { opacity: 0.7 }]} accessibilityRole="button">
      <RankBadge tier={tier} size={24} />
      <Text style={styles.linkRowText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space(4), paddingBottom: space(12) },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: space(3) },
  title: { color: colors.text, fontSize: 22, fontWeight: '800', flex: 1 },
  warn: { marginTop: space(4), padding: space(3), borderRadius: 10, backgroundColor: 'rgba(242,184,75,0.12)' },
  warnText: { color: colors.warn, lineHeight: 19 },
  section: { marginTop: space(6) },
  sectionTitle: { color: colors.textDim, fontSize: 12, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase', marginBottom: space(2) },
  body: { color: colors.text, fontSize: 16, lineHeight: 23 },
  bullet: { color: colors.text, fontSize: 15, lineHeight: 24 },
  dim: { color: colors.textDim },
  link: { color: colors.accent, textDecorationLine: 'underline' },
  pill: {
    alignSelf: 'flex-start',
    color: colors.text,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: space(2.5),
    paddingVertical: space(1),
    marginBottom: space(2),
    fontSize: 13,
    overflow: 'hidden',
  },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: space(3), minHeight: TOUCH },
  linkRowText: { color: colors.text, fontSize: 15, flex: 1 },
});
